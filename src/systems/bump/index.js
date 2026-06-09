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

  const ping = config?.bumpRoleId ? `<@&${config.bumpRoleId}>` : '';

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
    // ── Méthode fiable : chercher dans l'embed du message bump ───────────
    // Disboard mentionne l'user dans la description ou dans les champs de l'embed
    const embed = message.embeds[0];
    if (embed) {
      // Cas 1 : mention directe dans la description  <@123456>
      const descMatch = (embed.description || '').match(/<@!?(\d+)>/);
      if (descMatch) bumperId = descMatch[1];

      // Cas 2 : champ "Bumped by" ou équivalent
      if (!bumperId) {
        for (const field of (embed.fields || [])) {
          const m = field.value?.match(/<@!?(\d+)>/);
          if (m) { bumperId = m[1]; break; }
        }
      }

      // Cas 3 : footer avec l'ID ou le nom (Disboard met parfois l'ID dans le footer)
      if (!bumperId && embed.footer?.text) {
        const m = embed.footer.text.match(/<@!?(\d+)>/);
        if (m) bumperId = m[1];
      }
    }

    // ── Fallback audit log seulement si rien trouvé dans l'embed ─────────
    if (!bumperId) {
      try {
        const now = Date.now();
        const auditLogs = await message.guild.fetchAuditLogs({ limit: 10 }).catch(() => null);
        if (auditLogs) {
          // Chercher une entrée récente (< 10 secondes) d'un humain
          const entry = auditLogs.entries.find(e =>
            e.executor &&
            !e.executor.bot &&
            e.executor.id !== authorId &&
            (now - e.createdTimestamp) < 10_000
          );
          if (entry) bumperId = entry.executor.id;
        }
      } catch (_) {}
    }
  } else if (source.extractUser) {
    bumperId = source.extractUser(message);
  }

  // ── Sécurité : ne jamais créditer un bot ─────────────────────────────
  if (bumperId) {
    try {
      const member = await message.guild.members.fetch(bumperId).catch(() => null);
      if (member?.user?.bot) {
        logger.warn('Bump', `Bumper détecté est un bot (${bumperId}) — ignoré`);
        bumperId = null;
      }
    } catch (_) {}
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
