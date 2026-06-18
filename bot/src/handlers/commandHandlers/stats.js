// src/handlers/commandHandlers/stats.js — /stats
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

async function handle(interaction) {
  await interaction.deferReply();
  const User = require('../../db/models/User');
  const gid = interaction.guild.id;

  const [totalUsers, totalMessages, topUser] = await Promise.all([
    User.countDocuments({ guildId: gid, totalXp: { $gt: 0 } }),
    User.aggregate([{ $match: { guildId: gid } }, { $group: { _id: null, total: { $sum: '$messageCount' } } }]),
    User.findOne({ guildId: gid }).sort({ totalXp: -1 }),
  ]);

  const topMember = topUser ? await interaction.guild.members.fetch(topUser.userId).catch(() => null) : null;
  const guild = interaction.guild;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle(`📊 Statistiques — ${guild.name}`)
    .setThumbnail(guild.iconURL())
    .addFields(
      { name: '👥 Membres actifs', value: `${totalUsers}`, inline: true },
      { name: '💬 Messages totaux', value: `${(totalMessages[0]?.total || 0).toLocaleString()}`, inline: true },
      { name: '👑 Meilleur membre', value: topMember ? `${topMember.displayName} (${topUser.totalXp?.toLocaleString()} XP)` : 'Aucun', inline: false },
      { name: '🏠 Membres Discord', value: `${guild.memberCount}`, inline: true },
      { name: '📅 Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handle };
