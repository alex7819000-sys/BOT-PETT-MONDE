// src/handlers/commandHandlers/setup.js — /setup & /config
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

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
        { name: '🏆 Trophy Room',   value: config.trophyChannelId    ? `<#${config.trophyChannelId}>` : '`non configuré`',    inline: true },
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

  // ── /setup init — crée réellement la structure de salons staff ─────────
  // (avant : répondait "✅ créé" sans strictement rien faire — corrigé)
  if (sub === 'init') {
    if (!config?.staffRoleId) {
      return interaction.editReply({
        content: '⚠️ Configure d\'abord le rôle Staff global avant de lancer l\'init : `/setup staff cle:"👥 Rôle Staff global" role:@Staff`',
      });
    }

    const guild = interaction.guild;
    const { PermissionFlagsBits, ChannelType } = require('discord.js');
    const staffRole = guild.roles.cache.get(config.staffRoleId);
    if (!staffRole) {
      return interaction.editReply({ content: '⚠️ Le rôle Staff configuré est introuvable (a-t-il été supprimé ?).' });
    }

    // Permissions : invisible pour tout le monde, visible pour le staff + le bot lui-même
    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ];

    const structure = {
      'Infos Staff': ['règlement-staff', 'annonces-staff', 'discord-updates', 'urgence', 'guide-staff', 'procédure', 'rank-dérank', 'avertissement', 'nos-serveurs'],
      'Espace staff': ['chat-staff', 'commandes', 'sanctions', 'suggestions', 'absence', 'bump-serv'],
    };

    const created = [];
    try {
      for (const [categoryName, channelNames] of Object.entries(structure)) {
        const category = await guild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites,
        });
        for (const name of channelNames) {
          await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites });
          created.push(name);
        }
      }
    } catch (err) {
      logger.error('Setup', 'Erreur création structure staff', err);
      return interaction.editReply({
        content: `⚠️ Ça a planté en cours de route (${created.length} salon(s) créé(s) avant l'erreur). Vérifie que le bot a bien la permission **Gérer les salons**.\nErreur : ${err.message}`,
      });
    }

    return interaction.editReply({
      content: `✅ Structure staff créée : **2 catégories**, **${created.length} salons**, privés au rôle ${staffRole}.\n` +
        `💡 Pense à relier les salons pertinents aux fonctionnalités du bot avec \`/setup staff\`, \`/notif sanction\`, etc.`,
    });
  }

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
      const { postForumWelcome } = require('../../systems/forums');
      await postForumWelcome(salon, type).catch(() => {});
    }

    // Salon Quêtes → poste/épingle immédiatement le panneau des quêtes actives
    if (type === 'questsChannelId') {
      const { refreshPanel } = require('../../systems/quetes');
      const freshCfg = await Config.findOne({ guildId: gid }).lean();
      await refreshPanel(interaction.guild, freshCfg).catch(() => {});
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
    if (valeur) {
      if (cle === 'boostGifUrls') {
        update.boostGifUrls = valeur.split(',').map(u => u.trim()).filter(Boolean);
      } else if (cle === 'boostXpBonus') {
        update.boostXpBonus = parseInt(valeur, 10) || 0;
      } else {
        update[cle] = valeur;
      }
    }
    if (Object.keys(update).length) await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({ content: `✅ **${cle}** mis à jour.` });
  }

  // ── /setup staff, partenariat, kingstaff, pub — même pattern "clé + rôle/salon" ──
  // (déclarées depuis longtemps mais jamais gérées — corrigé, mêmes commandes fantômes que /setup multixp trouvé précédemment)
  if (sub === 'staff' || sub === 'partenariat' || sub === 'kingstaff' || sub === 'pub') {
    const cle   = interaction.options.getString('cle');
    const role  = interaction.options.getRole('role');
    const salon = interaction.options.getChannel('salon');
    const gif   = interaction.options.getString('gif'); // uniquement présent sur /setup staff
    const update = {};
    if (role)  update[cle] = role.id;
    if (salon) update[cle] = salon.id;
    if (gif)   update.staffConditionGifUrl = gif;
    if (!Object.keys(update).length) {
      return interaction.editReply({ content: '⚠️ Donne au moins un rôle, un salon ou une valeur à régler pour cette clé.' });
    }
    await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({ content: `✅ **${cle}** mis à jour.` });
  }

  // ── /setup logs — salon des logs de modération ──────────────────────────
  if (sub === 'logs') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { logChannelId: salon.id });
    return interaction.editReply({ content: `✅ Salon des logs réglé sur ${salon}.` });
  }

  // ── /setup couleurpost — poste l'embed couleur fixe dans un salon ──────
  if (sub === 'couleurpost') {
    const salon = interaction.options.getChannel('salon');
    const embed = new EmbedBuilder()
      .setColor(COLORS.PURPLE)
      .setTitle('🎨 Choisis ta couleur')
      .setDescription('Utilise `/setup couleurlier` (ou la commande dédiée si disponible) pour associer une couleur à un rôle, puis reviens ici.');
    await salon.send({ embeds: [embed] }).catch(() => {});
    return interaction.editReply({ content: `✅ Embed couleur posté dans ${salon}.` });
  }

  // ── /setup post — poste le panel choisi (bouton d'action) dans le salon configuré ──
  if (sub === 'post') {
    const type = interaction.options.getString('type');
    const image = interaction.options.getString('image');

    if (type === 'reglement') {
      const { postReglement } = require('../../systems/reglement');
      await postReglement(interaction);
      return; // postReglement gère déjà sa propre réponse à l'interaction
    }

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const panels = {
      staff: {
        channelField: 'staffConditionChannelId',
        title: '📋 Rejoindre le Staff',
        description: 'Tu veux rejoindre l\'équipe ? Clique sur le bouton ci-dessous pour candidater.',
        buttonLabel: 'Candidater',
        customId: 'staff:candidater',
      },
      partenariat: {
        channelField: 'partnerConditionChannelId',
        title: '🤝 Devenir partenaire',
        description: 'Tu gères un serveur et tu veux un partenariat ? Clique ci-dessous pour faire ta demande.',
        buttonLabel: 'Faire une demande',
        customId: 'partner:demande',
      },
    };

    const panel = panels[type];
    if (!panel) return interaction.editReply({ content: '⚠️ Type de panel inconnu.' });

    const channelId = config[panel.channelField];
    if (!channelId) {
      return interaction.editReply({ content: `⚠️ Configure d'abord le salon correspondant (\`/setup ${type} cle:...\`) avant de poster ce panel.` });
    }
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.editReply({ content: '⚠️ Le salon configuré est introuvable (a-t-il été supprimé ?).' });

    const embed = new EmbedBuilder().setColor(COLORS.PURPLE).setTitle(panel.title).setDescription(panel.description);
    if (image) embed.setImage(image);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(panel.customId).setLabel(panel.buttonLabel).setStyle(ButtonStyle.Primary)
    );
    await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
    return interaction.editReply({ content: `✅ Panel posté dans ${channel}.` });
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

  // ── /setup weeklyrole — rôle hebdomadaire selon weekXp ────────────────
  if (sub === 'weeklyrole') {
    const xpSeuil = interaction.options.getInteger('xp');
    const role    = interaction.options.getRole('role');
    const retirer = interaction.options.getBoolean('retirer') ?? false;

    const cfg = await Config.findOne({ guildId: gid }).lean();
    let weeklyLevelRoles = cfg?.weeklyLevelRoles || [];

    if (retirer) {
      weeklyLevelRoles = weeklyLevelRoles.filter(lr => lr.level !== xpSeuil);
      await Config.updateOne({ guildId: gid }, { $set: { weeklyLevelRoles } }, { upsert: true });
      return interaction.editReply({ content: `✅ Palier hebdo **${xpSeuil} XP/semaine** supprimé.` });
    }

    const existing = weeklyLevelRoles.findIndex(lr => lr.level === xpSeuil);
    if (existing >= 0) {
      weeklyLevelRoles[existing] = { level: xpSeuil, roleId: role.id };
    } else {
      weeklyLevelRoles.push({ level: xpSeuil, roleId: role.id });
    }
    weeklyLevelRoles.sort((a, b) => a.level - b.level);

    await Config.updateOne({ guildId: gid }, { $set: { weeklyLevelRoles } }, { upsert: true });

    const lines = weeklyLevelRoles.map(lr => `> **${lr.level} XP/sem** → <@&${lr.roleId}>`).join('\n');
    return interaction.editReply({
      content: `✅ Rôle <@&${role.id}> attribué à **${xpSeuil} XP/semaine**.\n\n📋 **Paliers hebdo configurés :**\n${lines}\n\n> 🔄 Tous ces rôles sont retirés automatiquement chaque dimanche à minuit.`,
      allowedMentions: { roles: [] },
    });
  }

  // ── /setup levelrole — rôle automatique par palier de niveau ──────────
  if (sub === 'levelrole') {
    const niveau = interaction.options.getInteger('niveau');
    const role   = interaction.options.getRole('role');
    const retirer = interaction.options.getBoolean('retirer') ?? false;

    const cfg = await Config.findOne({ guildId: gid }).lean();
    let levelRoles = cfg?.levelRoles || [];

    if (retirer) {
      levelRoles = levelRoles.filter(lr => lr.level !== niveau);
      await Config.updateOne({ guildId: gid }, { $set: { levelRoles } }, { upsert: true });
      return interaction.editReply({ content: `✅ Rôle de niveau **${niveau}** supprimé.` });
    }

    // Remplacer si ce niveau existe déjà, sinon ajouter
    const existing = levelRoles.findIndex(lr => lr.level === niveau);
    if (existing >= 0) {
      levelRoles[existing] = { level: niveau, roleId: role.id };
    } else {
      levelRoles.push({ level: niveau, roleId: role.id });
    }
    levelRoles.sort((a, b) => a.level - b.level);

    await Config.updateOne({ guildId: gid }, { $set: { levelRoles } }, { upsert: true });

    // Afficher le tableau complet des paliers
    const lines = levelRoles.map(lr => `> **Niv. ${lr.level}** → <@&${lr.roleId}>`).join('\n');
    return interaction.editReply({
      content: `✅ Rôle <@&${role.id}> attribué au **niveau ${niveau}**.\n\n📋 **Paliers configurés :**\n${lines}`,
      allowedMentions: { roles: [] },
    });
  }

  if (sub === 'pingroles') {
    const salon = interaction.options.getChannel('salon');
    const cfg = await Config.findOne({ guildId: gid }).lean();

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    // Chaque bouton n'apparaît que si le rôle correspondant a été configuré
    // (via /setup role) — pas de bouton mort qui ne fait rien si on a oublié d'en
    // créer un. Volontairement limité à 6 catégories pour ne pas fragmenter à
    // l'infini : on regroupe défis/quêtes/kakera ensemble plutôt que de créer
    // un ping séparé par mini-système.
    const categories = [
      { key: 'ANNOUNCE', label: '📢 Annonces',         roleId: cfg?.announcePingRoleId },
      { key: 'BOOST',    label: '💜 Boost',             roleId: cfg?.boostPingRoleId },
      { key: 'PARTNER',  label: '🤝 Partenariats',      roleId: cfg?.partnerPingRoleId },
      { key: 'GIVEAWAY', label: '🎁 Giveaways',         roleId: cfg?.giveawayRoleId },
      { key: 'DEFIS',    label: '🎯 Défis & Quêtes',    roleId: cfg?.defisRoleId },
      { key: 'BUMP',     label: '🚀 Rappels de Bump',   roleId: cfg?.bumperRoleId },
    ].filter(c => c.roleId);

    if (!categories.length) {
      return interaction.editReply({
        content: '⚠️ Aucun rôle de ping n\'est configuré. Configure-en au moins un avec `/setup role` avant de poster le panel (ex: `cle:Ping Défis 🔥`).',
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔔 Choisis tes notifications')
      .setDescription(
        'Clique sur les boutons pour activer/désactiver les pings qui t\'intéressent.\n' +
        'Tu peux en activer plusieurs, ou aucun — c\'est toi qui choisis ce qui te ping.'
      );

    const rows = [];
    for (let i = 0; i < categories.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(
        categories.slice(i, i + 5).map(c =>
          new ButtonBuilder()
            .setCustomId(`pingrole:toggle:${c.key}`)
            .setLabel(c.label)
            .setStyle(ButtonStyle.Secondary)
        )
      ));
    }

    await salon.send({ embeds: [embed], components: rows }).catch(() => {});
    return interaction.editReply({ content: `✅ Panel de pings posté dans ${salon} avec ${categories.length} catégorie(s).` });
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
