// src/handlers/commandHandlers/bump.js — /bumpstats & /mabump
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const User = require('../../db/models/User');

async function handle(interaction) {
  await interaction.deferReply();
  const gid = interaction.guild.id;
  const top = await User.find({ guildId: gid, bumpCount: { $gt: 0 } }).sort({ bumpCount: -1 }).limit(10);
  const lines = await Promise.all(top.map(async (u, i) => {
    const medals = ['🥇','🥈','🥉'];
    const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
    return `${medals[i] || `**${i+1}.**`} ${m?.displayName || `<@${u.userId}>`} — ${u.bumpCount} bumps`;
  }));
  const embed = new EmbedBuilder().setColor(COLORS.BLUE).setTitle(`${EMOJIS.BUMP} Top Bumpeurs`)
    .setDescription(lines.join('\n') || '*Aucun bump enregistré*').setTimestamp();
  return interaction.editReply({ embeds: [embed] });
}

async function handleMaBump(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getMember('membre') || interaction.member;
  const user = await User.findOne({ userId: target.id, guildId: interaction.guild.id });
  const embed = new EmbedBuilder().setColor(COLORS.BLUE).setTitle(`${EMOJIS.BUMP} Stats Bump — ${target.displayName}`)
    .addFields(
      { name: '🚀 Bumps totaux',   value: `${user?.bumpCount || 0}`,    inline: true },
      { name: '📅 Bumps semaine',  value: `${user?.bumpWeek || 0}`,     inline: true },
      { name: '📆 Bumps du jour',  value: `${user?.bumpDay || 0}`,      inline: true },
    ).setTimestamp();
  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handle, handleMaBump };
