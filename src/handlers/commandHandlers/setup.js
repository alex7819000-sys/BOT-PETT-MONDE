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
        { name: '👑 King of the Day',   color: 0xFFD700, field: 'kingRoleId' },
        { name: '🐒 Singe du Serveur',  color: 0xFF5252, field: 'singeRoleId' },
        { name: '💑 Meilleur Couple',   color: 0xFF69B4, field: 'coupleRoleId' },
        { name: '🏆 Guilde Dominante',  color: 0xFFD700, field: 'guildeDominanteRoleId' },
      ];
      const updates = {};
      for (const def of rolesDef) {
        if (!config[def.field]) {
          const role = await guild.roles.create({ name: def.name, color: def.color, reason: 'Setup bot' });
          updates[def.field] = role.id;
        }
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

      if (Object.keys(updates).length) await Config.updateOne({ guildId: gid }, updates);

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

    // Si c'est le salon secret → poster le bouton persistant
    if (type === 'secretChannelId') {
      const { postSecretButton } = require('../../systems/secret');
      await postSecretButton(interaction.client, gid);
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
}

module.exports = { handle };
