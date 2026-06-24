// src/systems/counting.js — Counting avancé avec système de bluff
// Mécaniques :
//   - 🔍 sous chaque message = vérifier si c'est un bluff (DM le vrai score)
//   - 🎭 sous chaque message = activer le bluff sur son prochain message
//   - Si tu suis un bluff sans vérifier → Singe
//   - Si tu bluffes et quelqu'un vérifie → toi = Singe
//   - Éditer un message → Singe automatique
//   - 3 fautes semaine → Singe 24h
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config       = require('../db/models/Config');
const CountingError = require('../db/models/CountingError');
const User         = require('../db/models/User');
const logger       = require('../utils/logger');

// ── En mémoire ────────────────────────────────────────────────────────────
// bluffIntents : userId → true  (a cliqué 🎭, prochain message = bluff)
const bluffIntents = new Map();
// pendingBluffs : messageId → { authorId, fakeNumber, realExpected, expiresAt }
const pendingBluffs = new Map();
// Cooldown vérification : userId → timestamp (évite spam de 🔍)
const verifyCooldown = new Map();

const BLUFF_WINDOW_MS  = 15_000; // 15s pour que quelqu'un vérifie
const VERIFY_COOLDOWN  = 3_000;  // 3s entre deux clics 🔍 du même user
const WEEKLY_FAULT_CAP = 3;      // fautes avant rôle Singe 24h
const SINGE_DURATION_MS = 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────
function extractNumber(content) {
  const m = content.trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function getConfig(guildId) {
  return Config.findOne({ guildId }).lean().catch(() => null);
}

// Donne le rôle Singe + DM le vrai score + track faute hebdo
async function makeSinge(member, realScore, reason, channel) {
  const guildId = member.guild.id;
  const userId  = member.id;
  const cfg     = await getConfig(guildId);

  // Track fautes hebdo
  let rec = await CountingError.findOne({ userId, guildId });
  if (!rec) rec = new CountingError({ userId, guildId, errorCount: 0, errorLog: [], weeklyFaults: 0 });
  rec.errorCount    += 1;
  rec.weeklyFaults   = (rec.weeklyFaults || 0) + 1;
  rec.dailyFaults    = (rec.dailyFaults || 0) + 1;
  rec.errorLog.push({ timestamp: new Date(), expected: realScore, given: null, streakBroken: realScore - 1 });
  await rec.save().catch(() => {});

  // Rôle Singe
  if (cfg?.singeRoleId) {
    const role = member.guild.roles.cache.get(cfg.singeRoleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  // Si 3 fautes semaine → timeout 24h en plus
  if (rec.weeklyFaults >= WEEKLY_FAULT_CAP) {
    await member.timeout(SINGE_DURATION_MS, '3 fautes counting cette semaine').catch(() => {});
  }

  // DM avec le vrai score
  try {
    const dm = await member.createDM();
    await dm.send({
      embeds: [new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle('🐒 Tu es devenu Singe !')
        .setDescription(
          `**Raison :** ${reason}\n\n` +
          `Le vrai score actuel est **${realScore}**.\n` +
          `Le prochain chiffre à écrire est **${realScore + 1}**.`
        )
        .setFooter({ text: `Fautes cette semaine : ${rec.weeklyFaults}/${WEEKLY_FAULT_CAP}` })
      ]
    });
  } catch { /* DM fermés */ }

  // Message public
  if (channel) {
    await channel.send({
      content: `🐒 ${member} devient **Singe** ! ${reason}\n> Le vrai prochain chiffre est **${realScore + 1}**.`
    }).catch(() => {});
  }

  logger.warn('Counting', `${member.user.tag} → Singe (${reason})`);
}

// Retire le rôle Singe (appelé par un cron ou manuellement)
async function removeSinge(member) {
  const cfg = await getConfig(member.guild.id);
  if (cfg?.singeRoleId) {
    await member.roles.remove(cfg.singeRoleId).catch(() => {});
  }
}

// Reset fautes hebdo (appelé par le cron dimanche)
async function resetWeeklyFaults(guildId) {
  await CountingError.updateMany({ guildId }, { weeklyFaults: 0 }).catch(() => {});
}

// ── Stats journalières pour le classement counting ─────────────────────────
// good=true  → +1 bon chiffre posté
// fault=true → +1 faute (mauvais chiffre / bluff suivi / édition)
// caught=true→ +1 bluff démasqué (clic 🔍 qui révèle un bluff)
async function bumpDailyStat(userId, guildId, { good, fault, caught } = {}) {
  const inc = {};
  if (good)   inc.dailyGood = 1;
  if (fault)  inc.dailyFaults = 1;
  if (caught) inc.dailyBluffsCaught = 1;
  if (!Object.keys(inc).length) return;
  await CountingError.findOneAndUpdate(
    { userId, guildId },
    { $inc: inc },
    { upsert: true }
  ).catch(() => {});
}

// Score du jour = bons chiffres - fautes + bluffs démasqués
async function getDailyCountingLeaderboard(guildId, limit = 10) {
  const docs = await CountingError.find({
    guildId,
    $or: [{ dailyGood: { $gt: 0 } }, { dailyFaults: { $gt: 0 } }, { dailyBluffsCaught: { $gt: 0 } }],
  }).lean();

  return docs
    .map((d) => ({
      userId: d.userId,
      good: d.dailyGood || 0,
      faults: d.dailyFaults || 0,
      caught: d.dailyBluffsCaught || 0,
      score: (d.dailyGood || 0) - (d.dailyFaults || 0) + (d.dailyBluffsCaught || 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Reset quotidien (appelé par le cron à minuit, après l'annonce du gagnant)
async function resetDailyCountingStats(guildId) {
  await CountingError.updateMany({ guildId }, { dailyGood: 0, dailyFaults: 0, dailyBluffsCaught: 0 }).catch(() => {});
}

// ── Handler principal : nouveaux messages ─────────────────────────────────
async function handleMessage(message) {
  const cfg = await getConfig(message.guild.id);
  if (!cfg?.countingChannelId) return false;
  if (message.channel.id !== cfg.countingChannelId) return false;
  if (message.author.bot) return false;

  const number = extractNumber(message.content);

  // Message sans chiffre → supprimé
  if (number === null) {
    await message.delete().catch(() => {});
    return true;
  }

  const guildId   = message.guild.id;
  const userId    = message.author.id;
  const realScore = cfg.countingCurrent || 0;
  const expected  = realScore + 1;
  const lastUser  = cfg.countingLastUserId || null;

  // Même personne deux fois de suite
  if (lastUser === userId) {
    await message.delete().catch(() => {});
    const w = await message.channel.send(`${message.author} tu ne peux pas compter deux fois de suite ! Prochain : **${expected}**`).catch(() => null);
    if (w) setTimeout(() => w.delete().catch(() => {}), 6000);
    return true;
  }

  // ── Ce membre voulait bluffer ? ──────────────────────────────────────
  if (bluffIntents.has(userId)) {
    bluffIntents.delete(userId);

    // Même si le chiffre est "correct", on l'enregistre comme bluff potentiel
    // Le vrai score n'avance PAS
    pendingBluffs.set(message.id, {
      authorId:     userId,
      fakeNumber:   number,
      realExpected: expected,
      expiresAt:    Date.now() + BLUFF_WINDOW_MS,
    });

    // Ajouter les réactions
    await message.react('🔍').catch(() => {});
    await message.react('🎭').catch(() => {});

    // Expiration auto — si personne vérifie → le bluff "réussit"
    // (le vrai score reste inchangé, le prochain qui écrit expected+1 basé sur le faux sera puni)
    setTimeout(async () => {
      if (pendingBluffs.has(message.id)) {
        pendingBluffs.delete(message.id);
        // Bluff expiré sans être détecté = succès silencieux
        // Le score réel n'a pas bougé, le piège est tendu
      }
    }, BLUFF_WINDOW_MS);

    return true;
  }

  // ── Vérifier si ce message suit un bluff non détecté ─────────────────
  // Chercher s'il y a un bluff récent dont le fakeNumber = number - 1
  // (i.e. la personne a suivi le faux chiffre)
  for (const [msgId, bluff] of pendingBluffs) {
    if (bluff.fakeNumber === number - 1 && bluff.expiresAt > Date.now()) {
      // Cette personne a suivi le faux chiffre sans vérifier → Singe
      pendingBluffs.delete(msgId);
      await message.delete().catch(() => {});
      await makeSinge(message.member, realScore, `Tu as suivi un bluff sans vérifier 🎭`, message.channel);
      return true;
    }
  }

  // ── Chiffre incorrect classique ───────────────────────────────────────
  if (number !== expected) {
    await message.delete().catch(() => {});
    const best = Math.max(cfg.countingBestStreak || 0, realScore);
    await Config.updateOne({ guildId }, { countingCurrent: 0, countingLastUserId: null, countingBestStreak: best });
    await makeSinge(message.member, 0, `Mauvais chiffre ! Fallait **${expected}**, t'as écrit **${number}** 💀`, message.channel);
    return true;
  }

  // ── Bon chiffre ───────────────────────────────────────────────────────
  await Config.updateOne({ guildId }, { countingCurrent: expected, countingLastUserId: userId });
  await bumpDailyStat(userId, guildId, { good: true });

  // Réactions sur le message
  await message.react('🔍').catch(() => {});
  await message.react('🎭').catch(() => {});
  if (expected % 100 === 0) await message.react('🎉').catch(() => {});

  return true;
}

// ── Handler : édition d'un message dans le counting ──────────────────────
async function handleMessageUpdate(oldMessage, newMessage) {
  const cfg = await getConfig(newMessage.guild?.id).catch(() => null);
  if (!cfg?.countingChannelId) return;
  if (newMessage.channel.id !== cfg.countingChannelId) return;
  if (newMessage.author?.bot) return;

  // Édition = Singe automatique
  const member = newMessage.member || await newMessage.guild.members.fetch(newMessage.author.id).catch(() => null);
  if (!member) return;

  const realScore = cfg.countingCurrent || 0;
  await makeSinge(member, realScore, `Tu as édité ton message dans le counting 🚫`, newMessage.channel);
}

// ── Handler : réaction sur un message de counting ─────────────────────────
async function handleReaction(reaction, user) {
  if (user.bot) return;
  if (!['🔍', '🎭'].includes(reaction.emoji.name)) return;

  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  if (!message) return;

  const cfg = await getConfig(message.guild.id);
  if (!cfg?.countingChannelId) return;
  if (message.channel.id !== cfg.countingChannelId) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  // ── 🎭 — activer l'intention de bluffer ──────────────────────────────
  if (reaction.emoji.name === '🎭') {
    // Ne peut pas bluffer son propre message suivant si on vient d'écrire
    bluffIntents.set(user.id, true);
    try {
      const dm = await member.createDM();
      await dm.send('🎭 **Mode bluff activé !** Ton prochain message dans le counting sera un bluff. Écris n\'importe quel chiffre pour piéger les autres !');
    } catch { /* DM fermés */ }
    // Retirer la réaction pour que ça reste discret
    await reaction.users.remove(user.id).catch(() => {});
    return;
  }

  // ── 🔍 — vérifier si le message est un bluff ─────────────────────────
  if (reaction.emoji.name === '🔍') {
    // Cooldown anti-spam
    const last = verifyCooldown.get(user.id);
    if (last && Date.now() - last < VERIFY_COOLDOWN) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }
    verifyCooldown.set(user.id, Date.now());
    await reaction.users.remove(user.id).catch(() => {});

    const bluff = pendingBluffs.get(message.id);
    const realScore = cfg.countingCurrent || 0;

    try {
      const dm = await member.createDM();

      if (bluff && bluff.expiresAt > Date.now()) {
        // C'est un bluff ! Le vérificateur l'a détecté
        pendingBluffs.delete(message.id);
        await bumpDailyStat(user.id, message.guild.id, { caught: true });

        await dm.send({
          embeds: [new EmbedBuilder()
            .setColor(0x00FF88)
            .setTitle('🔍 Bluff détecté !')
            .setDescription(
              `**${message.author.username}** bluffait avec **${bluff.fakeNumber}** !\n` +
              `Le vrai prochain chiffre est **${bluff.realExpected}**.`
            )
          ]
        });

        // Le bluffeur devient Singe
        const bluffMember = await message.guild.members.fetch(bluff.authorId).catch(() => null);
        if (bluffMember) {
          await makeSinge(bluffMember, realScore, `Son bluff a été détecté par ${user.username} 🔍`, message.channel);
        }

      } else {
        // Message normal, pas un bluff
        await dm.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🔍 Vérification')
            .setDescription(
              `Ce message **n'est pas un bluff** ✅\n` +
              `Le vrai score actuel est **${realScore}**.\n` +
              `Le prochain chiffre est **${realScore + 1}**.`
            )
          ]
        });
      }
    } catch { /* DM fermés */ }
  }
}

module.exports = {
  handleMessage,
  handleMessageUpdate,
  handleReaction,
  removeSinge,
  resetWeeklyFaults,
  bumpDailyStat,
  getDailyCountingLeaderboard,
  resetDailyCountingStats,
};
