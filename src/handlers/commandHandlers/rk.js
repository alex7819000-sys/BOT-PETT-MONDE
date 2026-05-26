// src/handlers/commandHandlers/rk.js — /rk style Statbot, public, max 3 lettres
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getOrCreate, xpProgress, getUserRank } = require('../../systems/xp');
const User       = require('../../db/models/User');
const Guilde     = require('../../db/models/Guilde');
const DailyStats = require('../../db/models/DailyStats');
const Config     = require('../../db/models/Config');
const { COLORS, EMOJIS } = require('../../config/constants');

function xpBar(pct, len = 14) {
  const fill = Math.round((pct / 100) * len);
  return '`' + '█'.repeat(fill) + '░'.repeat(len - fill) + '`';
}

function rankMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function teamLabel(team) {
  if (team === 'dog') return '🐶 Chiens';
  if (team === 'cat') return '🐱 Chats';
  return '—';
}

async function handle(interaction) {
  // Réponse PUBLIQUE — les autres voient et veulent essayer
  await interaction.deferReply({ ephemeral: false });

  const target = interaction.options.getUser('membre') || interaction.user;
  const gid    = interaction.guild.id;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.followUp({ content: '❌ Membre introuvable.', ephemeral: true });

  const config = await Config.findOne({ guildId: gid });

  // Vérifier si on est dans le bon salon
  if (config?.rankChannelId && interaction.channel.id !== config.rankChannelId) {
    return interaction.followUp({
      content: `📊 Utilise la commande dans <#${config.rankChannelId}> !`,
      ephemeral: true,
    });
  }

  // Données user
  const [userData, weekRank, totalRank] = await Promise.all([
    getOrCreate(target.id, gid),
    getUserRank(target.id, gid, 'weekXp'),
    getUserRank(target.id, gid, 'totalXp'),
  ]);

  const { level, current, needed } = xpProgress(userData.totalXp);
  const pct = needed > 0 ? Math.round((current / needed) * 100) : 100;

  // Stats par période (depuis DailyStats)
  const now   = new Date();
  const d1    = new Date(now); d1.setDate(d1.getDate() - 1);
  const d7    = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30   = new Date(now); d30.setDate(d30.getDate() - 30);

  const fmt = d => d.toISOString().slice(0, 10);
  const daysRange = (from) => {
    const dates = [];
    const cur = new Date(from);
    while (cur <= now) { dates.push(fmt(cur)); cur.setDate(cur.getDate() + 1); }
    return dates;
  };

  // XP gagné par période approximé depuis weekXp et totalXp
  // (DailyStats track les messages du serveur, pas l'XP individuel par jour)
  // On utilise les données disponibles
  const totalMembers = await User.countDocuments({ guildId: gid });
  const serverRankWeek  = weekRank?.rank  || '—';
  const serverRankTotal = totalRank?.rank || '—';

  // Guilde
  let guildeStr = '—';
  if (userData.guildeId) {
    const g = await Guilde.findOne({ guildId: gid, guildeId: userData.guildeId });
    if (g) guildeStr = `${g.emoji} ${g.name}${g.leaderId === target.id ? ' *(Chef)*' : ''}`;
  }

  // Badges
  const badges = [];
  if (userData.isKing)            badges.push('👑');
  if (userData.isMonkey)          badges.push('🐒');
  if (userData.crownCount >= 5)   badges.push('⭐');
  if (userData.quizWins >= 20)    badges.push('🐉');
  if (userData.bumpCount >= 50)   badges.push('🚀');
  const badgeStr = badges.length ? badges.join(' ') + ' ' : '';

  // Boost actif
  const hasBoost = userData.xpBoostUntil && userData.xpBoostUntil > new Date();

  // Graphique QuickChart mini (progression XP hebdo serveur)
  const last7 = daysRange(d7);
  const statsRaw = await DailyStats.find({ guildId: gid, date: { $in: last7 } });
  const statsMap = Object.fromEntries(statsRaw.map(s => [s.date, s.messageCount || 0]));
  const chartData = last7.map(d => statsMap[d] || 0);
  const chartLabels = last7.map(d => {
    const [, m, day] = d.split('-');
    return `${parseInt(day)}/${parseInt(m)}`;
  });

  const chartCfg = {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        borderColor: '#43b581',
        backgroundColor: 'rgba(67,181,129,0.15)',
        fill: true, tension: 0.4, pointRadius: 2, borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#72767d', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#72767d', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
      },
    },
  };
  const chartUrl = `https://quickchart.io/chart?backgroundColor=%2323272A&width=500&height=120&c=${encodeURIComponent(JSON.stringify(chartCfg))}`;

  // Build embed style Statbot
  const embed = new EmbedBuilder()
    .setColor(member.displayColor || COLORS.PURPLE)
    .setAuthor({
      name: `${badgeStr}${member.displayName}`,
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    // Niveau + barre
    .addFields({
      name: `Niveau ${level}${hasBoost ? '  ⚡×2' : ''}`,
      value: `${xpBar(pct)} ${pct}%  —  ${current.toLocaleString('fr-FR')} / ${needed.toLocaleString('fr-FR')} XP`,
      inline: false,
    })
    // Rangs
    .addFields(
      { name: '📅 Rang Semaine',  value: `**${rankMedal(serverRankWeek)}** / ${totalMembers}`,  inline: true },
      { name: '⭐ Rang Total',    value: `**${rankMedal(serverRankTotal)}** / ${totalMembers}`, inline: true },
      { name: '🌍 XP Total',      value: `**${userData.totalXp.toLocaleString('fr-FR')}**`,     inline: true },
    )
    // Stats semaine
    .addFields(
      { name: '📊 XP Semaine',    value: `**${userData.weekXp.toLocaleString('fr-FR')}**`,     inline: true },
      { name: '👑 Couronnes',     value: `**${userData.crownCount}**`,                          inline: true },
      { name: '🚀 Bumps',        value: `**${userData.bumpCount}**`,                            inline: true },
    )
    // Identité
    .addFields(
      { name: '🏰 Guilde',        value: guildeStr,              inline: true },
      { name: '⚔️ Équipe',        value: teamLabel(userData.team), inline: true },
      { name: '🎌 Quiz wins',     value: `**${userData.quizWins || 0}**`, inline: true },
    )
    // Mini graphique activité serveur 7j
    .setImage(chartUrl)
    .setFooter({ text: `Activité serveur — 7 derniers jours  •  /rk @membre pour voir quelqu'un d'autre` })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

module.exports = { handle };
