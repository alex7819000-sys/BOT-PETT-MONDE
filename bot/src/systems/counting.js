// src/systems/counting.js — Counting avancé avec système de bluff
// UI : tout se passe dans le salon (pas de DM sauf règles optionnelles)
// 2 boutons sous chaque message : [🔍 Vérifier] [🎭 Bluffer]
// Ephemeral replies pour les retours privés (visible que par le cliqueur)
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config        = require('../db/models/Config');
const CountingError = require('../db/models/CountingError');
const User          = require('../db/models/User');
const logger        = require('../utils/logger');

// ── En mémoire ────────────────────────────────────────────────────────────
// bluffIntents : userId → true  (a cliqué 🎭, prochain message = bluff)
const bluffIntents  = new Map();
// pendingBluffs : messageId → { authorId, fakeNumber, realExpected, expiresAt }
const pendingBluffs = new Map();
// Cooldown vérification : userId → timestamp
const verifyCooldown = new Map();

const BLUFF_WINDOW_MS  = 30_000; // 30s pour que quelqu'un vérifie
const VERIFY_COOLDOWN  = 3_000;  // 3s entre deux clics 🔍 du même user
const WEEKLY_FAULT_CAP = 3;
const SINGE_DURATION_MS = 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────
function extractNumber(content) {
  const m = content.trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function getConfig(guildId) {
  return Config.findOne({ guildId }).lean().catch(() => null);
}

// Construit les 2 boutons à mettre sous chaque message
function buildButtons(messageId, isBluff = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`counting_verify_${messageId}`)
      .setLabel('🔍 Vérifier')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`counting_bluff_${messageId}`)
      .setLabel('🎭 Bluffer')
      .setStyle(isBluff ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );
}

// Donne le rôle Singe + message dans le salon (PLUS DE DM)
async function makeSinge(member, realScore, reason, channel) {
  const guildId = member.guild.id;
  const userId  = member.id;
  const cfg     = await getConfig(guildId);

  // Track fautes hebdo
  let rec = await CountingError.findOne({ userId, guildId });
  if (!rec) rec = new CountingError({ userId, guildId, errorCount: 0, errorLog: [], weeklyFaults: 0 });
  rec.errorCount   += 1;
  rec.weeklyFaults  = (rec.weeklyFaults || 0) + 1;
  rec.dailyFaults   = (rec.dailyFaults || 0) + 1;
  rec.errorLog.push({ timestamp: new Date(), expected: realScore, given: null, streakBroken: realScore - 1 });
  await rec.save().catch(() => {});

  // Rôle Singe
  if (cfg?.singeRoleId) {
    const role = member.guild.roles.cache.get(cfg.singeRoleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  // 3 fautes semaine → timeout 24h
  if (rec.weeklyFaults >= WEEKLY_FAULT_CAP) {
    await member.timeout(SINGE_DURATION_MS, '3 fautes counting cette semaine').catch(() => {});
  }

  // Message public dans le salon (pas de DM)
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xFF6B35)
      .setTitle('🐒 Nouveau Singe !')
      .setDescription(
        `${member} devient **Singe** !\n` +
        `**Raison :** ${reason}\n\n` +
        `▶️ Le vrai prochain chiffre est **${realScore + 1}**\n` +
        `Fautes cette semaine : **${rec.weeklyFaults}/${WEEKLY_FAULT_CAP}**`
      );
    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  logger.warn('Counting', `${member.user.tag} → Singe (${reason})`);
}

async function removeSinge(member) {
  const cfg = await getConfig(member.guild.id);
  if (cfg?.singeRoleId) {
    await member.roles.remove(cfg.singeRoleId).catch(() => {});
  }
}

async function resetWeeklyFaults(guildId) {
  await CountingError.updateMany({ guildId }, { weeklyFaults: 0 }).catch(() => {});
}

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

async function getDailyCountingLeaderboard(guildId, limit = 10) {
  const docs = await CountingError.find({
    guildId,
    $or: [{ dailyGood: { $gt: 0 } }, { dailyFaults: { $gt: 0 } }, { dailyBluffsCaught: { $gt: 0 } }],
  }).lean();
  return docs
    .map(d => ({
      userId: d.userId,
      good: d.dailyGood || 0,
      faults: d.dailyFaults || 0,
      caught: d.dailyBluffsCaught || 0,
      score: (d.dailyGood || 0) - (d.dailyFaults || 0) + (d.dailyBluffsCaught || 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

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

  // ── Ce membre voulait bluffer ? ──────────────────────────────────────
  if (bluffIntents.has(userId)) {
    bluffIntents.delete(userId);

    pendingBluffs.set(message.id, {
      authorId:     userId,
      fakeNumber:   number,
      realExpected: expected,
      expiresAt:    Date.now() + BLUFF_WINDOW_MS,
    });

    // Un bot ne peut PAS éditer le message d'un autre utilisateur (Discord l'interdit) —
    // on envoie donc toujours un message séparé avec les boutons, en réponse au message compté.
    const btnMsg = await message.reply({ content: '🔍 Vérifier ce chiffre ?', components: [buildButtons(message.id, false)] }).catch(async () => {
      return message.channel.send({ content: `⬆️ Message de ${message.author}`, components: [buildButtons(message.id)] }).catch(() => null);
    });
    if (btnMsg) setTimeout(() => btnMsg.delete().catch(() => {}), BLUFF_WINDOW_MS + 2000);

    setTimeout(() => { pendingBluffs.delete(message.id); }, BLUFF_WINDOW_MS);
    return true;
  }

  // ── Vérifie si ce message suit un bluff non détecté ──────────────────
  for (const [msgId, bluff] of pendingBluffs) {
    if (bluff.fakeNumber === number - 1 && bluff.expiresAt > Date.now()) {
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

  // Un bot ne peut pas éditer le message d'un membre — on envoie un petit message séparé
  // avec les boutons 🔍 Vérifier / 🎭 Bluffer, qui référence ce message via son ID.
  const btnMsg = await message.channel.send({ components: [buildButtons(message.id)] }).catch(() => null);
  if (btnMsg) {
    setTimeout(() => btnMsg.delete().catch(() => {}), BLUFF_WINDOW_MS + 2000);
  } else {
    await message.react('✅').catch(() => {});
  }

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

// ── Handler : boutons (remplace les réactions) ────────────────────────────
// Cette fonction est appelée depuis buttons.js avec l'interaction du bouton
async function handleButton(interaction) {
  const { customId, user, guild, channel } = interaction;
  if (!customId.startsWith('counting_')) return false;

  const [, action, messageId] = customId.split('_');
  if (!['verify', 'bluff'].includes(action)) return false;

  const cfg = await getConfig(guild.id);
  if (!cfg?.countingChannelId) return false;
  if (channel.id !== cfg.countingChannelId) return false;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return false;

  // ── Bouton 🎭 Bluffer ─────────────────────────────────────────────────
  if (action === 'bluff') {
    // Ne peut pas bluffer si on vient d'écrire le dernier chiffre
    if (cfg.countingLastUserId === user.id) {
      await interaction.reply({
        content: '❌ Tu viens d\'écrire le dernier chiffre, tu ne peux pas bluffer maintenant !',
        ephemeral: true,
      });
      return true;
    }
    bluffIntents.set(user.id, true);
    await interaction.reply({
      content: '🎭 **Mode bluff activé !** Ton prochain chiffre dans ce salon sera un bluff. Écris n\'importe quel nombre pour piéger les autres !',
      ephemeral: true, // visible que par toi
    });
    return true;
  }

  // ── Bouton 🔍 Vérifier ────────────────────────────────────────────────
  if (action === 'verify') {
    // Cooldown anti-spam
    const last = verifyCooldown.get(user.id);
    if (last && Date.now() - last < VERIFY_COOLDOWN) {
      await interaction.reply({ content: '⏳ Attends un peu avant de vérifier à nouveau.', ephemeral: true });
      return true;
    }
    verifyCooldown.set(user.id, Date.now());

    const bluff = pendingBluffs.get(messageId);
    const realScore = cfg.countingCurrent || 0;

    if (bluff && bluff.expiresAt > Date.now()) {
      // C'est un bluff détecté !
      pendingBluffs.delete(messageId);
      await bumpDailyStat(user.id, guild.id, { caught: true });

      // Réponse visible que par le vérificateur
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x00FF88)
          .setTitle('🔍 Bluff détecté !')
          .setDescription(
            `<@${bluff.authorId}> bluffait avec **${bluff.fakeNumber}** !\n` +
            `Le vrai prochain chiffre est **${bluff.realExpected}**.`
          )
        ],
        ephemeral: true,
      });

      // Le bluffeur devient Singe — message PUBLIC dans le salon
      const bluffMember = await guild.members.fetch(bluff.authorId).catch(() => null);
      if (bluffMember) {
        await makeSinge(bluffMember, realScore, `Son bluff a été détecté par ${user.username} 🔍`, channel);
      }

    } else {
      // Message normal, pas un bluff — réponse privée propre
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('✅ Pas de bluff ici')
          .setDescription(
            `Ce message est légitime.\n\n` +
            `Score actuel : **${realScore}**\n` +
            `Prochain chiffre : **${realScore + 1}**`
          )
        ],
        ephemeral: true, // visible que par toi
      });
    }
    return true;
  }

  return false;
}

module.exports = {
  handleMessage,
  handleMessageUpdate,
  handleButton,
  removeSinge,
  resetWeeklyFaults,
  bumpDailyStat,
  getDailyCountingLeaderboard,
  resetDailyCountingStats,
};
