// src/systems/defis/index.js — Système de défis communautaires avec récompenses XP + Kakera
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Defi   = require('../../db/models/Defi');
const Config = require('../../db/models/Config');
const User   = require('../../db/models/User');
const logger = require('../../utils/logger');

// ── Types de défis prédéfinis ─────────────────────────────────────────────
const DEFI_TEMPLATES = [
  {
    type: 'messages',
    title: '💬 Tempête de messages',
    description: 'Envoie {target} messages dans le serveur cette semaine !',
    defaultTarget: 50,
    defaultXp: 60,
    defaultKakera: 200,
    emoji: '💬',
  },
  {
    type: 'bumps',
    title: '🚀 Bumper intensif',
    description: 'Bumpe le serveur {target} fois cette semaine !',
    defaultTarget: 5,
    defaultXp: 80,
    defaultKakera: 300,
    emoji: '🚀',
  },
  {
    type: 'invites',
    title: '📨 Recruteur en chef',
    description: 'Invite {target} membres sur le serveur !',
    defaultTarget: 3,
    defaultXp: 150,
    defaultKakera: 500,
    emoji: '📨',
  },
  {
    type: 'vocal',
    title: '🎙️ Voix de la communauté',
    description: 'Passe {target} heures en vocal cette semaine !',
    defaultTarget: 5,
    defaultXp: 70,
    defaultKakera: 250,
    emoji: '🎙️',
  },
  {
    type: 'custom',
    title: '⚡ Défi spécial',
    description: 'Défi personnalisé par les admins !',
    defaultTarget: null,
    defaultXp: 100,
    defaultKakera: 400,
    emoji: '⚡',
  },
];

function formatRelative(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}
function formatDate(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

// ── Construire l'embed d'un défi actif ────────────────────────────────────
function buildDefiEmbed(defi, guild) {
  const participantCount = defi.participants.size;
  const template = DEFI_TEMPLATES.find(t => t.type === defi.type) || DEFI_TEMPLATES[4];
  const isEnded = defi.ended || Date.now() > defi.endAt;

  const rewardParts = [];
  if (defi.rewardXp > 0)     rewardParts.push(`**+${defi.rewardXp} XP King** 👑`);
  if (defi.rewardKakera > 0) rewardParts.push(`**${defi.rewardKakera} kakera** 💎`);
  if (defi.rewardRoleId)     rewardParts.push(`Rôle spécial <@&${defi.rewardRoleId}>`);

  const desc = defi.description.replace('{target}', defi.target ?? '?');

  const embed = new EmbedBuilder()
    .setColor(isEnded ? 0x2b2d31 : 0xe74c3c)
    .setTitle(`${template.emoji} ${isEnded ? '[TERMINÉ] ' : ''}${defi.title}`)
    .setDescription(desc)
    .addFields(
      { name: '🎁 Récompenses',  value: rewardParts.join('\n') || '*Aucune*', inline: true },
      { name: '👥 Participants', value: `${participantCount}`, inline: true },
      { name: isEnded ? '⏰ Terminé' : '⏳ Se termine', value: `${formatDate(defi.endAt)}\n${formatRelative(defi.endAt)}`, inline: false },
    );

  if (isEnded && defi.winners.length > 0) {
    embed.addFields({
      name: '🏆 Gagnants',
      value: defi.winners.map(id => `<@${id}>`).join('\n'),
      inline: false,
    });
    embed.setFooter({ text: 'Défi terminé — Félicitations aux gagnants !' });
  } else if (!isEnded) {
    embed.setFooter({ text: `Clique sur ✅ Relever le défi pour participer !` });
  }

  return embed;
}

// ── Bouton participer ─────────────────────────────────────────────────────
function buildDefiButton(ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('defi_join')
      .setLabel(ended ? 'Défi terminé' : '✅ Relever le défi')
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(ended),
  );
}

// ── Créer un défi ─────────────────────────────────────────────────────────
async function createDefi(interaction, opts) {
  try {
    const cfg = await Config.findOne({ guildId: interaction.guildId });
    const channelId = cfg?.defisChannelId || interaction.channelId;
    const channel   = await interaction.guild.channels.fetch(channelId).catch(() => interaction.channel);

    const template = DEFI_TEMPLATES.find(t => t.type === opts.type) || DEFI_TEMPLATES[4];
    const title       = opts.title || template.title;
    const description = opts.description || template.description;
    const target      = opts.target ?? template.defaultTarget;
    const rewardXp    = opts.rewardXp ?? template.defaultXp;
    const rewardKakera= opts.rewardKakera ?? template.defaultKakera;
    const durationMs  = (opts.durationHours || 168) * 3600 * 1000; // 7j par défaut

    const defi = await Defi.create({
      guildId:      interaction.guildId,
      type:         opts.type || 'custom',
      title,
      description,
      target,
      rewardXp,
      rewardKakera,
      rewardRoleId: opts.rewardRoleId || null,
      startAt:      new Date(),
      endAt:        new Date(Date.now() + durationMs),
      hostedBy:     interaction.user.id,
    });

    // Ping rôle défis si configuré
    const ping = cfg?.defisRoleId ? `<@&${cfg.defisRoleId}> 🔥 **Nouveau défi disponible !**` : '🔥 **Nouveau défi disponible !**';

    const msg = await channel.send({
      content: ping,
      embeds:  [buildDefiEmbed(defi, interaction.guild)],
      components: [buildDefiButton()],
    });

    defi.messageId = msg.id;
    await defi.save();

    // Planifier la fin
    const delay = defi.endAt - Date.now();
    setTimeout(() => endDefi(defi._id, interaction.guild, interaction.client), Math.max(delay, 1000));

    return { success: true, channel };
  } catch (err) {
    logger.error('[Defis] createDefi:', err);
    return { success: false };
  }
}

// ── Rejoindre un défi ─────────────────────────────────────────────────────
async function handleJoin(interaction) {
  try {
    const defi = await Defi.findOne({
      guildId:   interaction.guildId,
      messageId: interaction.message.id,
      ended:     false,
    });

    if (!defi || Date.now() > defi.endAt) {
      return interaction.reply({ content: '❌ Ce défi est terminé.', ephemeral: true });
    }

    const userId = interaction.user.id;

    if (defi.participants.has(userId)) {
      const prog = defi.participants.get(userId);
      return interaction.reply({
        content: `✅ Tu es déjà inscrit à ce défi ! Progression : **${prog}${defi.target ? `/${defi.target}` : ''}**`,
        ephemeral: true,
      });
    }

    defi.participants.set(userId, 0);
    await defi.save();

    // Mettre à jour l'embed
    try {
      await interaction.message.edit({ embeds: [buildDefiEmbed(defi, interaction.guild)] });
    } catch (_) {}

    await interaction.reply({
      content: `🔥 Tu as relevé le défi **${defi.title}** ! Bonne chance !\n${defi.description.replace('{target}', defi.target ?? '?')}`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error('[Defis] handleJoin:', err);
  }
}

// ── Mettre à jour la progression d'un participant ─────────────────────────
async function updateProgress(userId, guildId, type, increment = 1) {
  try {
    const now = new Date();
    const actifs = await Defi.find({
      guildId,
      type,
      ended: false,
      startAt: { $lte: now },
      endAt:   { $gte: now },
    });

    for (const defi of actifs) {
      if (!defi.participants.has(userId)) continue;
      const current = defi.participants.get(userId) || 0;
      defi.participants.set(userId, current + increment);
      await defi.save();
    }
  } catch (err) {
    logger.error('[Defis] updateProgress:', err);
  }
}

// ── Terminer un défi ──────────────────────────────────────────────────────
async function endDefi(defiId, guild, client) {
  try {
    const defi = await Defi.findById(defiId);
    if (!defi || defi.ended) return;
    defi.ended = true;

    const cfg = await Config.findOne({ guildId: defi.guildId });

    // Trouver les gagnants (ceux qui ont atteint l'objectif, ou les 3 premiers si pas d'objectif)
    let winners = [];
    if (defi.target) {
      for (const [userId, prog] of defi.participants) {
        if (prog >= defi.target) winners.push(userId);
      }
    } else {
      // Pas d'objectif → classement par progression, top 3
      const sorted = [...defi.participants.entries()].sort((a, b) => b[1] - a[1]);
      winners = sorted.slice(0, 3).map(([id]) => id);
    }

    defi.winners = winners;
    await defi.save();

    // Mettre à jour l'embed
    try {
      const channel = await guild.channels.fetch(defi.channelId || cfg?.defisChannelId).catch(async () => {
        // fallback: chercher le message
        return null;
      });

      if (channel) {
        const msg = await channel.messages.fetch(defi.messageId).catch(() => null);
        if (msg) {
          await msg.edit({
            embeds:     [buildDefiEmbed(defi, guild)],
            components: [buildDefiButton(true)],
          });
        }
      }
    } catch (_) {}

    // Distribuer les récompenses
    if (winners.length > 0) {
      for (const userId of winners) {
        await distributeRewards(userId, defi, guild, client, cfg);
      }

      // Annonce
      try {
        const announceChannelId = cfg?.defisChannelId || cfg?.announceChannelId;
        if (announceChannelId) {
          const chan = await guild.channels.fetch(announceChannelId).catch(() => null);
          if (chan) {
            const mention = winners.map(id => `<@${id}>`).join(', ');
            const rewardTxt = [];
            if (defi.rewardXp > 0)     rewardTxt.push(`+${defi.rewardXp} XP King`);
            if (defi.rewardKakera > 0) rewardTxt.push(`${defi.rewardKakera} kakera`);

            await chan.send({
              content: `🏆 **Défi terminé : ${defi.title}**\n🎉 Félicitations ${mention} ! Vous avez gagné ${rewardTxt.join(' + ')} !`,
            });
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    logger.error('[Defis] endDefi:', err);
  }
}

// ── Distribuer les récompenses ────────────────────────────────────────────
async function distributeRewards(userId, defi, guild, client, cfg) {
  try {
    // XP King
    if (defi.rewardXp > 0) {
      const user = await User.findOne({ userId, guildId: defi.guildId });
      if (user) {
        user.totalXp = (user.totalXp || 0) + defi.rewardXp;
        user.weekXp  = (user.weekXp  || 0) + defi.rewardXp;
        await user.save();
      }
    }

    // Kakera Mudae → $give @mention kakera dans le salon Mudae
    if (defi.rewardKakera > 0) {
      await sendKakeraMudae(userId, defi.rewardKakera, guild, cfg, client);
    }

    // Rôle
    if (defi.rewardRoleId) {
      try {
        const member = await guild.members.fetch(userId);
        await member.roles.add(defi.rewardRoleId).catch(() => {});
      } catch (_) {}
    }

    // DM de félicitations
    try {
      const member = await guild.members.fetch(userId);
      const rewardParts = [];
      if (defi.rewardXp > 0)     rewardParts.push(`**+${defi.rewardXp} XP King** 👑`);
      if (defi.rewardKakera > 0) rewardParts.push(`**${defi.rewardKakera} kakera** 💎`);

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏆 Défi accompli !')
        .setDescription(`Tu as terminé le défi **${defi.title}** !`)
        .addFields({ name: '🎁 Récompenses gagnées', value: rewardParts.join('\n') || '*Aucune*' });
      await member.send({ embeds: [embed] }).catch(() => {});
    } catch (_) {}
  } catch (err) {
    logger.error('[Defis] distributeRewards:', err);
  }
}

// ── Envoyer $give dans le salon Mudae ─────────────────────────────────────
async function sendKakeraMudae(userId, amount, guild, cfg, client) {
  try {
    // Chercher le salon Mudae configuré
    const channelId = cfg?.mudaeChannelId || cfg?.waifuChannelId;
    if (!channelId) {
      logger.warn('[Defis] Aucun salon Mudae configuré — kakera non distribués');
      return;
    }
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    // Envoyer la commande $give dans le salon Mudae
    await channel.send(`$give <@${userId}> ${amount}`);
  } catch (err) {
    logger.error('[Defis] sendKakeraMudae:', err);
  }
}

// ── Embed liste des défis actifs ──────────────────────────────────────────
async function getDefisListEmbed(guildId) {
  const now    = new Date();
  const actifs = await Defi.find({ guildId, ended: false, endAt: { $gte: now } }).sort({ endAt: 1 });

  if (actifs.length === 0) {
    return new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('⚡ Défis en cours')
      .setDescription('*Aucun défi actif pour le moment. Revenez bientôt !*')
      .setTimestamp();
  }

  const lines = actifs.map(d => {
    const tmpl = DEFI_TEMPLATES.find(t => t.type === d.type) || DEFI_TEMPLATES[4];
    const rewards = [];
    if (d.rewardXp > 0)     rewards.push(`+${d.rewardXp} XP`);
    if (d.rewardKakera > 0) rewards.push(`${d.rewardKakera}💎`);
    return `${tmpl.emoji} **${d.title}** — ${rewards.join(' + ')} — se termine ${formatRelative(d.endAt)}`;
  });

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚡ Défis en cours')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${actifs.length} défi(s) actif(s)` })
    .setTimestamp();
}

// ── Replanifier au démarrage ──────────────────────────────────────────────
async function rescheduleDefis(client) {
  try {
    const actifs = await Defi.find({ ended: false });
    for (const d of actifs) {
      const delay = Math.max(0, d.endAt - Date.now());
      const guild = await client.guilds.fetch(d.guildId).catch(() => null);
      if (guild) setTimeout(() => endDefi(d._id, guild, client), delay);
    }
    if (actifs.length > 0) logger.info(`[Defis] ${actifs.length} défi(s) replanifié(s)`);
  } catch (err) {
    logger.error('[Defis] rescheduleDefis:', err);
  }
}

// ── Lancer un défi vert (double XP toute la journée) ──────────────────────────
async function lancerDefiVert(guild, client, options = {}) {
  const config = await Config.findOne({ guildId: guild.id });
  const channel = guild.channels.cache.get(config?.defiChannelId || config?.announceChannelId);
  if (!channel) return null;

  // Choisir un template aléatoire parmi les défis "farm"
  const farmTemplates = [
    { type: 'messages', title: '🟢 DÉFI VERT — Tempête de messages !',   description: 'Envoie {target} messages aujourd\'hui sur le serveur !', target: 100, xp: 150, kakera: 500 },
    { type: 'bumps',    title: '🟢 DÉFI VERT — Bump intensif !',          description: 'Bumpe le serveur {target} fois aujourd\'hui !',            target: 3,   xp: 120, kakera: 400 },
    { type: 'invites',  title: '🟢 DÉFI VERT — Recruteur du jour !',      description: 'Invite {target} nouveaux membres aujourd\'hui !',           target: 2,   xp: 200, kakera: 700 },
    { type: 'messages', title: '🟢 DÉFI VERT — Marathon de messages !',   description: 'Envoie {target} messages dans les salons de jeux !',       target: 75,  xp: 130, kakera: 450 },
  ];

  const template = options.template || farmTemplates[Math.floor(Math.random() * farmTemplates.length)];

  // Fin = minuit ce soir
  const endAt = new Date();
  endAt.setHours(23, 59, 59, 999);

  const defi = await Defi.create({
    guildId:      guild.id,
    type:         template.type,
    title:        template.title,
    description:  template.description,
    target:       template.target,
    rewardXp:     template.xp,
    rewardKakera: template.kakera,
    startAt:      new Date(),
    endAt,
    hostedBy:     client.user.id,
    doubleXp:     true,
  });

  // Appliquer le double XP à TOUS les membres humains du serveur
  const midnight = new Date();
  midnight.setHours(23, 59, 59, 999);

  await User.updateMany(
    { guildId: guild.id },
    { defiXpBoostUntil: midnight }
  );

  // Construire l'embed
  const embed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(template.title)
    .setDescription(
      `${template.description.replace('{target}', template.target)}\n\n` +
      `🎁 **Récompense si complété :** +${template.xp} XP + ${template.kakera} kakera 💎\n\n` +
      `⚡ **BONUS** — Tous les membres ont le **double XP** toute la journée !\n` +
      `> Profites-en, ça repart à 0 à minuit.`
    )
    .addFields(
      { name: '⏳ Se termine', value: `<t:${Math.floor(endAt.getTime()/1000)}:R>`, inline: true },
      { name: '👥 Participants', value: '0', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '🟢 Quête verte — Double XP activé pour tous !' });

  const row = buildDefiButton(defi._id);
  const msg = await channel.send({
    content: config?.membreRoleId ? `<@&${config.membreRoleId}> 🟢 **DÉFI VERT** — Double XP activé !` : '🟢 **DÉFI VERT** — Double XP activé !',
    embeds: [embed],
    components: [row],
  });

  defi.messageId = msg.id;
  await defi.save();

  // Planifier la fin
  const delay = endAt.getTime() - Date.now();
  if (delay > 0) setTimeout(() => endDefi(defi._id, guild, client), delay);

  logger.info('Defis', `Défi vert lancé : ${template.title}`);
  return defi;
}

// ── Gros défis hebdo (planning automatique) ───────────────────────────────────
// Mercredi 18h et Jeudi 20h — défis boostés pour pousser le farm avant le reset
const GROS_DEFIS = [
  { type: 'messages', title: '🔥 GROS DÉFI — Qui peut tenir ?',          description: 'Envoie {target} messages aujourd\'hui, prouve que t\'es là !', target: 200, xp: 300, kakera: 1000 },
  { type: 'bumps',    title: '🔥 GROS DÉFI — Le serveur a besoin de toi', description: 'Bumpe {target} fois aujourd\'hui et aide le serveur à grossir !', target: 5,   xp: 250, kakera: 900  },
  { type: 'invites',  title: '🔥 GROS DÉFI — Ramène du monde !',          description: 'Invite {target} membres aujourd\'hui et montre qui est le boss.', target: 3,   xp: 400, kakera: 1500 },
  { type: 'messages', title: '🔥 GROS DÉFI — Farm ou rentre chez toi',    description: 'Envoie {target} messages dans les salons jeux !',               target: 150, xp: 280, kakera: 950  },
];

async function lancerGrosDefi(guild, client) {
  const template = GROS_DEFIS[Math.floor(Math.random() * GROS_DEFIS.length)];
  return lancerDefiVert(guild, client, { template: { ...template } });
}

module.exports = {
  createDefi,
  handleJoin,
  updateProgress,
  endDefi,
  rescheduleDefis,
  getDefisListEmbed,
  buildDefiEmbed,
  buildDefiButton,
  lancerDefiVert,
  lancerGrosDefi,
  DEFI_TEMPLATES,
};
