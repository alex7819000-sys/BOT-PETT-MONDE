// src/handlers/commandHandlers/stats.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const axios  = require('axios');
const User   = require('../../db/models/User');
const Guilde = require('../../db/models/Guilde');
const { COLORS } = require('../../config/constants');

async function handle(interaction) {
  await interaction.deferReply();
  const gid = interaction.guild.id;

  const [totalUsers, activeUsers, totalGuildes, topUsers] = await Promise.all([
    User.countDocuments({ guildId: gid }),
    User.countDocuments({ guildId: gid, weekXp: { $gt: 0 } }),
    Guilde.countDocuments({ guildId: gid, active: true }),
    User.find({ guildId: gid }).sort({ weekXp: -1 }).limit(5),
  ]);

  const totalXp = (await User.aggregate([
    { $match: { guildId: gid } },
    { $group: { _id: null, total: { $sum: '$totalXp' } } },
  ]))[0]?.total || 0;

  // Graphique via QuickChart
  const labels = await Promise.all(topUsers.map(async u => {
    const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
    return m?.displayName?.slice(0, 10) || 'Inconnu';
  }));
  const values = topUsers.map(u => u.weekXp);

  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'XP semaine', data: values, backgroundColor: 'rgba(124,77,255,0.8)', borderColor: '#7C4DFF', borderWidth: 2 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  }))}`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle(`📊 Statistiques — ${interaction.guild.name}`)
    .addFields(
      { name: 'Membres enregistrés', value: `${totalUsers}`, inline: true },
      { name: 'Actifs cette semaine', value: `${activeUsers}`, inline: true },
      { name: 'Guildes actives',      value: `${totalGuildes}`, inline: true },
      { name: 'XP total serveur',     value: `${totalXp.toLocaleString()}`, inline: true },
      { name: 'Membres Discord',      value: `${interaction.guild.memberCount}`, inline: true },
    )
    .setImage(chartUrl)
    .setTimestamp()
    .setFooter({ text: 'Top 5 XP semaine' });

  await interaction.followUp({ embeds: [embed] });
}

module.exports = { handle };
