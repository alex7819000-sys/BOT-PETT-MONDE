// src/systems/king/index.js — King of the Day
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User    = require('../../db/models/User');
const Config  = require('../../db/models/Config');
const logger  = require('../../utils/logger');
const { COLORS, EMOJIS } = require('../../config/constants');

async function runKingCeremony(client, guildId) {
  const guild  = client.guilds.cache.get(guildId);
  if (!guild) return;

  const config = await Config.findOne({ guildId });
  if (!config?.announceChannelId) return logger.warn('King', 'Salon annonce non configuré');

  const channel = guild.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  // Trouver le roi (top weekXp)
  const top = await User.find({ guildId, weekXp: { $gt: 0 } }).sort({ weekXp: -1 }).limit(1);
  if (!top.length) return logger.info('King', 'Aucun utilisateur actif cette semaine');

  const kingData = top[0];
  let member;
  try { member = await guild.members.fetch(kingData.userId); } catch (_) { return; }

  // Retirer ancien roi
  if (config.currentKingId && config.currentKingId !== kingData.userId) {
    try {
      const old = await guild.members.fetch(config.currentKingId);
      if (config.kingRoleId) await old.roles.remove(config.kingRoleId).catch(() => {});
      await User.updateOne({ userId: config.currentKingId, guildId }, { isKing: false });
    } catch (_) {}
  }

  // Donner couronne
  if (config.kingRoleId) await member.roles.add(config.kingRoleId).catch(() => {});
  await User.updateOne({ userId: kingData.userId, guildId }, {
    isKing: true,
    $inc: { crownCount: 1 },
    weekXp: 0,  // Reset semaine
  });
  await Config.updateOne({ guildId }, { currentKingId: kingData.userId });

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${EMOJIS.KING} Nouveau Roi de la Semaine !`)
    .setDescription(`**${member.displayName}** est couronné Roi de PETIT MONDE !`)
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'XP cette semaine', value: `${kingData.weekXp.toLocaleString()} XP`, inline: true },
      { name: 'Total couronnes',  value: `${(kingData.crownCount + 1)} ${EMOJIS.KING}`,  inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Longue vie au Roi !' });

  await channel.send({ content: `@everyone ${EMOJIS.KING} Couronnement !`, embeds: [embed] });
  logger.info('King', `Nouveau roi : ${member.displayName}`);
}

module.exports = { runKingCeremony };
