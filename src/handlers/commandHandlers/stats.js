// src/handlers/commandHandlers/stats.js — /stats style Statbot
'use strict';
const { EmbedBuilder } = require('discord.js');
const DailyStats = require('../../db/models/DailyStats');
const User       = require('../../db/models/User');
const Guilde     = require('../../db/models/Guilde');
const { COLORS } = require('../../config/constants');

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS_FR[parseInt(m) - 1]}`;
}

async function handle(interaction) {
  await interaction.deferReply();
  const gid   = interaction.guild.id;
  const days  = 30;

  // ── Récupérer les 30 derniers jours ──────────────────────────────────
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const statsRaw = await DailyStats.find({ guildId: gid, date: { $in: dates } });
  const statsMap = Object.fromEntries(statsRaw.map(s => [s.date, s]));

  const msgData   = dates.map(d => statsMap[d]?.messageCount || 0);
  const contrData = dates.map(d => statsMap[d]?.uniqueUsers?.length || 0);
  const labels    = dates.map(d => formatDate(d));

  const totalMessages  = msgData.reduce((a, b) => a + b, 0);
  const totalContribs  = new Set(statsRaw.flatMap(s => s.uniqueUsers)).size;

  // ── Totaux MongoDB ────────────────────────────────────────────────────
  const [totalUsers, activeUsers, totalGuildes] = await Promise.all([
    User.countDocuments({ guildId: gid }),
    User.countDocuments({ guildId: gid, weekXp: { $gt: 0 } }),
    Guilde.countDocuments({ guildId: gid, active: true }),
  ]);

  const totalXpAgg = await User.aggregate([
    { $match: { guildId: gid } },
    { $group: { _id: null, total: { $sum: '$totalXp' } } },
  ]);
  const totalXp = totalXpAgg[0]?.total || 0;

  // ── Graphique QuickChart — mixte barre + ligne style Statbot ──────────
  const chartConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: 'Messages',
          data: msgData,
          borderColor: '#43b581',
          backgroundColor: 'rgba(67,181,129,0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2.5,
          yAxisID: 'y',
          order: 1,
        },
        {
          type: 'bar',
          label: 'Contributeurs',
          data: contrData,
          backgroundColor: 'rgba(150,150,150,0.45)',
          borderColor: 'rgba(150,150,150,0.0)',
          borderWidth: 0,
          yAxisID: 'y1',
          order: 2,
        },
      ],
    },
    options: {
      interaction: { mode: 'index' },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#dcddde', font: { size: 13 } },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#72767d',
            maxTicksLimit: 10,
            maxRotation: 0,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          position: 'left',
          beginAtZero: true,
          ticks: { color: '#43b581' },
          grid: { color: 'rgba(255,255,255,0.07)' },
          title: { display: true, text: 'Messages', color: '#43b581' },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          ticks: { color: '#72767d' },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Contributeurs', color: '#72767d' },
        },
      },
    },
  };

  const chartUrl = `https://quickchart.io/chart?backgroundColor=%2323272A&width=900&height=400&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

  // ── Embed style Statbot ───────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0x43b581)
    .setAuthor({
      name: `${interaction.guild.name} • Messages`,
      iconURL: interaction.guild.iconURL({ size: 64 }),
    })
    .addFields(
      { name: '📨 Messages (30j)',    value: `**${totalMessages.toLocaleString('fr-FR')}**`, inline: true },
      { name: '👥 Contributeurs',     value: `**${totalContribs.toLocaleString('fr-FR')}**`, inline: true },
      { name: '\u200B',               value: '\u200B', inline: true },
      { name: '📋 Membres enregistrés', value: `**${totalUsers}**`,  inline: true },
      { name: '⚡ Actifs cette semaine', value: `**${activeUsers}**`, inline: true },
      { name: '🏰 Guildes actives',    value: `**${totalGuildes}**`,  inline: true },
      { name: '🎮 Membres Discord',    value: `**${interaction.guild.memberCount}**`, inline: true },
      { name: '⭐ XP total serveur',   value: `**${totalXp.toLocaleString('fr-FR')}**`, inline: true },
    )
    .setImage(chartUrl)
    .setFooter({ text: `Période : 30 derniers jours • Fuseau : Europe/Paris` })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

module.exports = { handle };
