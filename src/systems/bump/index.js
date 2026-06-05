// src/systems/bump/index.js — Multi-source bump tracker — v5
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS, XP } = require('../../config/constants');

// ── IDs officiels des bots de bump/vote ──────────────────────────────────
const DISBOARD_ID       = '302050872383242240';
const DISCORDLIST_ID    = '521379571261939722'; // DiscordList bump bot
const DISCORDLIST_VOTE  = '470673740718399498'; // DiscordList vote bot (peut varier)
const TOPGG_ID          = '1105397275701149747'; // Top.gg vote bot

const BUMP_SILENCE = 3 * 60 * 60 * 1000; // 3h

// ── Sources de bump connues ───────────────────────────────────────────────
const BUMP_SOURCES = {
  disboard: {
    botId:  DISBOARD_ID,
    field:  'bumpDisboard',
    label:  'Disboard',
    emoji:  '🔵',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = msg.embeds[0]?.description || '';
      return desc.toLowerCase().includes('bump') || desc.toLowerCase().includes('bumped');
    },
    // Disboard utilise audit logs pour retrouver l'auteur
    useAuditLog: true,
    // Désactiver la parole 3h dans le salon bump
    silence: true,
  },
  discordlistBump: {
    botId:  DISCORDLIST_ID,
    field:  'bumpDiscordList',
    label:  'DiscordList Bump',
    emoji:  '🟢',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      const title = (msg.embeds[0]?.title || '').toLowerCase();
      return desc.includes('bump') || title.includes('bump');
    },
    useAuditLog: true,
    silence: false,
  },
  discordlistVote: {
    botId:  DISCORDLIST_VOTE,
    field:  'bumpDiscordListVote',
    label:  'DiscordList Vote',
    emoji:  '🟡',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      return desc.includes('vote') || desc.includes('a voté');
    },
    useAuditLog: false,
    // Vote → le bot mentionne souvent l'user dans la description
    extractUser: (msg) => {
      const desc = msg.embeds[0]?.description || '';
      const match = desc.match(/<@!?(\d+)>/);
      return match ? match[1] : null;
    },
    silence: false,
  },
  topgg: {
    botId:  TOPGG_ID,
    field:  'bumpTopgg',
    label:  'Top.gg',
    emoji:  '🔴',
    detect: (msg) => {
      if (!msg.embeds?.length) return false;
      const desc = (msg.embeds[0]?.description || '').toLowerCase();
      return desc.includes('voted') || desc.includes('vote') || desc.includes('a voté');
    },
    useAuditLog: false,
    extractUser: (msg) => {
      const desc = msg.embeds[0]?.description || '';
      const match = desc.match(/<@!?(\d+)>/);
      return match ? match[1] : null;
    },
    silence: false,
  },
};

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
      `**Récompense :** +${XP.BUMP_BONUS} XP 🎁\n\n` +
      `> Tu peux aussi voter sur **DiscordList** et **Top.gg** pour des points bonus !`
    )
    .setTimestamp();

  await channel.send({ content: ping, embeds: [embed] });
}

async function detectBump(message) {
  if (!message.author.bot || !message.guild) return false;

  const authorId = message.author.id;
  const gid      = message.guild.id;

  // Trouver quelle source correspond
  let source = null;
  for (const [key, src] of Object.entries(BUMP_SOURCES)) {
    if (src.botId === authorId && src.detect(message)) {
      source = src;
      break;
    }
  }
  if (!source) return false;

  // Retrouver l'utilisateur qui a bumped/voté
  let bumperId = null;

  if (source.useAuditLog) {
    const auditLogs = await message.guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
    if (auditLogs) {
      const entry = auditLogs.entries.find(e => e.executor?.id !== authorId);
      if (entry) bumperId = entry.executor?.id;
    }
  } else if (source.extractUser) {
    bumperId = source.extractUser(message);
  }

  if (!bumperId) return true; // bump détecté mais pas l'auteur → on s'arrête là

  // Créditer XP + compteurs
  const xpSys = require('../xp');
  await xpSys.addXP(bumperId, gid, XP.BUMP_BONUS);
  await User.updateOne(
    { userId: bumperId, guildId: gid },
    { $inc: {
        bumpCount: 1,
        bumpWeek:  1,
        [source.field]: 1,
      }
    },
    { upsert: true }
  );

  // Progression défis 'bumps'
  try {
    const { updateProgress } = require('../defis');
    await updateProgress(bumperId, gid, 'bumps', 1);
  } catch (_) {}

  // Message de confirmation stylé
  await message.channel.send(
    `${source.emoji} Merci <@${bumperId}> pour le **${source.label}** ! ` +
    `**+${XP.BUMP_BONUS} XP** ⚡`
  );

  // Silence 3h dans le salon bump (Disboard uniquement)
  if (source.silence) {
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
  }

  logger.info('Bump', `${source.label} par ${bumperId}`);
  return true;
}

async function getBumpLeaderboard(guildId, limit = 10) {
  return User.find({ guildId, bumpCount: { $gt: 0 } })
    .sort({ bumpCount: -1 })
    .limit(limit);
}

async function getUserBumpStats(userId, guildId) {
  return User.findOne({ userId, guildId });
}

module.exports = { sendBumpReminder, detectBump, getBumpLeaderboard, getUserBumpStats, BUMP_SOURCES };
