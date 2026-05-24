// src/systems/bump/index.js — Bump auto + récompenses
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS, XP } = require('../../config/constants');
const { getWeekNumber, safeReply } = require('../../utils/permissions');

const DISBOARD_ID = '302050872383242240';

async function sendBumpReminder(client, guildId) {
  const config  = await Config.findOne({ guildId });
  const channelId = config?.bumpChannelId || config?.announceChannelId;
  if (!channelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${EMOJIS.BUMP} C'est l'heure de bumper !`)
    .setDescription('Tape `/bump` pour booster la visibilité du serveur !\n\n**Récompense :** +100 XP pour celui qui bump 🎁')
    .setTimestamp();

  await channel.send({ content: '@here', embeds: [embed] });
}

async function detectBump(message) {
  if (message.author.id !== DISBOARD_ID) return false;
  if (!message.embeds?.length) return false;

  const embed  = message.embeds[0];
  const isConf = embed?.description?.includes('bump') || embed?.description?.includes('Bump');
  if (!isConf) return false;

  // Chercher qui a utilisé /bump (interaction dans le cache de la guild)
  const gid = message.guild.id;
  const auditLogs = await message.guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
  let bumperId = null;
  if (auditLogs) {
    const entry = auditLogs.entries.find(e => e.executor?.id !== DISBOARD_ID);
    if (entry) bumperId = entry.executor?.id;
  }

  if (bumperId) {
    const xpSys = require('../xp');
    await xpSys.addXP(bumperId, gid, XP.BUMP_BONUS);
    await User.updateOne({ userId: bumperId, guildId: gid }, { $inc: { bumpCount: 1, bumpWeek: 1 } }, { upsert: true });
    await message.channel.send(`${EMOJIS.BUMP} Merci <@${bumperId}> pour le bump ! **+${XP.BUMP_BONUS} XP** ⚡`);
    logger.info('Bump', `Bump détecté par ${bumperId}`);
  }
  return true;
}

async function getBumpLeaderboard(guildId, limit = 10) {
  return User.find({ guildId, bumpCount: { $gt: 0 } }).sort({ bumpCount: -1 }).limit(limit);
}

module.exports = { sendBumpReminder, detectBump, getBumpLeaderboard };
