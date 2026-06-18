// src/handlers/commandHandlers/niveau.js — /niveau : niveau + missions du jour + défis actifs
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getOrCreate, xpProgress, getUserRank } = require('../../systems/xp');
const { getDailyMissions }                     = require('../../systems/dailymissions');
const Defi   = require('../../db/models/Defi');
const User   = require('../../db/models/User');
const { COLORS } = require('../../config/constants');

function xpBar(pct, len = 14) {
  const fill = Math.round((pct / 100) * len);
  return '`' + '█'.repeat(fill) + '░'.repeat(len - fill) + '`';
}

function rankBadge(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (rank <= 10) return `**#${rank}**`;
  return `#${rank}`;
}

function getTodayKey() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

module.exports = async function handleNiveau(interaction) {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser('membre') || interaction.user;
  const gid        = interaction.guild.id;
  const member     = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

  const userData  = await getOrCreate(targetUser.id, gid);
  const weekRank  = await getUserRank(targetUser.id, gid, 'weekXp');

  const { level, current, needed } = xpProgress(userData.totalXp);
  const pct = needed > 0 ? Math.round((current / needed) * 100) : 100;
  const bar = xpBar(pct);

  // ── Missions du jour ────────────────────────────────────────────────
  const todayKey = getTodayKey();
  const missions = getDailyMissions();
  const done     = (userData.dailyMissionsDate === todayKey) ? (userData.dailyMissionsDone || []) : [];

  const tierEmoji = { facile: '🟢', moyen: '🟡', difficile: '🔴' };
  const missionLines = Object.entries(missions).map(([tier, m]) => {
    const isDone = done.includes(m.id);
    return `${isDone ? '✅' : tierEmoji[tier]} ${m.label} — **+${m.xp} XP · ${m.kakera}💎**`;
  });

  const allDone    = done.length >= 3;
  const missionStr = missionLines.join('\n') +
    (allDone ? '\n🏆 **Bonus 3/3 réclamé — +100 XP · +200💎 · +50% XP 24h !**' : `\n> *${done.length}/3 complétées — bonus à 3/3 : +100 XP · +200💎 · +50% XP 24h*`);

  // ── Défis actifs ────────────────────────────────────────────────────
  const now    = new Date();
  const defis  = await Defi.find({ guildId: gid, ended: false, endAt: { $gte: now } }).limit(3);

  let defiStr = '*Aucun défi actif en ce moment.*';
  if (defis.length > 0) {
    defiStr = defis.map(d => {
      const isIn   = d.participants.has(targetUser.id);
      const prog   = isIn ? d.participants.get(targetUser.id) : 0;
      const target = d.target ? `${prog}/${d.target}` : `${prog}`;
      const valid  = d.target ? prog >= d.target : false;
      const status = valid ? '✅' : isIn ? `🔄 ${target}` : '⬜';
      return `${status} **${d.title}** — se termine <t:${Math.floor(d.endAt/1000)}:R>`;
    }).join('\n');
  }

  // ── Boost actif ? ────────────────────────────────────────────────────
  const boosts = [];
  if (userData.xpBoostUntil     && userData.xpBoostUntil     > now) boosts.push('⚡ Boost XP ×2');
  if (userData.defiXpBoostUntil && userData.defiXpBoostUntil > now) boosts.push('🔥 Bonus missions +50%');
  if (userData.podiumBoostUntil && userData.podiumBoostUntil > now) boosts.push('🏆 Boost podium ×1.5');

  const embed = new EmbedBuilder()
    .setColor(member.displayColor || COLORS.PURPLE)
    .setAuthor({ name: `Niveau de ${member.displayName}`, iconURL: member.displayAvatarURL({ size: 64 }) })
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .addFields(
      {
        name: `👑 Niveau ${level}  •  Rang semaine : ${weekRank ? rankBadge(weekRank.rank) : '—'}`,
        value: `${bar} **${pct}%**\n${current.toLocaleString('fr-FR')} / ${needed.toLocaleString('fr-FR')} XP`,
        inline: false,
      },
      { name: '⭐ XP Total', value: `**${userData.totalXp.toLocaleString('fr-FR')}**`, inline: true },
      { name: '📅 XP Semaine', value: `**${userData.weekXp.toLocaleString('fr-FR')}**`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '📅 Missions du jour', value: missionStr, inline: false },
      { name: '⚡ Défis en cours', value: defiStr, inline: false },
    );

  if (boosts.length > 0) {
    embed.addFields({ name: '🚀 Boosts actifs', value: boosts.join(' · '), inline: false });
  }

  embed
    .setFooter({ text: `Utilise /missions pour plus de détails • /defis liste pour les défis` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
};
