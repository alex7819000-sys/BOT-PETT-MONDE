// src/systems/king/index.js — King of the Day + stats quotidiennes — v5
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS } = require('../../config/constants');

const BOOST_DURATION_MS = 7 * 24 * 3600 * 1000;

// ── Stats quotidiennes à 12h ───────────────────────────────────────────────
async function sendDailyKingStats(client, guildId) {
  const guild  = client.guilds.cache.get(guildId);
  const config = await Config.findOne({ guildId });
  if (!config?.announceChannelId) return;
  const channel = guild?.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  const top = await User.find({ guildId, weekXp: { $gt: 0 } })
    .sort({ weekXp: -1 }).limit(10);
  if (!top.length) return;

  const members = await Promise.all(top.map(async (u, i) => {
    try {
      const m = await guild.members.fetch(u.userId);
      return { user: u, member: m, rank: i + 1 };
    } catch (_) { return null; }
  }));
  const valid = members.filter(Boolean);
  if (!valid.length) return;

  const currentKing = config.currentKingId
    ? valid.find(v => v.user.userId === config.currentKingId)
    : valid[0];

  const medals = ['👑', '🥈', '🥉'];
  const lines  = valid.map(({ user, member, rank }) => {
    const medal = medals[rank - 1] || `**${rank}.**`;
    return `${medal} **${member.displayName}** — ${user.weekXp.toLocaleString('fr-FR')} XP`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`📊 Classement en cours — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`)
    .setDescription(
      (currentKing ? `👑 **Roi actuel :** ${currentKing.member.displayName}\n\n` : '') +
      `**🏆 Top 10 de la semaine :**\n${lines.join('\n')}`
    )
    .setFooter({ text: `Couronnement le jour du reset hebdo • Reste actif pour garder ta place !` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  logger.info('King', 'Stats quotidiennes envoyées');
}

// ── Cérémonie hebdo ────────────────────────────────────────────────────────
async function runKingCeremony(client, guildId) {
  const guild  = client.guilds.cache.get(guildId);
  if (!guild) return;

  const config = await Config.findOne({ guildId });
  if (!config?.announceChannelId) return logger.warn('King', 'Salon annonce non configuré');

  const channel = guild.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  const top = await User.find({ guildId, weekXp: { $gt: 0 } })
    .sort({ weekXp: -1 }).limit(10);
  if (!top.length) return logger.info('King', 'Aucun membre actif cette semaine');

  const members = await Promise.all(top.map(async (u, i) => {
    try {
      const m = await guild.members.fetch(u.userId);
      return { user: u, member: m, rank: i + 1 };
    } catch (_) { return null; }
  }));
  const valid = members.filter(Boolean);
  if (!valid.length) return;

  const king   = valid[0];
  const second = valid[1] || null;
  const third  = valid[2] || null;

  // Retirer ancien roi
  if (config.currentKingId && config.currentKingId !== king.user.userId) {
    try {
      const old = await guild.members.fetch(config.currentKingId);
      if (config.kingRoleId) await old.roles.remove(config.kingRoleId).catch(() => {});
      await User.updateOne({ userId: config.currentKingId, guildId }, { isKing: false });
    } catch (_) {}
  }

  // Retirer l'ancien rôle Challenger à tout le monde
  if (config.challengerRoleId) {
    const membersWithChallenger = guild.members.cache.filter(m => m.roles.cache.has(config.challengerRoleId));
    for (const [, m] of membersWithChallenger) {
      await m.roles.remove(config.challengerRoleId).catch(() => {});
    }
  }

  // Couronner le roi
  if (config.kingRoleId) await king.member.roles.add(config.kingRoleId).catch(() => {});
  await User.updateOne({ userId: king.user.userId, guildId }, { isKing: true, $inc: { crownCount: 1 } });
  await Config.updateOne({ guildId }, { currentKingId: king.user.userId });

  // Boost podium King (x2 XP 7 jours)
  const boostUntil = new Date(Date.now() + BOOST_DURATION_MS);
  await User.updateOne({ userId: king.user.userId, guildId }, { xpBoostUntil: boostUntil });

  // Challenger #2 et #3 — rôle visible + boost x1.5 XP 7 jours
  const challengerBoost = new Date(Date.now() + BOOST_DURATION_MS);
  if (second) {
    if (config.challengerRoleId) await second.member.roles.add(config.challengerRoleId).catch(() => {});
    await User.updateOne({ userId: second.user.userId, guildId }, { podiumBoostUntil: challengerBoost });
  }
  if (third) {
    if (config.challengerRoleId) await third.member.roles.add(config.challengerRoleId).catch(() => {});
    await User.updateOne({ userId: third.user.userId, guildId }, { podiumBoostUntil: challengerBoost });
  }

  const medals         = ['👑', '🥈', '🥉'];
  const classementLines = valid.map(({ user, member, rank }) => {
    const medal = medals[rank - 1] || `**${rank}.**`;
    const boost = rank === 1 ? ' 👑 +100% XP' : rank <= 3 ? ' ⚔️ +50% XP' : '';
    return `${medal} **${member.displayName}** — ${user.weekXp.toLocaleString('fr-FR')} XP${boost}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${EMOJIS.KING} Couronnement — Roi de la Semaine !`)
    .setDescription(
      `**${king.member.displayName}** est couronné Roi ! 🎉\n\n` +
      `**📊 Classement final :**\n${classementLines.join('\n')}`
    )
    .setThumbnail(king.member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: `${EMOJIS.KING} XP cette semaine`,  value: `**${king.user.weekXp.toLocaleString('fr-FR')}** XP`, inline: true },
      { name: `${EMOJIS.KING} Total couronnes`,   value: `**${(king.user.crownCount || 0) + 1}**`,              inline: true },
      ...(second ? [{ name: '⚔️ Challenger #2', value: `${second.member.displayName} → rôle Challenger + **+50% XP** 7 jours`, inline: false }] : []),
      ...(third  ? [{ name: '⚔️ Challenger #3', value: `${third.member.displayName} → rôle Challenger + **+50% XP** 7 jours`,  inline: false }] : []),
    )
    .setTimestamp()
    .setFooter({ text: 'XP hebdo remis à 0 • Rôles de niveau conservés • Longue vie au Roi !' });

  await channel.send({
    content: `${config?.announceRoleId ? '<@&' + config.announceRoleId + '> ' : ''}${EMOJIS.KING} Le Roi de la semaine est élu !`,
    embeds: [embed],
  });

  // Reset XP hebdo uniquement — les rôles de niveau (totalXp) ne bougent pas
  await User.updateMany({ guildId }, { weekXp: 0, weekNumber: 0 });

  // Mise à jour live board après reset
  try {
    if (config.liveBoardChannelId) {
      const { updateLiveBoard } = require('../xp/liveboard');
      await updateLiveBoard(guild, config).catch(() => {});
    }
  } catch {}

  logger.info('King', `Nouveau roi : ${king.member.displayName}`);
}

module.exports = { runKingCeremony, sendDailyKingStats };
