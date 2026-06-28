// src/systems/counting.js — Counting simple : un chiffre juste à la fois,
// une faute donne le rôle Singe + malus temporaire (-XP + bloqué du salon),
// mais NE remet jamais le compteur à 0. Seul le couronnement de minuit reset.
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config        = require('../db/models/Config');
const CountingError = require('../db/models/CountingError');
const logger        = require('../utils/logger');

const WEEKLY_FAULT_CAP = 3;

// ── Helpers ───────────────────────────────────────────────────────────────
function extractNumber(content) {
  const m = content.trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function getConfig(guildId) {
  return Config.findOne({ guildId }).lean().catch(() => null);
}

// Donne le rôle Singe + applique le malus (-X% XP partout, bloqué du counting) + message
async function makeSinge(member, realScore, reason, channel) {
  const guildId = member.guild.id;
  const userId  = member.id;
  const cfg     = await getConfig(guildId);

  const malusHours   = cfg?.countingMalusDurationHours ?? 6;
  const malusPercent = cfg?.countingMalusPercent ?? 50;
  const malusUntil   = new Date(Date.now() + malusHours * 60 * 60 * 1000);

  // Track fautes hebdo + malus actif
  let rec = await CountingError.findOne({ userId, guildId });
  if (!rec) rec = new CountingError({ userId, guildId, errorCount: 0, errorLog: [], weeklyFaults: 0 });
  rec.errorCount   += 1;
  rec.weeklyFaults  = (rec.weeklyFaults || 0) + 1;
  rec.dailyFaults   = (rec.dailyFaults || 0) + 1;
  rec.errorLog.push({ timestamp: new Date(), expected: realScore, given: null, streakBroken: realScore - 1 });
  rec.xpMalusUntil     = malusUntil;
  rec.countingBanUntil = malusUntil;
  await rec.save().catch(() => {});

  // Rôle Singe (badge visuel — retiré automatiquement à la fin du malus, voir cron)
  if (cfg?.singeRoleId) {
    const role = member.guild.roles.cache.get(cfg.singeRoleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  // Bloqué du salon counting pendant la durée du malus (uniquement ce salon, pas tout le serveur)
  if (channel) {
    await channel.permissionOverwrites.edit(member, { SendMessages: false }).catch(() => {});
  }

  // 3 fautes/semaine → en plus du malus, un vrai timeout serveur (récidive = plus sévère)
  if (rec.weeklyFaults >= WEEKLY_FAULT_CAP) {
    const durationMs = (cfg?.countingSingeDurationHours ?? 24) * 60 * 60 * 1000;
    await member.timeout(durationMs, '3 fautes counting cette semaine').catch(() => {});
  }

  // Message public dans le salon
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B35)
      .setTitle('🐒 Nouveau Singe !')
      .setDescription(
        `${member} devient **Singe** !\n` +
        `**Raison :** ${reason}\n\n` +
        `▶️ Le vrai prochain chiffre est **${realScore + 1}**\n` +
        `Fautes cette semaine : **${rec.weeklyFaults}/${WEEKLY_FAULT_CAP}**\n\n` +
        `⏳ Pendant **${malusHours}h** : -${malusPercent}% XP partout + bloqué de ce salon` +
        (rec.weeklyFaults >= WEEKLY_FAULT_CAP ? `\n🔇 + timeout serveur (3e faute de la semaine)` : '')
      );
    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  logger.warn('Counting', `${member.user.tag} → Singe (${reason})`);
}

// Retire le rôle Singe + le blocage du salon counting — appelé par le cron de nettoyage
// (voir cleanupExpiredMalus) une fois le malus écoulé.
async function removeSinge(member, channel) {
  const cfg = await getConfig(member.guild.id);
  if (cfg?.singeRoleId) {
    await member.roles.remove(cfg.singeRoleId).catch(() => {});
  }
  if (channel) {
    await channel.permissionOverwrites.delete(member).catch(() => {});
  }
}

// À appeler périodiquement (cron) — lève le blocage counting + retire le rôle Singe
// pour tous les membres dont le malus est terminé. Sans ça, le rôle/blocage restait
// collé pour toujours puisque rien ne le retirait automatiquement.
async function cleanupExpiredMalus(client) {
  const expired = await CountingError.find({
    countingBanUntil: { $ne: null, $lte: new Date() },
  }).lean();

  for (const rec of expired) {
    try {
      const guild = client.guilds.cache.get(rec.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(rec.userId).catch(() => null);
      const cfg = await getConfig(rec.guildId);
      const channel = cfg?.countingChannelId ? guild.channels.cache.get(cfg.countingChannelId) : null;

      if (member) await removeSinge(member, channel);
      else if (channel) await channel.permissionOverwrites.delete(rec.userId).catch(() => {});

      await CountingError.updateOne(
        { _id: rec._id },
        { xpMalusUntil: null, countingBanUntil: null }
      );
    } catch (err) {
      logger.error('Counting', `Erreur nettoyage malus pour ${rec.userId}`, err);
    }
  }
}

// Le malus est-il actif pour ce membre ? (utilisé par index.js pour réduire l'XP)
async function getActiveMalusPercent(userId, guildId) {
  const rec = await CountingError.findOne({ userId, guildId }).lean();
  if (!rec?.xpMalusUntil || rec.xpMalusUntil <= new Date()) return 0;
  const cfg = await getConfig(guildId);
  return cfg?.countingMalusPercent ?? 50;
}

async function resetWeeklyFaults(guildId) {
  await CountingError.updateMany({ guildId }, { weeklyFaults: 0 }).catch(() => {});
}

async function bumpDailyStat(userId, guildId, { good, fault } = {}) {
  const inc = {};
  if (good)  inc.dailyGood = 1;
  if (fault) inc.dailyFaults = 1;
  if (!Object.keys(inc).length) return;
  await CountingError.findOneAndUpdate(
    { userId, guildId },
    { $inc: inc },
    { upsert: true }
  ).catch(() => {});
}

async function getDailyCountingLeaderboard(guildId, limit = 10) {
  const docs = await CountingError.find({
    guildId,
    $or: [{ dailyGood: { $gt: 0 } }, { dailyFaults: { $gt: 0 } }],
  }).lean();
  return docs
    .map(d => ({
      userId: d.userId,
      good: d.dailyGood || 0,
      faults: d.dailyFaults || 0,
      score: (d.dailyGood || 0) - (d.dailyFaults || 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function resetDailyCountingStats(guildId) {
  await CountingError.updateMany({ guildId }, { dailyGood: 0, dailyFaults: 0 }).catch(() => {});
}

// ── Handler principal : nouveaux messages ─────────────────────────────────
async function handleMessage(message) {
  const cfg = await getConfig(message.guild.id);
  if (!cfg?.countingChannelId) return false;
  if (message.channel.id !== cfg.countingChannelId) return false;
  if (message.author.bot) return false;

  const number = extractNumber(message.content);

  // Message sans chiffre → supprimé silencieusement
  if (number === null) {
    await message.delete().catch(() => {});
    return true;
  }

  const guildId  = message.guild.id;
  const userId   = message.author.id;
  const realScore = cfg.countingCurrent || 0;
  const expected  = realScore + 1;
  const lastUser  = cfg.countingLastUserId || null;

  // Même personne deux fois de suite
  if (lastUser === userId) {
    await message.delete().catch(() => {});
    const w = await message.channel.send({
      content: `${message.author} ❌ Tu ne peux pas compter deux fois de suite ! Prochain chiffre : **${expected}**`
    }).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
    return true;
  }

  // ── Chiffre incorrect ────────────────────────────────────────────────
  // Important : on NE remet PAS le compteur à 0 ici. La partie continue exactement
  // où elle en était (le prochain chiffre attendu reste le même) — seule la faute
  // est sanctionnée (Singe + malus). Le compteur ne repart à 0 qu'au couronnement
  // de minuit (voir postFinalLeaderboardAndCrown), jamais sur une simple erreur.
  if (number !== expected) {
    await message.delete().catch(() => {});
    const best = Math.max(cfg.countingBestStreak || 0, realScore);
    await Config.updateOne({ guildId }, { countingBestStreak: best });
    await makeSinge(message.member, realScore, `Mauvais chiffre ! Fallait **${expected}**, t'as écrit **${number}** 💀`, message.channel);
    return true;
  }

  // ── Bon chiffre ───────────────────────────────────────────────────────
  await Config.updateOne({ guildId }, { countingCurrent: expected, countingLastUserId: userId });
  await bumpDailyStat(userId, guildId, { good: true });


  if (expected % 100 === 0) {
    await message.react('🎉').catch(() => {});
    await message.channel.send({ content: `🎉 **${expected}** ! Bravo à tous — continuez comme ça !` }).catch(() => {});
  }

  return true;
}

// ── Handler : édition d'un message ───────────────────────────────────────
async function handleMessageUpdate(oldMessage, newMessage) {
  const cfg = await getConfig(newMessage.guild?.id).catch(() => null);
  if (!cfg?.countingChannelId) return;
  if (newMessage.channel.id !== cfg.countingChannelId) return;
  if (newMessage.author?.bot) return;

  const member = newMessage.member || await newMessage.guild.members.fetch(newMessage.author.id).catch(() => null);
  if (!member) return;
  const realScore = cfg.countingCurrent || 0;
  await makeSinge(member, realScore, `Tu as édité ton message dans le counting 🚫`, newMessage.channel);
}
module.exports = {
  handleMessage,
  handleMessageUpdate,
  removeSinge,
  resetWeeklyFaults,
  bumpDailyStat,
  getDailyCountingLeaderboard,
  resetDailyCountingStats,
  cleanupExpiredMalus,
  getActiveMalusPercent,
};
