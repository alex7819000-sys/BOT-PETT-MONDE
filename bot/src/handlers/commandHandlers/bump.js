// src/handlers/commandHandlers/bump.js — /bumpstats & /mabump avec stats par plateforme
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const User = require('../../db/models/User');

const PLATFORMS = {
  total: { name: 'Total', emoji: '📊', field: 'bumpCount' },
  disboard: { name: 'Disboard', emoji: '🎮', field: 'bumpDisboard' },
  topgg: { name: 'Top.gg', emoji: '⭐', field: 'bumpTopgg' },
  dbl: { name: 'Discord Bot List', emoji: '🤖', field: 'bumpDBL' },
  voting: { name: 'Voting.com', emoji: '🗳️', field: 'bumpVoting' },
};

async function handle(interaction) {
  await interaction.deferReply();
  const gid = interaction.guild.id;
  
  // Crée des embeds pour chaque plateforme
  const embeds = [];
  
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    const top = await User.find({ guildId: gid, [platform.field]: { $gt: 0 } })
      .sort({ [platform.field]: -1 })
      .limit(10);
    
    const lines = await Promise.all(top.map(async (u, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
      const count = u[platform.field] || 0;
      return `${medals[i] || `**${i + 1}.**`} ${m?.displayName || `<@${u.userId}>`} — **${count}** ${platform.name}`;
    }));

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`${platform.emoji} Top 10 — ${platform.name}`)
      .setDescription(lines.length > 0 ? lines.join('\n') : `*Aucun bump ${platform.name} enregistré*`)
      .setTimestamp();
    
    embeds.push(embed);
  }

  return interaction.editReply({ embeds: embeds.slice(0, 10) }); // Discord limite à 10 embeds
}

async function handleMaBump(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getMember('membre') || interaction.member;
  const user = await User.findOne({ userId: target.id, guildId: interaction.guild.id });

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${EMOJIS.BUMP} Stats Bump — ${target.displayName}`)
    .addFields(
      { name: '📊 Bumps totaux', value: `${user?.bumpCount || 0}`, inline: true },
      { name: '🎮 Disboard', value: `${user?.bumpDisboard || 0}`, inline: true },
      { name: '⭐ Top.gg', value: `${user?.bumpTopgg || 0}`, inline: true },
      { name: '🤖 DBL', value: `${user?.bumpDBL || 0}`, inline: true },
      { name: '🗳️ Voting', value: `${user?.bumpVoting || 0}`, inline: true },
      { name: '📈 Bumps semaine', value: `${user?.bumpWeek || 0}`, inline: true },
      { name: '📅 Bumps du jour', value: `${user?.bumpDay || 0}`, inline: true },
      { name: '💰 XP gagné', value: `${(user?.bumpCount || 0) * 500} XP`, inline: true },
    )
    .setThumbnail(target.displayAvatarURL() || null)
    .setTimestamp();
  
  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handle, handleMaBump };

