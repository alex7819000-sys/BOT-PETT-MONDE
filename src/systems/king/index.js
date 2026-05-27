// src/systems/king/index.js — King of the Day + podium
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS } = require('../../config/constants');

const BOOST_DURATION_MS = 7 * 24 * 3600 * 1000; // 7 jours

async function runKingCeremony(client, guildId) {
  const guild  = client.guilds.cache.get(guildId);
  if (!guild) return;

  const config = await Config.findOne({ guildId });
  if (!config?.announceChannelId) return logger.warn('King', 'Salon annonce non configuré');

  const channel = guild.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  // Top 10 de la semaine
  const top = await User.find({ guildId, weekXp: { $gt: 0 } })
    .sort({ weekXp: -1 }).limit(10);

  if (!top.length) return logger.info('King', 'Aucun membre actif cette semaine');

  // Fetch les membres Discord
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

  // ── Retirer ancien roi ──────────────────────────────────────────────────
  if (config.currentKingId && config.currentKingId !== king.user.userId) {
    try {
      const old = await guild.members.fetch(config.currentKingId);
      if (config.kingRoleId) await old.roles.remove(config.kingRoleId).catch(() => {});
      await User.updateOne({ userId: config.currentKingId, guildId }, { isKing: false });
    } catch (_) {}
  }

  // ── Couronner le roi ────────────────────────────────────────────────────
  if (config.kingRoleId) await king.member.roles.add(config.kingRoleId).catch(() => {});
  await User.updateOne({ userId: king.user.userId, guildId }, { isKing: true, $inc: { crownCount: 1 } });
  await Config.updateOne({ guildId }, { currentKingId: king.user.userId });

  // ── Bonus podium 2e et 3e : +50% XP pendant 7 jours ────────────────────
  const boostUntil = new Date(Date.now() + BOOST_DURATION_MS);
  if (second) {
    await User.updateOne({ userId: second.user.userId, guildId }, { podiumBoostUntil: boostUntil });
  }
  if (third) {
    await User.updateOne({ userId: third.user.userId, guildId }, { podiumBoostUntil: boostUntil });
  }

  // ── Build classement top 10 ─────────────────────────────────────────────
  const medals = ['👑', '🥈', '🥉'];
  const classementLines = valid.map(({ user, member, rank }) => {
    const medal   = medals[rank - 1] || `**${rank}.**`;
    const boost   = rank === 1 ? ' 👑' : rank <= 3 ? ' ⚡+50%' : '';
    return `${medal} **${member.displayName}** — ${user.weekXp.toLocaleString('fr-FR')} XP${boost}`;
  });

  // ── Embed annonce ────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${EMOJIS.KING} Couronnement — Roi de la Semaine !`)
    .setDescription(
      `**${king.member.displayName}** est couronné Roi de PETIT MONDE ! 🎉\n\n` +
      `**📊 Classement de la semaine :**\n${classementLines.join('\n')}`
    )
    .setThumbnail(king.member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: `${EMOJIS.KING} XP cette semaine`, value: `**${king.user.weekXp.toLocaleString('fr-FR')}** XP`, inline: true },
      { name: `${EMOJIS.KING} Total couronnes`,  value: `**${(king.user.crownCount + 1)}**`,                  inline: true },
      ...(second ? [{ name: '🥈 Bonus 2e place', value: `${second.member.displayName} → **+50% XP** pendant 7 jours ⚡`, inline: false }] : []),
      ...(third  ? [{ name: '🥉 Bonus 3e place', value: `${third.member.displayName} → **+50% XP** pendant 7 jours ⚡`,  inline: false }] : []),
    )
    .setTimestamp()
    .setFooter({ text: 'Longue vie au Roi ! • Reset XP lundi' });

  await channel.send({
    content: `@everyone ${EMOJIS.KING} Le Roi de la semaine est élu !`,
    embeds: [embed],
  });

  // ── Reset XP hebdo de tout le monde ─────────────────────────────────────
  await User.updateMany({ guildId }, { weekXp: 0, weekNumber: 0 });
  logger.info('King', `Nouveau roi : ${king.member.displayName} | Podium: ${valid.slice(0,3).map(v=>v.member.displayName).join(', ')}`);
}

module.exports = { runKingCeremony };
