// src/systems/bump/index.js — Bump auto + récompenses — v5
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS, XP } = require('../../config/constants');

const DISBOARD_ID   = '302050872383242240';
const BUMP_SILENCE  = 3 * 60 * 60 * 1000; // 3h silence dans bump channel après avoir bumpé

async function sendBumpReminder(client, guildId) {
  const config    = await Config.findOne({ guildId });
  const channelId = config?.bumpChannelId || config?.announceChannelId;
  if (!channelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  // Ping uniquement le rôle bump si configuré, sinon @here
  const ping = config?.bumpRoleId ? `<@&${config.bumpRoleId}>` : '@here';

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${EMOJIS.BUMP} C'est l'heure de bumper !`)
    .setDescription(`Tape \`/bump\` pour booster la visibilité du serveur !\n\n**Récompense :** +${XP.BUMP_BONUS} XP 🎁`)
    .setTimestamp();

  await channel.send({ content: ping, embeds: [embed] });
}

async function detectBump(message) {
  if (message.author.id !== DISBOARD_ID) return false;
  if (!message.embeds?.length) return false;

  const embed  = message.embeds[0];
  const isConf = embed?.description?.includes('bump') || embed?.description?.includes('Bump');
  if (!isConf) return false;

  const gid = message.guild.id;

  // Chercher le bumpeur via audit logs
  const auditLogs = await message.guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
  let bumperId = null;
  if (auditLogs) {
    const entry = auditLogs.entries.find(e => e.executor?.id !== DISBOARD_ID);
    if (entry) bumperId = entry.executor?.id;
  }

  if (bumperId) {
    const xpSys = require('../xp');
    await xpSys.addXP(bumperId, gid, XP.BUMP_BONUS);
    await User.updateOne(
      { userId: bumperId, guildId: gid },
      { $inc: { bumpCount: 1, bumpWeek: 1 } },
      { upsert: true }
    );

    // Confirmer le bump
    await message.channel.send(
      `${EMOJIS.BUMP} Merci <@${bumperId}> pour le bump ! **+${XP.BUMP_BONUS} XP** ⚡\n` +
      `⏳ Tu es silencieux dans ce salon pendant **3h** (prochain bump possible)`
    );

    // Silence 3h dans le salon bump pour ce user
    const config = await Config.findOne({ guildId: gid });
    const bumpChannelId = config?.bumpChannelId;
    if (bumpChannelId) {
      const bumpChannel = message.guild.channels.cache.get(bumpChannelId);
      if (bumpChannel) {
        try {
          await bumpChannel.permissionOverwrites.edit(bumperId, { SendMessages: false });
          setTimeout(async () => {
            await bumpChannel.permissionOverwrites.edit(bumperId, { SendMessages: null }).catch(() => {});
          }, BUMP_SILENCE);
        } catch (_) {}
      }
    }

    logger.info('Bump', `Bump par ${bumperId}`);
  }
  return true;
}

async function getBumpLeaderboard(guildId, limit = 10) {
  return User.find({ guildId, bumpCount: { $gt: 0 } }).sort({ bumpCount: -1 }).limit(limit);
}

module.exports = { sendBumpReminder, detectBump, getBumpLeaderboard };
