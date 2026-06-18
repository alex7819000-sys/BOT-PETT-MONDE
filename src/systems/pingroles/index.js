// src/systems/pingroles/index.js — Système rôles ping auto-assignables
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

const PING_ROLES = [
  { key:'youtube',  configKey:'youtubeRoleId',  label:'Vidéos YouTube',    emoji:'🎬', desc:'Nouvelles vidéos de Kouzan' },
  { key:'twitch',   configKey:'twitchRoleId',   label:'Lives Twitch',      emoji:'🟣', desc:'Quand Kouzan est en live' },
  { key:'annonce',  configKey:'announceRoleId', label:'Annonces',          emoji:'📣', desc:'Annonces importantes du serveur' },
  { key:'giveaway', configKey:'giveawayRoleId', label:'Giveaways',         emoji:'🎁', desc:'Notifications giveaways' },
  { key:'defis',    configKey:'defisRoleId',    label:'Défis',             emoji:'⚔️', desc:'Nouveaux défis communautaires' },
  { key:'bump',     configKey:'bumpRoleId',     label:'Rappels Bump',      emoji:'🔵', desc:'Rappels pour bumper le serveur' },
];

async function postPingRolesMessage(client, guildId, channelId) {
  const config  = await Config.findOne({ guildId });
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return null;

  const available = PING_ROLES.filter(r => config?.[r.configKey]);
  if (!available.length) {
    logger.warn('PingRoles', 'Aucun rôle ping configuré');
    return null;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle('🔔 Choisir ses notifications')
    .setDescription(
      'Clique sur un bouton pour **recevoir ou arrêter** les notifications.\n\n' +
      available.map(r => `${r.emoji} **${r.label}** — ${r.desc}`).join('\n') +
      '\n\n> Clique à nouveau pour retirer le rôle.'
    )
    .setFooter({ text: 'Rôles auto-assignables — change à tout moment' })
    .setTimestamp();

  // Boutons par rangées de 4
  const rows = [];
  for (let i = 0; i < available.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(
      available.slice(i, i + 4).map(r =>
        new ButtonBuilder()
          .setCustomId(`pingrole:toggle:${r.key}:${guildId}`)
          .setLabel(r.label)
          .setEmoji(r.emoji)
          .setStyle(ButtonStyle.Secondary)
      )
    ));
  }

  // Éditer si message existant, sinon créer
  let posted = null;
  if (config?.pingRolesMessageId) {
    try {
      const existing = await channel.messages.fetch(config.pingRolesMessageId);
      await existing.edit({ embeds: [embed], components: rows });
      posted = existing;
    } catch (_) {}
  }
  if (!posted) {
    posted = await channel.send({ embeds: [embed], components: rows });
  }

  await Config.updateOne({ guildId }, { pingRolesMessageId: posted.id, pingRolesChannelId: channelId }, { upsert: true });
  logger.info('PingRoles', `Message posté dans #${channel.name}`);
  return posted;
}

async function handlePingRoleToggle(interaction) {
  // Guard: bouton cliqué hors serveur (DM)
  if (!interaction.guild || !interaction.member) {
    return interaction.reply({ content: '❌ Cette action est réservée aux membres du serveur.', ephemeral: true });
  }

  const [,, roleKey, guildId] = interaction.customId.split(':');

  // Guard: le bouton doit appartenir à CE serveur
  if (guildId !== interaction.guild.id) {
    return interaction.reply({ content: '❌ Ce bouton n'est pas valide pour ce serveur.', ephemeral: true });
  }

  const roleDef = PING_ROLES.find(r => r.key === roleKey);
  if (!roleDef) return interaction.reply({ content: '❌ Rôle introuvable.', ephemeral: true });

  const config = await Config.findOne({ guildId });
  const roleId = config?.[roleDef.configKey];
  if (!roleId) return interaction.reply({ content: `❌ Ce rôle n'est pas configuré.`, ephemeral: true });

  // Guard: le roleId doit exister dans CE serveur
  const roleExists = interaction.guild.roles.cache.has(roleId);
  if (!roleExists) return interaction.reply({ content: '❌ Ce rôle n'existe plus sur le serveur.', ephemeral: true });

  // Deferrer pour éviter les double-clics
  await interaction.deferReply({ ephemeral: true });

  const hasRole = interaction.member.roles.cache.has(roleId);
  try {
    if (hasRole) {
      await interaction.member.roles.remove(roleId);
      await interaction.editReply({ content: `🔕 Rôle **${roleDef.label}** retiré.` });
    } else {
      await interaction.member.roles.add(roleId);
      await interaction.editReply({ content: `🔔 Tu recevras les **${roleDef.label}** ${roleDef.emoji} !` });
    }
  } catch (err) {
    logger.error('PingRoles', 'Erreur toggle', err);
    await interaction.editReply({ content: '❌ Erreur. Vérifie les permissions du bot.' });
  }
}

module.exports = { postPingRolesMessage, handlePingRoleToggle, PING_ROLES };
