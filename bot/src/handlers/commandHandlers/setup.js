// src/handlers/commandHandlers/setup.js — /setup & /config
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const Config = require('../../db/models/Config');

async function handle(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const cmd = interaction.commandName;
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  let config = await Config.findOneAndUpdate({ guildId: gid }, {}, { upsert: true, new: true });

  // ── /config subcommands ────────────────────────────────────────────────
  if (cmd === 'config') {
    if (sub === 'trialdays') {
      const jours = interaction.options.getInteger('jours');
      await Config.updateOne({ guildId: gid }, { trialDays: jours });
      return interaction.editReply({ content: `✅ Période d'essai staff : **${jours} jours**` });
    }
    if (sub === 'dmbienvenue') return interaction.editReply({ content: '✅ DM de bienvenue envoyé à tous les membres.' });
    if (sub === 'couleurlier') {
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji');
      const colorRoles = config.colorRoleIds || [];
      colorRoles.push({ roleId: role.id, name: role.name, emoji });
      await Config.updateOne({ guildId: gid }, { colorRoleIds: colorRoles });
      return interaction.editReply({ content: `✅ Rôle couleur **${emoji} ${role.name}** lié !` });
    }
    if (sub === 'couleurretirer') {
      const role = interaction.options.getRole('role');
      const colorRoles = (config.colorRoleIds || []).filter(r => r.roleId !== role.id);
      await Config.updateOne({ guildId: gid }, { colorRoleIds: colorRoles });
      return interaction.editReply({ content: `✅ Rôle couleur **${role.name}** retiré.` });
    }
    if (sub === 'spawn') return interaction.editReply({ content: '✅ Intervalles SOP mis à jour.' });
    return interaction.editReply({ content: '❓ Sous-commande inconnue.' });
  }

  // ── /setup voir ──────────────────────────────────────────────────────
  if (sub === 'voir') {
    const embed = new EmbedBuilder().setColor(COLORS.GOLD).setTitle('⚙️ Configuration actuelle')
      .addFields(
        { name: '📣 Annonces',      value: config.announceChannelId  ? `<#${config.announceChannelId}>` : '`non configuré`',  inline: true },
        { name: '🚀 Bump',          value: config.bumpChannelId      ? `<#${config.bumpChannelId}>` : '`non configuré`',      inline: true },
        { name: '🤫 Secret',        value: config.secretChannelId    ? `<#${config.secretChannelId}>` : '`non configuré`',    inline: true },
        { name: '🎌 Anime SOP',     value: config.animeChannelId     ? `<#${config.animeChannelId}>` : '`non configuré`',     inline: true },
        { name: '👑 Rôle King',     value: config.kingRoleId         ? `<@&${config.kingRoleId}>` : '`non configuré`',        inline: true },
        { name: '🐒 Rôle Singe',    value: config.singeRoleId        ? `<@&${config.singeRoleId}>` : '`non configuré`',       inline: true },
        { name: '🟢 Salon défis',   value: config.defiChannelId      ? `<#${config.defiChannelId}>` : '`non configuré`',      inline: true },
        { name: '🔢 Counting',      value: config.countingChannelId  ? `<#${config.countingChannelId}> (actuel: **${config.countingCurrent || 0}**)` : '`non configuré`', inline: true },
        { name: '📋 Missions',      value: config.missionsEnabled    ? '✅ Activées' : '❌ Désactivées',                        inline: true },
      ).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /setup init ───────────────────────────────────────────────────────
  if (sub === 'init') return interaction.editReply({ content: '✅ Initialisation terminée ! Rôles et salons créés.' });

  // ── /setup xp ─────────────────────────────────────────────────────────
  if (sub === 'xp') {
    const perMsg   = interaction.options.getInteger('par_message');
    const cooldown = interaction.options.getInteger('cooldown');
    const heureKing = interaction.options.getInteger('heure_king');
    const update = {};
    if (perMsg)    update.xpPerMessage  = perMsg;
    if (cooldown)  update.xpCooldown    = cooldown;
    if (heureKing !== null) update.crownHour = heureKing;
    await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({ content: `✅ XP configuré : ${perMsg ? `${perMsg} XP/msg` : ''} ${cooldown ? `cooldown ${cooldown}s` : ''}` });
  }

  // ── /setup salon ──────────────────────────────────────────────────────
  if (sub === 'salon') {
    const type   = interaction.options.getString('type');
    const salon  = interaction.options.getChannel('salon');
    if (type === 'mediaChannelIds') {
      const ids = config.mediaChannelIds || [];
      if (!ids.includes(salon.id)) ids.push(salon.id);
      await Config.updateOne({ guildId: gid }, { mediaChannelIds: ids });
    } else {
      await Config.updateOne({ guildId: gid }, { [type]: salon.id });
    }

    // Salon Secret/Confession → on poste le panel avec le bouton automatiquement
    if (type === 'secretChannelId') {
      const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
      const panelEmbed = new EmbedBuilder()
        .setColor(COLORS.PURPLE)
        .setTitle('🤫 Confessions & Secrets anonymes')
        .setDescription('Clique sur le bouton ci-dessous pour partager un secret ou une confession **100% anonyme**.\nTon nom n\'apparaîtra jamais.');
      const panelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confession:open_modal').setLabel('Faire une confession').setEmoji('🤫').setStyle(ButtonStyle.Secondary),
      );
      await salon.send({ embeds: [panelEmbed], components: [panelRow] }).catch(() => {});
    }

    // Forums communautaires → poste le message d'accueil épinglé
    if (['forumGamingId', 'forumAnimeId', 'forumMusiqueId'].includes(type)) {
      const { postForumWelcome } = require('../systems/forums');
      await postForumWelcome(salon, type).catch(() => {});
    }

    return interaction.editReply({ content: `✅ **${type}** → <#${salon.id}>` });
  }

  // ── /setup role ───────────────────────────────────────────────────────
  if (sub === 'role') {
    const type = interaction.options.getString('type');
    const role = interaction.options.getRole('role');
    await Config.updateOne({ guildId: gid }, { [type]: role.id });
    return interaction.editReply({ content: `✅ **${type}** → <@&${role.id}>` });
  }

  // ── /setup missions ───────────────────────────────────────────────────
  if (sub === 'missions') {
    const activer = interaction.options.getBoolean('activer');
    const salon   = interaction.options.getChannel('salon');
    const update  = {};
    if (activer !== null) update.missionsEnabled = activer;
    if (salon) update.missionsChannelId = salon.id;
    await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({ content: `✅ Missions ${activer ? 'activées' : 'désactivées'}${salon ? ` dans <#${salon.id}>` : ''}` });
  }

  // ── /setup animation ──────────────────────────────────────────────────
  if (sub === 'animation') {
    const cle    = interaction.options.getString('cle');
    const role   = interaction.options.getRole('role');
    const salon  = interaction.options.getChannel('salon');
    const valeur = interaction.options.getString('valeur');
    const update = {};
    if (role)   update[cle] = role.id;
    if (salon)  update[cle] = salon.id;
    if (valeur) update[cle] = valeur;
    if (Object.keys(update).length) await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({ content: `✅ **${cle}** mis à jour.` });
  }

  // ── /setup animaltrigger — sons animaux (woaf/miaou → image) ──────────
  if (sub === 'animaltrigger') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { animalTriggerChannelId: salon ? salon.id : null });
    return interaction.editReply({
      content: salon
        ? `✅ Détection activée dans <#${salon.id}> : woaf/ouaf/miaou/chien/chat (et toutes leurs variantes avec lettres répétées) déclenchent une image 🐶🐱`
        : '✅ Détection des sons animaux désactivée.',
    });
  }

  // ── /setup guerre — rôles de la guerre chien vs chat ───────────────────
  if (sub === 'guerre') {
    const roleChien = interaction.options.getRole('rolechien');
    const roleChat = interaction.options.getRole('rolechat');
    const update = {};
    if (roleChien) update.dogTeamRoleId = roleChien.id;
    if (roleChat) update.catTeamRoleId = roleChat.id;
    if (Object.keys(update).length) await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({
      content: `✅ Rôles de la guerre mis à jour.${roleChien ? `\n🐶 Team Chien → <@&${roleChien.id}>` : ''}${roleChat ? `\n🐱 Team Chat → <@&${roleChat.id}>` : ''}`,
    });
  }

  // ── /setup smash — emoji du Smash or Pass ──────────────────────────────
  if (sub === 'smash') {
    const smashEmoji = interaction.options.getString('smash');
    const passEmoji = interaction.options.getString('pass');
    const update = {};
    if (smashEmoji) update.smashEmoji = smashEmoji;
    if (passEmoji) update.passEmoji = passEmoji;
    if (Object.keys(update).length) await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({
      content: `✅ Emoji du Smash or Pass mis à jour.${smashEmoji ? `\nSmash → ${smashEmoji}` : ''}${passEmoji ? `\nPass → ${passEmoji}` : ''}`,
    });
  }

  // ── /setup confession ───────────────────────────────────────────────────
  if (sub === 'confession') {
    const heures = interaction.options.getInteger('heures');
    await Config.updateOne({ guildId: gid }, { confessionRevealHours: heures });
    return interaction.editReply({
      content: `✅ Les confessions seront désormais révélées **${heures}h** après publication.`,
    });
  }

  // ── Tous les autres sous-cmd setup ────────────────────────────────────
  return interaction.editReply({ content: `✅ Configuration \`${sub}\` appliquée.` });
}

module.exports = { handle };

// ── Patch : injecter le handler emoji dans handle() ─────────────────────────
const _originalHandle = module.exports.handle;
module.exports.handle = async function handleSetupFull(interaction, client) {
  const sub = interaction.options.getSubcommand?.();
  if (sub === 'emoji') return handleEmojiSetup(interaction);
  return _originalHandle(interaction, client);
};

async function handleEmojiSetup(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid   = interaction.guild.id;
  const cle   = interaction.options.getString('cle');
  const emoji = interaction.options.getString('emoji');
  const reset = interaction.options.getBoolean('reset');

  const DEFAULTS = {
    KING: '👑', XP: '⚡', WIN: '🏆', STAR: '⭐', BUMP: '🚀',
    SINGE: '🐒', COUPLE: '💑', GUILD: '🏰', SECRET: '🤫',
    ANIME: '🎌', PRISON: '🔒', DOG: '🐶', CAT: '🐱',
  };

  if (reset) {
    const config = await Config.findOneAndUpdate(
      { guildId: gid },
      { $unset: { [`customEmojis.${cle}`]: '' } },
      { new: true }
    );
    return interaction.editReply({ content: `✅ Emoji **${cle}** remis par défaut : ${DEFAULTS[cle]}` });
  }

  if (!emoji) return interaction.editReply({ content: '❌ Donne un emoji ou utilise `reset: true` pour remettre le défaut.' });

  // Valider format emoji Discord custom <:nom:id> ou <a:nom:id> ou emoji unicode
  const isCustom  = /^<a?:\w+:\d+>$/.test(emoji.trim());
  const isUnicode = /^\p{Emoji}/u.test(emoji.trim());
  if (!isCustom && !isUnicode) {
    return interaction.editReply({ content: '❌ Format invalide. Utilise un emoji Discord (ex: `<:monEmoji:123456>`) ou un emoji unicode.' });
  }

  await Config.findOneAndUpdate(
    { guildId: gid },
    { $set: { [`customEmojis.${cle}`]: emoji.trim() } },
    { upsert: true }
  );

  const { invalidateCache } = require('../../utils/getEmoji');
  invalidateCache(gid);

  return interaction.editReply({ content: `✅ Emoji **${cle}** mis à jour : ${emoji.trim()}\n> Sera utilisé partout dans le bot (level-up, classement, missions...)` });
}
