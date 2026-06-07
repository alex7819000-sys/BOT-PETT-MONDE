// src/systems/defis/index.js — Défis quotidiens + Challenge King of the Day
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Defi   = require('../../db/models/Defi');
const Config = require('../../db/models/Config');
const User   = require('../../db/models/User');
const logger = require('../../utils/logger');
const xpSys  = require('../xp');

// ═══════════════════════════════════════════════════════════════════════════
// PETITS DÉFIS QUOTIDIENS — Fun, simple, sans pénalité si on échoue
// ═══════════════════════════════════════════════════════════════════════════
const DAILY_DEFIS = [
  // Type "action" — objectif clair et mesurable
  {
    id: 'messages_50',
    type: 'messages',
    title: '💬 Bavard du jour',
    description: 'Envoie **50 messages** dans le serveur aujourd\'hui.\nChaque message compte, lâche toi !',
    target: 50,
    rewardXp: 80,
    rewardKakera: 250,
    durationH: 24,
  },
  {
    id: 'bump_3',
    type: 'bumps',
    title: '🚀 Boosteur officiel',
    description: 'Bumpe le serveur **3 fois** aujourd\'hui.\nAide-nous à grossir et empoche la récompense.',
    target: 3,
    rewardXp: 100,
    rewardKakera: 350,
    durationH: 24,
  },
  {
    id: 'invite_1',
    type: 'invites',
    title: '📨 Recruteur du jour',
    description: 'Invite **1 nouveau membre** sur le serveur aujourd\'hui.\nUn ami, un inconnu — l\'important c\'est qu\'il reste.',
    target: 1,
    rewardXp: 150,
    rewardKakera: 500,
    durationH: 24,
  },
  {
    id: 'messages_30_jeux',
    type: 'messages',
    title: '🎮 Gamer du jour',
    description: 'Envoie **30 messages** dans les salons de jeux aujourd\'hui.\n(#bataille, #quiz-anime, #count-down, #smash-anime)',
    target: 30,
    rewardXp: 70,
    rewardKakera: 200,
    durationH: 24,
  },
  {
    id: 'bump_2',
    type: 'bumps',
    title: '📣 Ambassadeur HERA',
    description: 'Bumpe le serveur **2 fois** et partage-le à un ami.\nLe serveur te remercie !',
    target: 2,
    rewardXp: 90,
    rewardKakera: 300,
    durationH: 24,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// NI OUI NI NON — Défi social sur 24h dans le chat
// ═══════════════════════════════════════════════════════════════════════════
const NIOUI_MOTS_INTERDITS = [
  'oui', 'non', 'yes', 'no', 'ouais', 'nan', 'si',
  'bien sûr', 'bien sur', 'absolument', 'jamais', 'exact',
  'évidemment', 'evidemment', 'effectivement', 'tout à fait',
  'pas du tout', 'au contraire', 'certainement',
];

// ═══════════════════════════════════════════════════════════════════════════
// CHALLENGE KING OF THE DAY — Gros défi hebdo, beaucoup d'XP
// ═══════════════════════════════════════════════════════════════════════════
const KING_CHALLENGES = [
  {
    id: 'king_messages',
    type: 'messages',
    title: '👑 KING CHALLENGE — Maître du Chat',
    description:
      'Envoie **200 messages** dans le serveur aujourd\'hui.\n\n' +
      '> C\'est le plus gros défi de la semaine.\n' +
      '> Seuls les vrais actifs y arrivent.\n' +
      '> Est-ce que t\'en fais partie ?',
    target: 200,
    rewardXp: 500,
    rewardKakera: 2000,
    durationH: 24,
  },
  {
    id: 'king_bump',
    type: 'bumps',
    title: '👑 KING CHALLENGE — Légion du Bump',
    description:
      'Bumpe le serveur **7 fois** aujourd\'hui.\n\n' +
      '> Chaque bump aide le serveur à grossir.\n' +
      '> 7 bumps en 24h, c\'est du sérieux.\n' +
      '> Prouve que t\'es un vrai pilier du serveur.',
    target: 7,
    rewardXp: 450,
    rewardKakera: 1800,
    durationH: 24,
  },
  {
    id: 'king_invites',
    type: 'invites',
    title: '👑 KING CHALLENGE — Recruteur Légendaire',
    description:
      'Invite **3 nouveaux membres** aujourd\'hui.\n\n' +
      '> Ramène du monde sur HERA.\n' +
      '> 3 personnes qui rejoignent grâce à toi.\n' +
      '> Le meilleur recruteur devient une légende.',
    target: 3,
    rewardXp: 600,
    rewardKakera: 2500,
    durationH: 24,
  },
  {
    id: 'king_nioui',
    type: 'nioui',
    title: '👑 KING CHALLENGE — Ni Oui Ni Non',
    description:
      'Tiens **24h** sans dire "oui", "non" ni leurs équivalents dans le chat.\n\n' +
      '> Simple en apparence... dévastateur en pratique.\n' +
      '> Les autres peuvent te poser des questions pièges.\n' +
      '> Si tu craques, tu perds — mais **zéro pénalité**, juste la fierté en jeu.\n\n' +
      '**Mots interdits :** oui, non, ouais, nan, si, bien sûr, jamais, absolument...',
    target: null,
    rewardXp: 700,
    rewardKakera: 3000,
    durationH: 24,
  },
];

// ─── Utilitaires ──────────────────────────────────────────────────────────
function formatRelative(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}
function formatDate(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

// ─── Build embed défi quotidien ───────────────────────────────────────────
function buildDefiEmbed(defi, isKing = false) {
  const isEnded = defi.ended || Date.now() > defi.endAt;
  const color = isEnded ? 0x2b2d31 : (isKing ? 0xf1c40f : 0x5865F2);

  const rewardParts = [];
  if (defi.rewardXp > 0)     rewardParts.push(`**+${defi.rewardXp} XP** 👑`);
  if (defi.rewardKakera > 0) rewardParts.push(`**${defi.rewardKakera} kakera** 💎`);
  if (defi.rewardRoleId)     rewardParts.push(`<@&${defi.rewardRoleId}>`);

  const participantCount = defi.participants ? defi.participants.size : 0;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${isEnded ? '✅ [TERMINÉ] ' : ''}${defi.title}`)
    .setDescription(defi.description)
    .addFields(
      { name: '🎁 Récompense si tu réussis', value: rewardParts.join('\n') || '*Aucune*', inline: true },
      { name: '👥 Participants',             value: `${participantCount}`,                inline: true },
      { name: isEnded ? '⏰ Terminé' : '⏳ Se termine', value: formatDate(defi.endAt), inline: false },
    );

  if (!isEnded) {
    embed.setFooter({ text: '⚠️ Aucune pénalité si tu ne réussis pas — participe juste pour gagner !' });
  }

  if (isEnded && defi.winners && defi.winners.length > 0) {
    embed.addFields({
      name: '🏆 Gagnants',
      value: defi.winners.map(id => `<@${id}>`).join('\n'),
    });
  } else if (isEnded) {
    embed.addFields({ name: '📊 Résultat', value: '*Personne n\'a complété ce défi — retente ta chance demain !*' });
  }

  return embed;
}

function buildDefiButton(ended = false, customId = 'defi_join') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(ended ? 'Défi terminé' : '✅ Je relève le défi !')
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(ended),
  );
}

// ─── Lancer un petit défi quotidien ──────────────────────────────────────
async function lancerDefiQuotidien(guild, client, templateId = null) {
  try {
    const cfg = await Config.findOne({ guildId: guild.id });
    const channelId = cfg?.defiChannelId || cfg?.announceChannelId;
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel) {
      logger.warn('[Defis] Aucun salon défi configuré');
      return null;
    }

    // Choisir un template (aléatoire ou spécifique)
    let template;
    if (templateId) {
      template = DAILY_DEFIS.find(d => d.id === templateId);
    }
    if (!template) {
      template = DAILY_DEFIS[Math.floor(Math.random() * DAILY_DEFIS.length)];
    }

    const endAt = new Date(Date.now() + template.durationH * 3600 * 1000);

    const defi = await Defi.create({
      guildId:      guild.id,
      type:         template.type,
      title:        template.title,
      description:  template.description,
      target:       template.target,
      rewardXp:     template.rewardXp,
      rewardKakera: template.rewardKakera,
      startAt:      new Date(),
      endAt,
      hostedBy:     client.user.id,
      isKingChallenge: false,
    });

    const ping = cfg?.membreRoleId
      ? `<@&${cfg.membreRoleId}> ⚡ **Défi du jour disponible !**`
      : '⚡ **Défi du jour disponible !**';

    const msg = await channel.send({
      content: ping,
      embeds:  [buildDefiEmbed(defi, false)],
      components: [buildDefiButton(false)],
    });

    defi.messageId = msg.id;
    await defi.save();

    const delay = Math.max(endAt - Date.now(), 1000);
    setTimeout(() => endDefi(defi._id, guild, client), delay);

    logger.info('[Defis]', `Défi quotidien lancé : ${template.title}`);
    return defi;
  } catch (err) {
    logger.error('[Defis] lancerDefiQuotidien:', err);
    return null;
  }
}

// ─── Lancer le King Challenge ─────────────────────────────────────────────
async function lancerKingChallenge(guild, client, templateId = null) {
  try {
    const cfg = await Config.findOne({ guildId: guild.id });
    const channelId = cfg?.defiChannelId || cfg?.announceChannelId;
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel) {
      logger.warn('[Defis] Aucun salon défi configuré pour King Challenge');
      return null;
    }

    let template;
    if (templateId) {
      template = KING_CHALLENGES.find(d => d.id === templateId);
    }
    if (!template) {
      template = KING_CHALLENGES[Math.floor(Math.random() * KING_CHALLENGES.length)];
    }

    const endAt = new Date(Date.now() + template.durationH * 3600 * 1000);

    const defi = await Defi.create({
      guildId:      guild.id,
      type:         template.type,
      title:        template.title,
      description:  template.description,
      target:       template.target,
      rewardXp:     template.rewardXp,
      rewardKakera: template.rewardKakera,
      startAt:      new Date(),
      endAt,
      hostedBy:     client.user.id,
      isKingChallenge: true,
    });

    // Ping fort pour le King Challenge
    const ping = cfg?.membreRoleId
      ? `@everyone 👑 **KING CHALLENGE — Le plus gros défi de la semaine !**`
      : '@everyone 👑 **KING CHALLENGE — Le plus gros défi de la semaine !**';

    const embed = buildDefiEmbed(defi, true);
    embed.setThumbnail('https://i.imgur.com/Y5KXzz3.gif'); // couronne animée

    const msg = await channel.send({
      content: ping,
      embeds:  [embed],
      components: [buildDefiButton(false)],
    });

    defi.messageId = msg.id;
    await defi.save();

    const delay = Math.max(endAt - Date.now(), 1000);
    setTimeout(() => endDefi(defi._id, guild, client), delay);

    logger.info('[Defis]', `King Challenge lancé : ${template.title}`);
    return defi;
  } catch (err) {
    logger.error('[Defis] lancerKingChallenge:', err);
    return null;
  }
}

// ─── Rejoindre un défi ────────────────────────────────────────────────────
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
      const target = defi.target;
      const progTxt = target ? `${prog}/${target}` : (prog === 1 ? '✅ Inscrit' : `${prog}`);
      return interaction.reply({
        content: `✅ Tu participes déjà ! Progression : **${progTxt}**`,
        ephemeral: true,
      });
    }

    defi.participants.set(userId, 0);
    await defi.save();

    try {
      await interaction.message.edit({ embeds: [buildDefiEmbed(defi, defi.isKingChallenge)] });
    } catch (_) {}

    const nopenalty = '\n\n> *Rappel : aucune pénalité si tu n\'y arrives pas. Bonne chance !*';
    return interaction.reply({
      content: `🔥 Tu as relevé **${defi.title}** !${nopenalty}`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error('[Defis] handleJoin:', err);
  }
}

// ─── Progression (appelée depuis messages.js, bump.js, invitetracker.js) ──
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

// ─── Surveillance Ni Oui Ni Non ───────────────────────────────────────────
async function checkNiOuiNiNon(message) {
  try {
    if (message.author.bot) return;
    const guildId = message.guildId;

    // Y a-t-il un défi nioui actif ?
    const defi = await Defi.findOne({
      guildId,
      type: 'nioui',
      ended: false,
      endAt: { $gte: new Date() },
    });
    if (!defi) return;

    const userId = message.author.id;
    if (!defi.participants.has(userId)) return; // pas inscrit, on ignore

    const content = message.content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const motInterdit = NIOUI_MOTS_INTERDITS.find(mot => {
      const escaped = mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\s|[^a-zA-Z])${escaped}([^a-zA-Z]|$)`).test(content);
    });

    if (motInterdit) {
      // Le joueur a craqué — il est éliminé du défi (mais ZÉRO pénalité sur son XP)
      defi.participants.delete(userId);
      await defi.save();

      await message.reply({
        content: `😱 **<@${userId}> a craqué !** Tu as dit **"${motInterdit}"** — éliminé du Ni Oui Ni Non !\n> Pas de pénalité, mais la fierté en prend un coup 😂`,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error('[Defis] checkNiOuiNiNon:', err);
  }
}

// ─── Terminer un défi ─────────────────────────────────────────────────────
async function endDefi(defiId, guild, client) {
  try {
    const defi = await Defi.findById(defiId);
    if (!defi || defi.ended) return;
    defi.ended = true;

    const cfg = await Config.findOne({ guildId: defi.guildId });

    // Trouver les gagnants
    let winners = [];
    if (defi.type === 'nioui') {
      // Gagnants = tous ceux qui sont encore dans participants (n'ont pas craqué)
      winners = [...defi.participants.keys()];
    } else if (defi.target) {
      for (const [userId, prog] of defi.participants) {
        if (prog >= defi.target) winners.push(userId);
      }
    } else {
      const sorted = [...defi.participants.entries()].sort((a, b) => b[1] - a[1]);
      winners = sorted.slice(0, 3).map(([id]) => id);
    }

    defi.winners = winners;
    await defi.save();

    // Mise à jour de l'embed
    try {
      const channelId = cfg?.defiChannelId || cfg?.announceChannelId;
      if (channelId) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel && defi.messageId) {
          const msg = await channel.messages.fetch(defi.messageId).catch(() => null);
          if (msg) {
            await msg.edit({
              embeds:     [buildDefiEmbed(defi, defi.isKingChallenge)],
              components: [buildDefiButton(true)],
            });
          }
        }
      }
    } catch (_) {}

    // Distribuer les récompenses aux gagnants
    if (winners.length > 0) {
      for (const userId of winners) {
        await distributeRewards(userId, defi, guild, client, cfg);
      }

      // Annonce des gagnants
      try {
        const channelId = cfg?.defiChannelId || cfg?.announceChannelId;
        if (channelId) {
          const chan = await guild.channels.fetch(channelId).catch(() => null);
          if (chan) {
            const mentions = winners.map(id => `<@${id}>`).join(', ');
            const rewards  = [];
            if (defi.rewardXp > 0)     rewards.push(`+${defi.rewardXp} XP`);
            if (defi.rewardKakera > 0) rewards.push(`${defi.rewardKakera} kakera 💎`);
            const isKing = defi.isKingChallenge;
            const titre  = isKing ? '👑 KING CHALLENGE TERMINÉ' : '✅ Défi quotidien terminé';
            await chan.send({
              content:
                `**${titre} : ${defi.title}**\n` +
                `🎉 Félicitations ${mentions} !\n` +
                `Vous avez gagné **${rewards.join(' + ')}**`,
            });
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    logger.error('[Defis] endDefi:', err);
  }
}

// ─── Récompenses ──────────────────────────────────────────────────────────
async function distributeRewards(userId, defi, guild, client, cfg) {
  try {
    if (defi.rewardXp > 0) {
      await xpSys.addXP(userId, defi.guildId, defi.rewardXp, null, guild);
    }

    if (defi.rewardKakera > 0) {
      const channelId = cfg?.mudaeChannelId || cfg?.waifuChannelId;
      if (channelId) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel) await channel.send(`$give <@${userId}> ${defi.rewardKakera}`).catch(() => {});
      }
    }

    if (defi.rewardRoleId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.add(defi.rewardRoleId).catch(() => {});
    }

    // DM de félicitations
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const rewards = [];
    if (defi.rewardXp > 0)     rewards.push(`**+${defi.rewardXp} XP** 👑`);
    if (defi.rewardKakera > 0) rewards.push(`**${defi.rewardKakera} kakera** 💎`);

    const embed = new EmbedBuilder()
      .setColor(defi.isKingChallenge ? 0xf1c40f : 0x57F287)
      .setTitle(defi.isKingChallenge ? '👑 King Challenge accompli !' : '✅ Défi accompli !')
      .setDescription(`Tu as réussi **${defi.title}** !`)
      .addFields({ name: '🎁 Récompenses', value: rewards.join('\n') || 'Aucune' });

    await member.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    logger.error('[Defis] distributeRewards:', err);
  }
}

// ─── Replanifier au démarrage ─────────────────────────────────────────────
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

// ─── Embed liste des défis actifs ─────────────────────────────────────────
async function getDefisListEmbed(guildId) {
  const now    = new Date();
  const actifs = await Defi.find({ guildId, ended: false, endAt: { $gte: now } }).sort({ endAt: 1 });

  if (actifs.length === 0) {
    return new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('⚡ Défis en cours')
      .setDescription('*Aucun défi actif pour le moment. Reviens bientôt !*')
      .setTimestamp();
  }

  const lines = actifs.map(d => {
    const isKing = d.isKingChallenge;
    const rewards = [];
    if (d.rewardXp > 0)     rewards.push(`+${d.rewardXp} XP`);
    if (d.rewardKakera > 0) rewards.push(`${d.rewardKakera}💎`);
    const tag = isKing ? '👑 **KING**' : '⚡';
    return `${tag} **${d.title}** — ${rewards.join(' + ')} — ${formatRelative(d.endAt)}`;
  });

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚡ Défis actifs')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${actifs.length} défi(s) — Aucune pénalité si tu échoues !` })
    .setTimestamp();
}

// ─── Compatibilité ancienne API ───────────────────────────────────────────
async function createDefi(interaction, opts) {
  const isKing = opts.isKingChallenge || false;
  const durationMs = (opts.durationHours || 24) * 3600 * 1000;
  const endAt = new Date(Date.now() + durationMs);

  const cfg = await Config.findOne({ guildId: interaction.guildId });
  const channelId = cfg?.defiChannelId || interaction.channelId;
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => interaction.channel);

  const defi = await Defi.create({
    guildId:         interaction.guildId,
    type:            opts.type || 'custom',
    title:           opts.title || '⚡ Défi custom',
    description:     opts.description || 'Défi lancé manuellement.',
    target:          opts.target ?? null,
    rewardXp:        opts.rewardXp ?? 100,
    rewardKakera:    opts.rewardKakera ?? 300,
    rewardRoleId:    opts.rewardRoleId || null,
    startAt:         new Date(),
    endAt,
    hostedBy:        interaction.user.id,
    isKingChallenge: isKing,
  });

  const ping = isKing ? '@everyone 👑 **KING CHALLENGE !**' : '⚡ **Nouveau défi disponible !**';
  const msg = await channel.send({
    content: ping,
    embeds:  [buildDefiEmbed(defi, isKing)],
    components: [buildDefiButton(false)],
  });

  defi.messageId = msg.id;
  await defi.save();

  const delay = Math.max(endAt - Date.now(), 1000);
  setTimeout(() => endDefi(defi._id, interaction.guild, interaction.client), delay);

  return { success: true, channel };
}

module.exports = {
  // Principal
  lancerDefiQuotidien,
  lancerKingChallenge,
  checkNiOuiNiNon,
  handleJoin,
  updateProgress,
  endDefi,
  rescheduleDefis,
  getDefisListEmbed,
  buildDefiEmbed,
  buildDefiButton,
  createDefi,
  // Templates exportés pour les commandes
  DAILY_DEFIS,
  KING_CHALLENGES,
  NIOUI_MOTS_INTERDITS,
};
