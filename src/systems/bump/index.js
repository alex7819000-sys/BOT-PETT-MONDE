// src/systems/bump/index.js — Bump tracker fiable via cache pré-bump
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS, XP } = require('../../config/constants');

const DISBOARD_ID      = '302050872383242240';
const DISCORDLIST_ID   = '521379571261939722';
const DISCORDLIST_VOTE = '470673740718399498';
const TOPGG_ID         = '1105397275701149747';
const BUMP_SILENCE     = 3 * 60 * 60 * 1000; // 3h

// ── Cache du dernier bumper par salon ─────────────────────────────────────
// Quand un humain envoie un message dans un salon où un bot de bump est
// susceptible de répondre, on mémorise son ID.
// Quand le bot de bump répond → on attribue l'XP à ce userId.
// guildId → { channelId → { userId, timestamp } }
const lastHumanInChannel = new Map();

// Appelé depuis messages.js pour TOUT message humain
function trackHumanMessage(message) {
  if (message.author.bot || !message.guild) return;
  const gid = message.guild.id;
  if (!lastHumanInChannel.has(gid)) lastHumanInChannel.set(gid, new Map());
  lastHumanInChannel.get(gid).set(message.channel.id, {
    userId:    message.author.id,
    timestamp: Date.now(),
  });
}

// Récupère le dernier humain du salon, dans une fenêtre de 30s max
function getLastBumper(guildId, channelId) {
  const entry = lastHumanInChannel.get(guildId)?.get(channelId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > 30_000) return null; // trop vieux
  return entry.userId;
}

// ── Sources de bump ───────────────────────────────────────────────────────
const BUMP_SOURCES = {
  disboard: {
    botId: DISBOARD_ID, field: 'bumpDisboard', label: 'Disboard', emoji: '🔵',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      return desc.includes('bump') || desc.includes('bumped');
    },
    // Disboard répond dans le même salon que le /bump → on prend le dernier humain
    useCache: true,
    silence: true,
  },
  discordlistBump: {
    botId: DISCORDLIST_ID, field: 'bumpDiscordList', label: 'DiscordList Bump', emoji: '🟢',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      const title = (msg.embeds[0]?.title || '').toLowerCase();
      return desc.includes('bump') || title.includes('bump');
    },
    useCache: true,
    silence: false,
  },
  discordlistVote: {
    botId: DISCORDLIST_VOTE, field: 'bumpDiscordListVote', label: 'DiscordList Vote', emoji: '🟡',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      return desc.includes('vote') || desc.includes('a voté');
    },
    useCache: false,
    extractUser: (msg) => (msg.embeds[0]?.description || '').match(/<@!?(\d+)>/)?.[1] || null,
    silence: false,
  },
  topgg: {
    botId: TOPGG_ID, field: 'bumpTopgg', label: 'Top.gg', emoji: '🔴',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      return desc.includes('voted') || desc.includes('vote') || desc.includes('a voté');
    },
    useCache: false,
    extractUser: (msg) => (msg.embeds[0]?.description || '').match(/<@!?(\d+)>/)?.[1] || null,
    silence: false,
  },
};

// ── Streaks ───────────────────────────────────────────────────────────────
async function checkBumpStreaks(userId, guildId, bumpWeekCount, guild = null) {
  const xpSys = require('../xp');
  const bonuses = [];
  if (bumpWeekCount === 3) {
    await xpSys.addXP(userId, guildId, XP.BUMP_STREAK_3, null, guild);
    bonuses.push(`⚡ **Streak 3 bumps !** +${XP.BUMP_STREAK_3} XP bonus`);
  } else if (bumpWeekCount === 7) {
    await xpSys.addXP(userId, guildId, XP.BUMP_STREAK_7, null, guild);
    bonuses.push(`🔥 **Streak 7 bumps !** +${XP.BUMP_STREAK_7} XP bonus`);
  }
  return bonuses;
}

async function sendKakera(userId, amount, guild, cfg) {
  const channelId = cfg?.mudaeChannelId || cfg?.waifuChannelId;
  if (!channelId || !amount) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel) await channel.send(`$give <@${userId}> ${amount}`).catch(() => {});
}

// ── Rappel bump ───────────────────────────────────────────────────────────
async function sendBumpReminder(client, guildId) {
  const config    = await Config.findOne({ guildId });
  const channelId = config?.bumpChannelId || config?.announceChannelId;
  if (!channelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  const ping = config?.bumpRoleId ? `<@&${config.bumpRoleId}>` : '@here';
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${EMOJIS.BUMP} C'est l'heure de bumper !`)
    .setDescription(
      `Tape \`/bump\` sur **Disboard** pour booster la visibilité du serveur !\n\n` +
      `**Récompense :** +${XP.BUMP_BONUS} XP + ${XP.BUMP_KAKERA} kakera 💎\n` +
      `**Streak 3 bumps :** +${XP.BUMP_STREAK_3} XP bonus\n` +
      `**Streak 7 bumps :** +${XP.BUMP_STREAK_7} XP bonus 🔥\n\n` +
      `> Plus tu bumpes, plus tu gagnes. Fais-le tous les 2h !`
    ).setTimestamp();

  await channel.send({ content: ping, embeds: [embed] });
}

// ── Détection bump ────────────────────────────────────────────────────────
async function detectBump(message) {
  if (!message.author.bot || !message.guild) return false;

  const authorId = message.author.id;
  const gid      = message.guild.id;

  // Trouver la source
  let source = null;
  for (const [, src] of Object.entries(BUMP_SOURCES)) {
    if (src.botId === authorId && src.detect(message)) { source = src; break; }
  }
  if (!source) return false;

  // Trouver le bumper
  let bumperId = null;

  if (source.useCache) {
    // Méthode fiable : dernier humain qui a écrit dans ce salon (fenêtre 30s)
    bumperId = getLastBumper(gid, message.channel.id);

    // Fallback : si la fenêtre de 30s est dépassée, on cherche dans l'historique du salon
    if (!bumperId) {
      try {
        const msgs = await message.channel.messages.fetch({ limit: 10, before: message.id });
        const humanMsg = msgs.find(m => !m.author.bot && Date.now() - m.createdTimestamp < 60_000);
        if (humanMsg) bumperId = humanMsg.author.id;
      } catch (_) {}
    }
  } else if (source.extractUser) {
    bumperId = source.extractUser(message);
  }

  if (!bumperId) {
    logger.warn('Bump', `${source.label} détecté mais bumper introuvable dans ${message.channel.name}`);
    return true;
  }

  const cfg = await Config.findOne({ guildId: gid });

  // XP + kakera
  const xpSys = require('../xp');
  await xpSys.addXP(bumperId, gid, XP.BUMP_BONUS, null, message.guild);
  await sendKakera(bumperId, XP.BUMP_KAKERA, message.guild, cfg);

  // Compteurs
  const user = await User.findOneAndUpdate(
    { userId: bumperId, guildId: gid },
    { $inc: { bumpCount: 1, bumpWeek: 1, [source.field]: 1 } },
    { upsert: true, new: true }
  );

  // Streaks
  const streakBonuses = await checkBumpStreaks(bumperId, gid, user.bumpWeek || 1, message.guild);

  // Défis
  try {
    const { updateProgress } = require('../defis');
    await updateProgress(bumperId, gid, 'bumps', 1);
  } catch (_) {}

  // Message confirmation
  const lines = [
    `${source.emoji} Merci <@${bumperId}> pour le **${source.label}** !`,
    `**+${XP.BUMP_BONUS} XP** + **${XP.BUMP_KAKERA} kakera** 💎`,
    `> Total bumps cette semaine : **${user.bumpWeek || 1}**`,
  ];
  if (streakBonuses.length) lines.push(...streakBonuses);
  await message.channel.send(lines.join('\n'));

  // Silence Disboard 3h
  if (source.silence) {
    const bumpChannelId = cfg?.bumpChannelId;
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
  }

  logger.info('Bump', `${source.label} par ${bumperId} — +${XP.BUMP_BONUS} XP`);
  return true;
}

async function getBumpLeaderboard(guildId, limit = 10) {
  return User.find({ guildId, bumpCount: { $gt: 0 } }).sort({ bumpCount: -1 }).limit(limit);
}
async function getUserBumpStats(userId, guildId) {
  return User.findOne({ userId, guildId });
}

module.exports = {
  sendBumpReminder, detectBump, getBumpLeaderboard, getUserBumpStats,
  BUMP_SOURCES, trackHumanMessage,
};
