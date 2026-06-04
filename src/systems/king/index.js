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

  // Couronner le roi
  if (config.kingRoleId) await king.member.roles.add(config.kingRoleId).catch(() => {});
  await User.updateOne({ userId: king.user.userId, guildId }, { isKing: true, $inc: { crownCount: 1 } });
  await Config.updateOne({ guildId }, { currentKingId: king.user.userId });

  // Bonus podium
  const boostUntil = new Date(Date.now() + BOOST_DURATION_MS);
  if (second) await User.updateOne({ userId: second.user.userId, guildId }, { podiumBoostUntil: boostUntil });
  if (third)  await User.updateOne({ userId: third.user.userId,  guildId }, { podiumBoostUntil: boostUntil });

  const medals         = ['👑', '🥈', '🥉'];
  const classementLines = valid.map(({ user, member, rank }) => {
    const medal = medals[rank - 1] || `**${rank}.**`;
    const boost = rank === 1 ? ' 👑' : rank <= 3 ? ' ⚡+50% XP' : '';
    return `${medal} **${member.displayName}** — ${user.weekXp.toLocaleString('fr-FR')} XP${boost}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${EMOJIS.KING} Couronnement — Roi de la Semaine !`)
    .setDescription(
      `**${king.member.displayName}** est couronné Roi de PETIT MONDE ! 🎉\n\n` +
      `**📊 Classement final de la semaine :**\n${classementLines.join('\n')}`
    )
    .setThumbnail(king.member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: `${EMOJIS.KING} XP cette semaine`,   value: `**${king.user.weekXp.toLocaleString('fr-FR')}** XP`, inline: true },
      { name: `${EMOJIS.KING} Total couronnes`,    value: `**${king.user.crownCount + 1}**`,                    inline: true },
      ...(second ? [{ name: '🥈 Bonus 2e place', value: `${second.member.displayName} → **+50% XP** 7 jours ⚡`, inline: false }] : []),
      ...(third  ? [{ name: '🥉 Bonus 3e place', value: `${third.member.displayName} → **+50% XP** 7 jours ⚡`,  inline: false }] : []),
    )
    .setTimestamp()
    .setFooter({ text: 'Longue vie au Roi ! • Reset XP' });

  await channel.send({
    content: `@everyone ${EMOJIS.KING} Le Roi de la semaine est élu !`,
    embeds: [embed],
  });

  await User.updateMany({ guildId }, { weekXp: 0, weekNumber: 0 });
  logger.info('King', `Nouveau roi : ${king.member.displayName}`);
}

module.exports = { runKingCeremony, sendDailyKingStats };
