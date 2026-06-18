// src/systems/xp/liveboard.js — Classement live épinglé dans #lvl-xp
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

// Throttle : 1 update max toutes les 30s pour éviter le rate limit
const lastUpdate = new Map();
const THROTTLE_MS = 30_000;

async function updateLiveBoard(guild, config) {
  const guildId = guild.id;

  const now = Date.now();
  if (lastUpdate.get(guildId) && now - lastUpdate.get(guildId) < THROTTLE_MS) return;
  lastUpdate.set(guildId, now);

  const channel = guild.channels.cache.get(config.liveBoardChannelId);
  if (!channel) return;

  const top = await User.find({ guildId, weekXp: { $gt: 0 } })
    .sort({ weekXp: -1 }).limit(10);

  const medals = ['👑', '🥈', '🥉'];
  const lines = await Promise.all(top.map(async (u, i) => {
    try {
      const m = await guild.members.fetch(u.userId);
      const medal = medals[i] || `**${i + 1}.**`;
      const bar = buildMiniBar(u.weekXp, top[0].weekXp);
      return `${medal} **${m.displayName}** ${bar} ${u.weekXp.toLocaleString('fr-FR')} XP`;
    } catch { return null; }
  }));

  const validLines = lines.filter(Boolean);
  if (!validLines.length) return;

  const resetDay  = config.resetDayOfWeek ?? 0;
  const resetHour = config.resetHour ?? 20;
  const nextReset = getNextReset(resetDay, resetHour);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Classement de la semaine — Live')
    .setDescription(validLines.join('\n'))
    .addFields({
      name: '⏳ Prochain reset',
      value: `<t:${Math.floor(nextReset / 1000)}:R> — <t:${Math.floor(nextReset / 1000)}:F>`,
      inline: false,
    })
    .setFooter({ text: 'Mis à jour en temps réel • XP hebdo uniquement • Niveau all-time non impacté' })
    .setTimestamp();

  try {
    const msg = await channel.messages.fetch(config.liveBoardMessageId);
    await msg.edit({ embeds: [embed] });
  } catch {
    // Message supprimé ou introuvable — en créer un nouveau
    try {
      const newMsg = await channel.send({ embeds: [embed] });
      await newMsg.pin().catch(() => {});
      await Config.updateOne({ guildId }, { liveBoardMessageId: newMsg.id });
      logger.info('LiveBoard', `Nouveau message live créé : ${newMsg.id}`);
    } catch (err) {
      logger.error('LiveBoard', 'Impossible de créer le live board', err);
    }
  }
}

function buildMiniBar(value, max, len = 8) {
  if (!max) return '░'.repeat(len);
  const filled = Math.round((value / max) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function getNextReset(day, hour) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  const diff = (day - now.getDay() + 7) % 7;
  next.setDate(now.getDate() + (diff === 0 && now.getHours() >= hour ? 7 : diff));
  return next.getTime();
}

// Créer le live board pour la première fois (via /setup liveboard)
async function createLiveBoard(guild, config) {
  const channel = guild.channels.cache.get(config.liveBoardChannelId);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Classement de la semaine — Live')
    .setDescription('Aucune activité cette semaine pour l\'instant.\nSois le premier à envoyer un message ! 💬')
    .setFooter({ text: 'Mis à jour en temps réel • XP hebdo uniquement' })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });
  await msg.pin().catch(() => {});
  return msg.id;
}

module.exports = { updateLiveBoard, createLiveBoard };
