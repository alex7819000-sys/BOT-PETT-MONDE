// src/handlers/commandHandlers/setup.js
'use strict';
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Config = require('../../db/models/Config');
const { requireAdmin, safeReply } = require('../../utils/permissions');
const { COLORS } = require('../../config/constants');
const logger = require('../../utils/logger');

async function handle(interaction, client) {
  if (!requireAdmin(interaction)) return;
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  let config = await Config.findOne({ guildId: gid });
  if (!config) config = await Config.create({ guildId: gid });

  // ── Voir ────────────────────────────────────────────────────────────────
  if (sub === 'voir') {
    await interaction.deferReply({ ephemeral: true });
    const ch = id => id ? `<#${id}>` : '❌ Non configuré';
    const ro = id => id ? `<@&${id}>` : '❌ Non configuré';
    const embed = new EmbedBuilder().setColor(COLORS.TEAL).setTitle('⚙️ Configuration du bot')
      .addFields(
        { name: '📣 Annonces',         value: ch(config.announceChannelId),            inline: true },
        { name: '🎌 Anime SOP',        value: ch(config.animeChannelId),               inline: true },
        { name: '🐾 Animaux Auto',     value: ch(config.animalsAutoChannelId),         inline: true },
        { name: '🗳️ Waifu Commu',      value: ch(config.waifuChannelId),              inline: true },
        { name: '🐶 Animaux Commu',    value: ch(config.animalsCommunityChannelId),    inline: true },
        { name: '💅 Face Reveal',      value: ch(config.faceRevealChannelId),          inline: true },
        { name: '🚀 Bump',             value: ch(config.bumpChannelId),                inline: true },
        { name: '🤫 SECRET',           value: ch(config.secretChannelId),              inline: true },
        { name: '⚔️ Guerre résultats', value: ch(config.warChannelId),                 inline: true },
        { name: '⚔️ Guerre chat actif', value: ch(config.warChatChannelId),             inline: true },
        { name: '🐶 Rôle Chien',       value: ro(config.warDogRoleId),                inline: true },
        { name: '🐱 Rôle Chat',        value: ro(config.warCatRoleId),                inline: true },
        { name: '🎯 Quiz',             value: ch(config.quizChannelId),                inline: true },
        { name: '🔒 Prison',           value: ch(config.prisonChannelId),              inline: true },
        { name: '👑 Rôle King',        value: ro(config.kingRoleId),                   inline: true },
        { name: '🐒 Rôle Singe',       value: ro(config.singeRoleId),                  inline: true },
        { name: '💑 Rôle Couple',      value: ro(config.coupleRoleId),                 inline: true },
        { name: '🏆 Rôle Dominante',   value: ro(config.guildeDominanteRoleId),        inline: true },
        { name: '⚡ XP/message',       value: `${config.xpPerMessage}`,               inline: true },
        { name: '⏱️ Cooldown XP',      value: `${config.xpCooldown}s`,                inline: true },
        { name: '🕗 Heure King',       value: `${config.crownHour}h00`,               inline: true },
        { name: '🎌 Anime interval',   value: `${config.animeInterval}h`,             inline: true },
        { name: '🐾 Animaux interval', value: `${config.animalsInterval}h`,           inline: true },
        { name: '🎬 YouTube',          value: config.youtubeChannelId ? `\`${config.youtubeChannelId}\`` : '❌', inline: true },
        { name: '🟣 Twitch',           value: config.twitchUsername || '❌',            inline: true },
        { name: '📊 Salon /rk',        value: ch(config.rankChannelId),               inline: true },
        { name: '🐾 Animal Mention',   value: config.animalMentionEnabled ? '✅ Activée' : '❌ Désactivée', inline: true },
        { name: '🔊 Sons animaux',      value: ch(config.animalTriggerChannelId),              inline: true },
      ).setTimestamp();
    return interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  if (sub === 'init') {
    await interaction.deferReply({ ephemeral: true });
    await interaction.followUp({ content: '⏳ Création des rôles et salons...', ephemeral: true });
    try {
      const guild = interaction.guild;

      // Rôles
      const rolesDef = [
        // ── Rôles fonctionnels bot ───────────────────────────────────────
        { name: '👑 King of the Day',         color: 0xFFD700, field: 'kingRoleId' },
        { name: '🐒 Singe du Serveur',        color: 0xFF5252, field: 'singeRoleId' },
        { name: '💑 Meilleur Couple',         color: 0xFF69B4, field: 'coupleRoleId' },
        { name: '🏆 Guilde Dominante',        color: 0xFFD700, field: 'guildeDominanteRoleId' },
        // ── Rôles staff (créés seulement s'ils n'existent pas déjà) ─────
        { name: '👑 | Kuzan',                 color: 0xE67E22, field: null }, // Orange doré — propriétaire
        { name: '🛡️ | Moderateur',           color: 0xE74C3C, field: null }, // Rouge vif
        { name: '⚙️ | Staff',                color: 0xE91E8C, field: null }, // Rose fuchsia
        { name: '🔧 | Technicien',            color: 0xE74C3C, field: null }, // Rouge (même niveau que modo)
        { name: '🎉 | Animateur',             color: 0x2ECC71, field: null }, // Vert émeraude
        { name: '✅ | Membre Confirmé',       color: 0x3498DB, field: 'confirmedRoleId' }, // Bleu Discord
        // ── Rôles couleur — 8 couleurs natives Discord ───────────────────
        { name: '💙 | Bleu Discord',   color: 0x5865F2, field: null, colorRole: true, emoji: '💙' },
        { name: '💚 | Vert Discord',   color: 0x57F287, field: null, colorRole: true, emoji: '💚' },
        { name: '💛 | Jaune Discord',  color: 0xFEE75C, field: null, colorRole: true, emoji: '💛' },
        { name: '❤️ | Rouge Discord',  color: 0xED4245, field: null, colorRole: true, emoji: '❤️' },
        { name: '🩷 | Rose Discord',   color: 0xEB459E, field: null, colorRole: true, emoji: '🩷' },
        { name: '🧡 | Or Discord',     color: 0xFAA61A, field: null, colorRole: true, emoji: '🧡' },
        { name: '⬜ | Blanc',          color: 0xFFFFFF, field: null, colorRole: true, emoji: '⬜' },
        { name: '💜 | Pink Nitro',     color: 0xFF73FA, field: null, colorRole: true, emoji: '💜' },
      ];
      const updates = {};
      const colorRolesToAdd = [];
      for (const def of rolesDef) {
        // Skip si déjà mappé en config (sauf colorRole — toujours recréer si manquant)
        if (def.field && !def.colorRole && config[def.field]) continue;
        // Pour les rôles couleur : skip si déjà dans colorRoleIds
        if (def.colorRole) {
          const alreadyStored = (config.colorRoleIds || []).find(cr => cr.name === def.name);
          if (alreadyStored) continue;
        }
        // Skip si un rôle du même nom existe déjà sur le serveur
        const existing = guild.roles.cache.find(r => r.name === def.name);
        if (existing) {
          if (def.field && !def.colorRole) updates[def.field] = existing.id;
          if (def.colorRole) colorRolesToAdd.push({ name: def.name, roleId: existing.id, emoji: def.emoji });
          continue;
        }
        const role = await guild.roles.create({ name: def.name, color: def.color, reason: 'Setup bot' });
        if (def.field && !def.colorRole) updates[def.field] = role.id;
        if (def.colorRole) colorRolesToAdd.push({ name: def.name, roleId: role.id, emoji: def.emoji });
      }
      if (colorRolesToAdd.length) {
        updates['$push'] = { colorRoleIds: { $each: colorRolesToAdd } };
      }

      // Salons textuels
      const channelsDef = [
        { name: '📣︱annonces-bot',        field: 'announceChannelId' },
        { name: '🎌︱smash-anime',         field: 'animeChannelId' },
        { name: '🐾︱smash-animaux',       field: 'animalsAutoChannelId' },
        { name: '🗳️︱waifu-communaute',    field: 'waifuChannelId' },
        { name: '🐶︱animaux-communaute',  field: 'animalsCommunityChannelId' },
        { name: '💅︱face-reveal',         field: 'faceRevealChannelId' },
        { name: '🚀︱bump',               field: 'bumpChannelId' },
        { name: '🤫︱secret',             field: 'secretChannelId' },
        { name: '⚔️︱guerre-resultats',    field: 'warChannelId' },
        { name: '🎯︱quiz-anime',          field: 'quizChannelId' },
        { name: '🔒︱prison-du-singe',     field: 'prisonChannelId' },
      ];
      for (const def of channelsDef) {
        if (!config[def.field]) {
          const ch = await guild.channels.create({ name: def.name, type: 0, reason: 'Setup bot' });
          updates[def.field] = ch.id;
        }
      }

      const { $push: pushOp, ...setUpdates } = updates;
      if (Object.keys(setUpdates).length) await Config.updateOne({ guildId: gid }, setUpdates);
      if (pushOp) await Config.updateOne({ guildId: gid }, { $push: pushOp });

      await interaction.followUp({ content: `✅ Setup terminé ! ${Object.keys(updates).length} éléments créés.\nFais \`/setup voir\` pour vérifier.`, ephemeral: true });
    } catch (err) {
      logger.error('Setup', 'Init failed', err);
      await interaction.followUp({ content: '❌ Erreur lors du setup. Vérifie les permissions du bot.', ephemeral: true });
    }
    return;
  }

  // ── XP ──────────────────────────────────────────────────────────────────
  if (sub === 'xp') {
    const xpm   = interaction.options.getInteger('par_message');
    const cd    = interaction.options.getInteger('cooldown');
    const heure = interaction.options.getInteger('heure_king');
    const upd   = {};
    if (xpm   !== null) upd.xpPerMessage = xpm;
    if (cd    !== null) upd.xpCooldown   = cd;
    if (heure !== null) upd.crownHour    = heure;
    await Config.updateOne({ guildId: gid }, upd);
    return safeReply(interaction, { content: `✅ XP mis à jour : ${JSON.stringify(upd)}`, ephemeral: true });
  }

  // ── Salon ────────────────────────────────────────────────────────────────
  if (sub === 'salon') {
    const type    = interaction.options.getString('type');
    const channel = interaction.options.getChannel('salon');

    // Media → array (ajouter si pas déjà présent)
    if (type === 'mediaChannelIds') {
      await Config.updateOne({ guildId: gid }, { $addToSet: { mediaChannelIds: channel.id } }, { upsert: true });
      return safeReply(interaction, { content: `✅ <#${channel.id}> ajouté aux salons média !\nPour retirer : /setup retiremedia #salon`, ephemeral: true });
    }

    await Config.updateOne({ guildId: gid }, { [type]: channel.id }, { upsert: true });

    // Si c'est le salon secret → poster le bouton persistant + message accueil confessions
    if (type === 'secretChannelId') {
      const { postSecretButton } = require('../../systems/secret');
      await postSecretButton(interaction.client, gid);
      const { postConfessionWelcome } = require('../../systems/confession');
      await postConfessionWelcome(interaction.client, gid);
    }

    return safeReply(interaction, { content: `✅ Salon configuré : <#${channel.id}>`, ephemeral: true });
  }

  // ── Rôle ────────────────────────────────────────────────────────────────
  if (sub === 'role') {
    const type = interaction.options.getString('type');
    const role = interaction.options.getRole('role');
    await Config.updateOne({ guildId: gid }, { [type]: role.id }, { upsert: true });
    return safeReply(interaction, { content: `✅ Rôle configuré : <@&${role.id}>`, ephemeral: true });
  }

  // ── Anime interval ───────────────────────────────────────────────────────
  if (sub === 'anime') {
    const heures = interaction.options.getInteger('heures');
    await Config.updateOne({ guildId: gid }, { animeInterval: heures });
    return safeReply(interaction, { content: `✅ Smash anime toutes les **${heures}h** !`, ephemeral: true });
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (sub === 'youtube') {
    const channelId = interaction.options.getString('channel_id');
    const salon     = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { youtubeChannelId: channelId, youtubeNotifChannelId: salon.id });
    return safeReply(interaction, { content: `✅ YouTube configuré ! Notifs dans <#${salon.id}>`, ephemeral: true });
  }

  // ── Twitch ───────────────────────────────────────────────────────────────
  if (sub === 'twitch') {
    const username = interaction.options.getString('username');
    const salon    = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { twitchUsername: username, twitchNotifChannelId: salon.id });
    return safeReply(interaction, { content: `✅ Twitch \`${username}\` configuré ! Notifs dans <#${salon.id}>`, ephemeral: true });
  }





  // ── Guerre — rôles chien/chat ─────────────────────────────────────────────
  if (sub === 'guerre') {
    const roleDog = interaction.options.getRole('rolechien');
    const roleCat = interaction.options.getRole('rolechat');
    const upd = {};
    if (roleDog) upd.warDogRoleId = roleDog.id;
    if (roleCat) upd.warCatRoleId = roleCat.id;
    if (!Object.keys(upd).length) {
      return safeReply(interaction, { content: '❌ Donne au moins un rôle.', ephemeral: true });
    }
    await Config.updateOne({ guildId: gid }, upd, { upsert: true });
    const lines = [];
    if (roleDog) lines.push(`🐶 Team Chien → <@&${roleDog.id}>`);
    if (roleCat) lines.push(`🐱 Team Chat → <@&${roleCat.id}>`);
    return safeReply(interaction, {
      content: `✅ Rôles guerre configurés !
${lines.join('\n')}\n\nMets ces rôles dans l'onboarding Discord → Salons et rôles → Questions de personnalisation.`,
      ephemeral: true,
    });
  }


  // ── Spawn intervals ────────────────────────────────────────────────────────
  if (sub === 'spawn') {
    const anime   = interaction.options.getInteger('anime');
    const animaux = interaction.options.getInteger('animaux');
    const upd = {};
    if (anime   !== null) upd.animeInterval   = anime;
    if (animaux !== null) upd.animalsInterval = animaux;
    if (!Object.keys(upd).length) return safeReply(interaction, { content: '❌ Indique au moins un intervalle.', ephemeral: true });
    await Config.updateOne({ guildId: gid }, upd, { upsert: true });
    const lines = [];
    if (anime   !== null) lines.push(`🎌 Anime SOP → toutes les **${anime}h**`);
    if (animaux !== null) lines.push(`🐾 Animaux SOP → toutes les **${animaux}h**`);
    const msg = '✅ Spawn mis à jour !\n' + lines.join('\n');
    return safeReply(interaction, { content: msg, ephemeral: true });
  }


  // ── Reset hebdo configurable ──────────────────────────────────────────────
  if (sub === 'reset') {
    const jour   = interaction.options.getInteger('jour');
    const heure  = interaction.options.getInteger('heure');
    const upd    = {};
    if (jour  !== null) upd.resetDayOfWeek = jour;
    if (heure !== null) upd.resetHour      = heure;
    if (!Object.keys(upd).length) {
      const jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
      return safeReply(interaction, { content: `ℹ️ Reset actuel : **${jours[config.resetDayOfWeek ?? 5]}** à **${config.resetHour ?? 20}h00**`, ephemeral: true });
    }
    await Config.updateOne({ guildId: gid }, upd, { upsert: true });
    const jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const newDay  = upd.resetDayOfWeek ?? config.resetDayOfWeek ?? 5;
    const newHour = upd.resetHour ?? config.resetHour ?? 20;
    return safeReply(interaction, { content: `✅ Reset configuré : **${jours[newDay]}** à **${newHour}h00** !`, ephemeral: true });
  }

  // ── Chat Revive ────────────────────────────────────────────────────────────
  if (sub === 'chatrevive') {
    const salon   = interaction.options.getChannel('salon');
    const minutes = interaction.options.getInteger('minutes');
    const upd     = {};
    if (salon)         upd.chatReviveChannelId    = salon.id;
    if (minutes !== null) upd.chatReviveIntervalMin = minutes;
    if (!Object.keys(upd).length) return safeReply(interaction, { content: '❌ Donne un salon ou une durée.', ephemeral: true });
    await Config.updateOne({ guildId: gid }, upd, { upsert: true });
    return safeReply(interaction, {
      content: `✅ Chat Revive configuré !
${salon ? `Salon : <#${salon.id}>` : ''}
${minutes !== null ? `Inactivité : ${minutes} min` : ''}
Actif entre **16h et 22h** automatiquement.`,
      ephemeral: true,
    });
  }

  // ── DM Blast ──────────────────────────────────────────────────────────────
  if (sub === 'dmblast') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { dmBlastChannelId: salon.id }, { upsert: true });
    return safeReply(interaction, {
      content: `✅ Salon DM Blast configuré : <#${salon.id}>\nTout message que tu envoies dans ce salon sera DM à tous les membres du serveur.\n⚠️ Cooldown : 30 min entre deux blasts.`,
      ephemeral: true,
    });
  }

  // ── Level Role ────────────────────────────────────────────────────────────
  if (sub === 'levelrole') {
    const niveau = interaction.options.getInteger('niveau');
    const role   = interaction.options.getRole('role');
    // Retirer l'entrée existante pour ce niveau si elle existe
    await Config.updateOne({ guildId: gid }, { $pull: { levelRoles: { level: niveau } } });
    await Config.updateOne({ guildId: gid }, { $push: { levelRoles: { level: niveau, roleId: role.id } } }, { upsert: true });
    return safeReply(interaction, { content: `✅ Niveau **${niveau}** → rôle <@&${role.id}> configuré !`, ephemeral: true });
  }

  // ── Challenger Role ───────────────────────────────────────────────────────
  if (sub === 'challenger') {
    const role = interaction.options.getRole('role');
    await Config.updateOne({ guildId: gid }, { challengerRoleId: role.id }, { upsert: true });
    return safeReply(interaction, {
      content: `⚔️ Rôle Challenger défini : <@&${role.id}>\nLes **#2 et #3** du classement hebdo recevront ce rôle + **+50% XP** pendant 7 jours.`,
      ephemeral: true,
    });
  }

  // ── Multiplicateur XP par salon ───────────────────────────────────────────
  if (sub === 'multixp') {
    const salon = interaction.options.getChannel('salon');
    const multi = interaction.options.getNumber('multiplicateur');
    await Config.updateOne({ guildId: gid }, { $pull: { channelMultipliers: { channelId: salon.id } } });
    if (multi !== 1) {
      await Config.updateOne({ guildId: gid }, { $push: { channelMultipliers: { channelId: salon.id, multiplier: multi } } }, { upsert: true });
      return safeReply(interaction, {
        content: `✅ Multiplicateur **x${multi}** XP dans <#${salon.id}> !`,
        ephemeral: true,
      });
    }
    return safeReply(interaction, { content: `✅ Multiplicateur retiré de <#${salon.id}> (x1 = normal).`, ephemeral: true });
  }

  // ── Setup Staff ───────────────────────────────────────────────────────────
  if (sub === 'staff') {
    const cle   = interaction.options.getString('cle');
    const role  = interaction.options.getRole('role');
    const salon = interaction.options.getChannel('salon');
    const gif   = interaction.options.getString('gif');
    const channelKeys = ['staffConditionChannelId', 'staffCategoryId', 'staffArchiveCategoryId'];
    const value = channelKeys.includes(cle) ? (salon?.id || null) : (role?.id || null);
    if (!value && !gif) return safeReply(interaction, { content: '❌ Fournis un rôle ou un salon.', ephemeral: true });
    const update = gif ? { [cle]: value, staffGifUrl: gif } : { [cle]: value };
    await Config.updateOne({ guildId: gid }, update, { upsert: true });
    const label = role ? `<@&${role.id}>` : salon ? `<#${salon.id}>` : gif;
    return safeReply(interaction, { content: `✅ **${cle}** configuré : ${label}`, ephemeral: true });
  }

  // ── Setup StaffPost ───────────────────────────────────────────────────────
  if (sub === 'staffpost') {
    const gif         = interaction.options.getString('gif');
    const freshConfig = await Config.findOne({ guildId: gid });
    const gifUrl      = gif || freshConfig?.staffGifUrl || null;
    const { postConditionEmbed } = require('../../systems/staff');
    const msg = await postConditionEmbed(interaction.guild, freshConfig, gifUrl);
    if (!msg) return safeReply(interaction, { content: '❌ Configure d\'abord `/setup staff cle:📋 Salon condition-staff`', ephemeral: true });
    if (gifUrl) await Config.updateOne({ guildId: gid }, { staffGifUrl: gifUrl });
    return safeReply(interaction, { content: `✅ Embed staff posté dans <#${msg.channel.id}> !`, ephemeral: true });
  }

  // ── Couleur post — embed fixe avec menu déroulant ────────────────────────
  if (sub === 'couleurpost') {
    const salon = interaction.options.getChannel('salon');
    const freshConfig = await Config.findOne({ guildId: gid });
    const colorRoles  = freshConfig?.colorRoleIds || [];

    if (!colorRoles.length) {
      return safeReply(interaction, {
        content: '❌ Aucun rôle couleur configuré. Lance `/setup init` d\'abord.',
        ephemeral: true,
      });
    }

    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎨 Choisis la couleur de ton pseudo')
      .setDescription(
        'Sélectionne une couleur dans le menu ci-dessous.\n' +
        '**1 couleur à la fois** — l\'ancienne est retirée automatiquement.\n\n' +
        '💚 **Astuce** — Le rôle **Vert** te donne **x2 XP** sur tous tes messages !\n\n' +
        '> Tu peux changer de couleur quand tu veux depuis ce salon.'
      );

    const options = colorRoles.slice(0, 25).map(cr =>
      new StringSelectMenuOptionBuilder()
        .setLabel(cr.name.replace(/[^\w\s|]/gu, '').trim() || cr.name)
        .setValue(cr.roleId)
        .setEmoji(cr.emoji || '🎨')
    );

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`color_role:select:${gid}`)
        .setPlaceholder('🎨 Choisis ta couleur...')
        .addOptions(options)
    );

    const msg = await salon.send({ embeds: [embed], components: [row] });
    await msg.pin().catch(() => {});

    await Config.updateOne({ guildId: gid }, { colorPostChannelId: salon.id, colorPostMessageId: msg.id }, { upsert: true });

    return safeReply(interaction, {
      content: `✅ Embed couleur posté et épinglé dans <#${salon.id}> !`,
      ephemeral: true,
    });
  }

  // ── Partenariat ───────────────────────────────────────────────────────────
  if (sub === 'partenariat') {
    const cle   = interaction.options.getString('cle');
    const role  = interaction.options.getRole('role');
    const salon = interaction.options.getChannel('salon');
    const channelKeys = ['partnerConditionChannelId', 'partnerCategoryId', 'partnerArchiveCategoryId', 'partnerPostChannelId'];
    const value = channelKeys.includes(cle) ? (salon?.id || null) : (role?.id || null);
    if (!value) return safeReply(interaction, { content: '❌ Fournis un rôle ou un salon.', ephemeral: true });
    await Config.updateOne({ guildId: gid }, { [cle]: value }, { upsert: true });
    const label = role ? `<@&${role.id}>` : `<#${salon.id}>`;
    return safeReply(interaction, { content: `✅ **${cle}** configuré : ${label}`, ephemeral: true });
  }

  if (sub === 'partnerpost') {
    const freshConfig = await Config.findOne({ guildId: gid });
    const { postConditionsEmbed } = require('../../systems/partenariat');
    const msg = await postConditionsEmbed(interaction.guild, freshConfig);
    if (!msg) return safeReply(interaction, { content: '❌ Configure d\'abord `/setup partenariat cle:📋 Salon conditions`', ephemeral: true });
    return safeReply(interaction, { content: `✅ Embed partenariat posté dans <#${msg.channel.id}> !`, ephemeral: true });
  }

  // ── Règlement post ────────────────────────────────────────────────────────
  if (sub === 'reglementpost') {
    const banniere  = interaction.options.getString('banniere');
    const freshConfig = await Config.findOne({ guildId: gid });
    const { postReglementEmbed } = require('../../systems/reglement');
    const msg = await postReglementEmbed(interaction.guild, freshConfig, banniere);
    if (!msg) return safeReply(interaction, { content: '❌ Configure d\'abord `/setup animation cle:📋 Salon règlement`', ephemeral: true });
    return safeReply(interaction, { content: `✅ Règlement posté dans <#${msg.channel.id}> !`, ephemeral: true });
  }

  // ── Animation config ──────────────────────────────────────────────────────
  if (sub === 'animation') {
    const cle   = interaction.options.getString('cle');
    const role  = interaction.options.getRole('role');
    const salon = interaction.options.getChannel('salon');
    const val   = interaction.options.getString('valeur');

    const channelKeys = ['reglementChannelId', 'roiDuJourChannelId', 'boostChannelId', 'conseilChannelId', 'announceChannelId', 'statsChannelId', 'defiChannelId'];
    const roleKeys    = ['membreRoleId', 'roiDuJourRoleId', 'announcePingRoleId', 'announceRoleId', 'boostPingRoleId', 'dailyBonusRoleId'];
    const strKeys     = ['boostGifUrl'];
    const numKeys     = ['boostXpBonus', 'pinStarThreshold'];

    let value;
    if (channelKeys.includes(cle)) value = salon?.id;
    else if (roleKeys.includes(cle)) value = role?.id;
    else if (strKeys.includes(cle)) value = val;
    else if (numKeys.includes(cle)) value = val ? parseInt(val) : null;

    if (!value) return safeReply(interaction, { content: '❌ Fournis la bonne valeur selon la clé.', ephemeral: true });

    await Config.updateOne({ guildId: gid }, { [cle]: value }, { upsert: true });
    const label = salon ? `<#${salon.id}>` : role ? `<@&${role.id}>` : `\`${value}\``;
    return safeReply(interaction, { content: `✅ **${cle}** → ${label}`, ephemeral: true });
  }

  // ── Missions ──────────────────────────────────────────────────────────────
  if (sub === 'missions') {
    const activer = interaction.options.getBoolean('activer');
    const salon   = interaction.options.getChannel('salon');
    const update  = {};
    if (activer !== null) update.missionsEnabled   = activer;
    if (salon)            update.missionsChannelId = salon.id;
    if (!Object.keys(update).length) return safeReply(interaction, { content: '❌ Fournis au moins un paramètre.', ephemeral: true });
    await Config.updateOne({ guildId: gid }, update, { upsert: true });
    const parts = [];
    if (activer !== null) parts.push(`Missions **${activer ? 'activées' : 'désactivées'}**`);
    if (salon) parts.push(`Salon → <#${salon.id}>`);
    return safeReply(interaction, { content: `✅ ${parts.join(' · ')}`, ephemeral: true });
  }

  // ── Pub tickets ───────────────────────────────────────────────────────────
  if (sub === 'pub') {
    const cle   = interaction.options.getString('cle');
    const salon = interaction.options.getChannel('salon');
    if (!salon) return safeReply(interaction, { content: '❌ Fournis un salon.', ephemeral: true });
    await Config.updateOne({ guildId: gid }, { [cle]: salon.id }, { upsert: true });
    return safeReply(interaction, { content: `✅ **${cle}** → <#${salon.id}>`, ephemeral: true });
  }

  // ── Durée période d'essai ─────────────────────────────────────────────────
  if (sub === 'trialdays') {
    const jours = interaction.options.getInteger('jours');
    await Config.updateOne({ guildId: gid }, { trialDays: jours }, { upsert: true });
    return safeReply(interaction, { content: `✅ Période d'essai staff → **${jours} jours**`, ephemeral: true });
  }

  // ── King of the Staff ─────────────────────────────────────────────────────
  if (sub === 'kingstaff') {
    const cle   = interaction.options.getString('cle');
    const role  = interaction.options.getRole('role');
    const salon = interaction.options.getChannel('salon');
    const value = cle === 'staffClassementChannelId' ? (salon?.id || null) : (role?.id || null);
    if (!value) return safeReply(interaction, { content: '❌ Fournis un rôle ou un salon.', ephemeral: true });
    await Config.updateOne({ guildId: gid }, { [cle]: value }, { upsert: true });

    // Si c'est le salon, créer le live board automatiquement
    if (cle === 'staffClassementChannelId' && salon) {
      const freshConfig = await Config.findOne({ guildId: gid });
      const guild       = interaction.guild;
      const { updateStaffLiveBoard } = require('../../systems/kingstaff');
      const channel = guild.channels.cache.get(salon.id);
      if (channel) {
        const { EmbedBuilder } = require('discord.js');
        const initMsg = await channel.send({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🏆 Classement Staff — Live')
          .setDescription('Aucune activité staff cette semaine pour l\'instant.')
          .setTimestamp()
        ]});
        await initMsg.pin().catch(() => {});
        await Config.updateOne({ guildId: gid }, { staffLiveBoardMessageId: initMsg.id });
      }
    }

    const label = role ? `<@&${role.id}>` : `<#${salon.id}>`;
    return safeReply(interaction, { content: `✅ **${cle}** configuré : ${label}`, ephemeral: true });
  }

  // ── Lier un rôle couleur existant ─────────────────────────────────────────
  if (sub === 'couleurlier') {
    const role  = interaction.options.getRole('role');
    const emoji = interaction.options.getString('emoji');

    // Vérifier si ce rôle est déjà lié
    const freshConfig = await Config.findOne({ guildId: gid });
    const alreadyLinked = (freshConfig?.colorRoleIds || []).find(cr => cr.roleId === role.id);
    if (alreadyLinked) {
      return safeReply(interaction, {
        content: `⚠️ Le rôle <@&${role.id}> est déjà lié comme couleur **${alreadyLinked.emoji} ${alreadyLinked.name}**.`,
        ephemeral: true,
      });
    }

    await Config.updateOne(
      { guildId: gid },
      { $push: { colorRoleIds: { name: role.name, roleId: role.id, emoji } } },
      { upsert: true }
    );

    return safeReply(interaction, {
      content: `✅ Rôle couleur **${emoji} ${role.name}** lié au bot !\nIl apparaîtra maintenant dans le menu déroulant couleur.`,
      ephemeral: true,
    });
  }

  // ── Retirer un rôle couleur du menu ───────────────────────────────────────
  if (sub === 'couleurretirer') {
    const role = interaction.options.getRole('role');
    await Config.updateOne(
      { guildId: gid },
      { $pull: { colorRoleIds: { roleId: role.id } } }
    );
    return safeReply(interaction, {
      content: `✅ Rôle <@&${role.id}> retiré du menu couleur.`,
      ephemeral: true,
    });
  }

  // ── DM Bienvenue — envoyer à tous les membres existants ──────────────────
  if (sub === 'dmbienvenue') {
    const { checkPermission } = require('../../systems/hierarchy');
    const ok = await checkPermission(interaction, 'setup_config');
    if (!ok) return;

    await interaction.deferReply({ ephemeral: true });

    const guild   = interaction.guild;
    const { sendWelcomeDM } = require('../../systems/presentation');

    const members = await guild.members.fetch();
    const humans  = members.filter(m => !m.user.bot);

    let sent = 0, failed = 0;

    await interaction.editReply({ content: `⏳ Envoi des DMs de bienvenue à **${humans.size}** membres... (cela peut prendre quelques minutes)` });

    for (const [, member] of humans) {
      try {
        await sendWelcomeDM(member, client);
        sent++;
        // Rate limit Discord : 1 DM par 400ms max
        await new Promise(r => setTimeout(r, 400));
      } catch (_) { failed++; }
    }

    return interaction.editReply({
      content: `✅ DMs de bienvenue envoyés !\n**${sent}** succès · **${failed}** échecs (membres avec DMs désactivés)`,
    });
  }

  // ── Logs channel ─────────────────────────────────────────────────────────
  if (sub === 'logs') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { logChannelId: salon.id }, { upsert: true });
    return safeReply(interaction, {
      content: `✅ Salon des logs défini : <#${salon.id}>\nTous les warns, kicks, bans et actions staff seront logués ici.`,
      ephemeral: true,
    });
  }

  // ── Live Board ────────────────────────────────────────────────────────────
  if (sub === 'liveboard') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { liveBoardChannelId: salon.id, liveBoardMessageId: null }, { upsert: true });
    const freshConfig = await Config.findOne({ guildId: gid });
    const { createLiveBoard } = require('../../systems/xp/liveboard');
    const msgId = await createLiveBoard(interaction.guild, freshConfig);
    if (msgId) {
      await Config.updateOne({ guildId: gid }, { liveBoardMessageId: msgId });
      return safeReply(interaction, {
        content: `✅ Classement live créé et épinglé dans <#${salon.id}> !\nIl se met à jour automatiquement à chaque level-up et après chaque reset.`,
        ephemeral: true,
      });
    }
    return safeReply(interaction, { content: `❌ Impossible de créer le live board dans <#${salon.id}>. Vérifie les permissions du bot.`, ephemeral: true });
  }

  // ── Animal Trigger (sons → image) ────────────────────────────────────────
  if (sub === 'animaltrigger') {
    const salon = interaction.options.getChannel('salon');
    if (salon) {
      await Config.updateOne({ guildId: gid }, { animalTriggerChannelId: salon.id }, { upsert: true });
      return safeReply(interaction, {
        content: `✅ Sons animaux activés dans <#${salon.id}> !\n🐶 woaf → image chien · 🐱 miaou → image chat · 🦊 etc.\n\nC'est indépendant de la guerre chien vs chat.`,
        ephemeral: true,
      });
    } else {
      await Config.updateOne({ guildId: gid }, { animalTriggerChannelId: null }, { upsert: true });
      return safeReply(interaction, { content: '⏸️ Sons animaux désactivés.', ephemeral: true });
    }
  }

  // ── Animal Mention toggle ─────────────────────────────────────────────────
  if (sub === 'animalmention') {
    const newState = !config.animalMentionEnabled;
    await Config.updateOne({ guildId: gid }, { animalMentionEnabled: newState }, { upsert: true });
    return safeReply(interaction, {
      content: newState
        ? '✅ Détection animaux en fin de phrase **activée** ! Les gens peuvent dire "j\'ai un chien" pour spawner une image 🐾'
        : '⏸️ Détection animaux en fin de phrase **désactivée**.',
      ephemeral: true,
    });
  }

  // ── Retirer un salon média ────────────────────────────────────────────────
  if (sub === 'retiremedia') {
    const channel = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { $pull: { mediaChannelIds: channel.id } });
    return safeReply(interaction, { content: `✅ <#${channel.id}> retiré des salons média.`, ephemeral: true });
  }


  // ── Fix permissions salon média ───────────────────────────────────────────
  if (sub === 'fixmedia') {
    await interaction.deferReply({ ephemeral: true });
    const config = await Config.findOne({ guildId: gid });
    const mediaIds = config?.mediaChannelIds || [];

    if (!mediaIds.length) {
      return safeReply(interaction, { content: '❌ Aucun salon média configuré. Fais dabord /setup salon.', ephemeral: true });
    }

    const { PermissionFlagsBits } = require('discord.js');
    let fixed = 0;

    for (const channelId of mediaIds) {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) continue;

      try {
        // @everyone : peut PAS envoyer dans le salon mais PEUT dans les fils
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          SendMessages:          false,  // bloque écriture directe dans le salon
          SendMessagesInThreads: true,   // autorise écriture dans les fils ✅
          ReadMessageHistory:    true,   // peut lire
          ViewChannel:           true,   // peut voir
          CreatePublicThreads:   false,  // seul le bot crée les threads
        });
        fixed++;
      } catch (err) {
        logger.warn('Setup', 'fixmedia permission error: ' + err.message);
      }
    }

    return safeReply(interaction, {
      content: `✅ Permissions corrigées sur **${fixed}** salon(s) média !

` +
        `✅ Les membres peuvent écrire dans les fils
` +
        `❌ Les membres ne peuvent pas écrire directement dans le salon
` +
        `❌ Les membres ne peuvent pas créer leurs propres fils`,
      ephemeral: true,
    });
  }

  // ── Counting timeout ─────────────────────────────────────────────────────
  if (sub === 'counting') {
    const timeout = interaction.options.getInteger('timeout') || 5;
    await Config.updateOne({ guildId: gid }, { countingTimeoutMinutes: timeout }, { upsert: true });
    return safeReply(interaction, { content: `✅ Punition counting : **${timeout} min** d'interdiction d'écrire.\n\nN'oublie pas de configurer le salon : /setup salon → Counting.`, ephemeral: true });
  }


  // ── Ghost Bot ──────────────────────────────────────────────────────────────
  if (sub === 'ghostbot') {
    const salon = interaction.options.getChannel('salon');
    if (salon) {
      await Config.updateOne({ guildId: gid }, { ghostBotChannelId: salon.id }, { upsert: true });
      const { startVoicePresence } = require('../../systems/voicepresence');
      await startVoicePresence(client, gid, salon.id).catch(() => {});
      return safeReply(interaction, { content: `✅ Ghost Bot connecté dans <#${salon.id}> ! Il restera silencieux 24/7. 👻`, ephemeral: true });
    } else {
      await Config.updateOne({ guildId: gid }, { ghostBotChannelId: null }, { upsert: true });
      const { stopVoicePresence } = require('../../systems/voicepresence');
      stopVoicePresence();
      return safeReply(interaction, { content: '⏸️ Ghost Bot déconnecté.', ephemeral: true });
    }
  }

  // ── Invite Tracker ─────────────────────────────────────────────────────────
  if (sub === 'invitetracker') {
    const newState = !config?.inviteTrackerEnabled;
    await Config.updateOne({ guildId: gid }, { inviteTrackerEnabled: newState }, { upsert: true });
    if (newState) {
      const { loadInvites } = require('../../systems/invitetracker');
      await loadInvites(interaction.guild).catch(() => {});
    }
    return safeReply(interaction, {
      content: newState
        ? "✅ Invite Tracker **activé** ! L'inviteur gagne **+50 XP** à chaque nouvel arrivant. 🎉"
        : '⏸️ Invite Tracker **désactivé**.',
      ephemeral: true,
    });
  }

  // ── Bump Rôle ──────────────────────────────────────────────────────────────
  if (sub === 'bumprole') {
    const role = interaction.options.getRole('role');
    await Config.updateOne({ guildId: gid }, { bumpRoleId: role?.id || null }, { upsert: true });
    return safeReply(interaction, {
      content: role
        ? `✅ Les rappels de bump pingueront <@&${role.id}> au lieu de @here.`
        : '✅ Rappels de bump : @here (aucun rôle spécifique).',
      ephemeral: true,
    });
  }

  // ── Exclusion XP ─────────────────────────────────────────────────────────
  if (sub === 'exclusion') {
    const salon   = interaction.options.getChannel('salon');
    const already = config.xpExcludedChannels.includes(salon.id);
    const upd     = already
      ? { $pull: { xpExcludedChannels: salon.id } }
      : { $push: { xpExcludedChannels: salon.id } };
    await Config.updateOne({ guildId: gid }, upd);
    return safeReply(interaction, {
      content: `${already ? '✅ Salon réintégré' : '⛔ Salon exclu'} du gain XP : <#${salon.id}>`,
      ephemeral: true,
    });
  }

  // ── Streak ────────────────────────────────────────────────────────────────
  if (sub === 'streak') {
    const enabled = !(config.streakEnabled);
    await Config.updateOne({ guildId: gid }, { streakEnabled: enabled }, { upsert: true });
    return safeReply(interaction, {
      content: `✅ Streak journalier **${enabled ? 'activé' : 'désactivé'}**. Les membres gagnent du bonus XP s'ils sont actifs chaque jour.`,
      ephemeral: true,
    });
  }

  // ── Giveaway salon ────────────────────────────────────────────────────────
  if (sub === 'giveaway') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { giveawayChannelId: salon?.id || null }, { upsert: true });
    return safeReply(interaction, {
      content: salon
        ? `✅ Les giveaways seront postés dans <#${salon.id}>.`
        : '✅ Salon giveaway retiré — les giveaways seront postés dans le salon de la commande.',
      ephemeral: true,
    });
  }

  // ── Défis salon ───────────────────────────────────────────────────────────
  if (sub === 'defis') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { defisChannelId: salon?.id || interaction.channelId }, { upsert: true });
    return safeReply(interaction, {
      content: `✅ Salon des défis configuré : <#${salon?.id || interaction.channelId}>.`,
      ephemeral: true,
    });
  }

  // ── Mudae salon ($give kakera) ────────────────────────────────────────────
  if (sub === 'mudae') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { mudaeChannelId: salon.id }, { upsert: true });
    return safeReply(interaction, {
      content: `✅ Salon Mudae configuré : <#${salon.id}>. Le bot enverra \`$give\` dans ce salon pour les récompenses kakera.`,
      ephemeral: true,
    });
  }
}

module.exports = { handle };
