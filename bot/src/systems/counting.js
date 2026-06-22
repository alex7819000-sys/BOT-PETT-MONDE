// src/systems/counting.js — Salon "counting" : compter 1, 2, 3... à la suite
// Système de ban progressif pour les erreurs
'use strict';
const Config = require('../db/models/Config');
const CountingError = require('../db/models/CountingError');
const logger = require('../utils/logger');

// Durées de mute en secondes selon le nombre d'erreurs
const MUTE_DURATIONS = {
  1: 30,      // 1ère erreur: 30 secondes
  2: 120,     // 2e erreur: 2 minutes
  3: 300,     // 3e erreur: 5 minutes
  4: 900,     // 4e erreur: 15 minutes
  5: 1800,    // 5e erreur: 30 minutes
  6: 3600,    // 6e+ erreurs: 1 heure
};

// Emojis de sévérité selon le nombre d'erreurs
const SEVERITY_EMOJIS = {
  1: '🟡', // Jaune
  2: '🟠', // Orange
  3: '🔴', // Rouge
  4: '💢', // Très red
  5: '🚫', // Banned
  6: '💀', // Dark red
};

// Extrait un nombre entier au tout début du message (ex: "42" ou "42 🎉" → 42)
function extractLeadingNumber(content) {
  const match = content.trim().match(/^(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

// Calcule la durée du mute selon le nombre d'erreurs
function getMuteDuration(errorCount) {
  if (errorCount >= 6) return MUTE_DURATIONS[6];
  return MUTE_DURATIONS[errorCount] || MUTE_DURATIONS[6];
}

// Applique un mute temporaire
async function applyMute(member, duration, reason) {
  try {
    // Ajouter le rôle "singe" si le membre en a besoin
    const cfg = await Config.findOne({ guildId: member.guild.id });
    if (cfg?.singeRoleId) {
      const singeRole = member.guild.roles.cache.get(cfg.singeRoleId);
      if (singeRole && !member.roles.cache.has(cfg.singeRoleId)) {
        await member.roles.add(singeRole).catch(() => {});
      }
    }

    // Mute le membre (en retirant permissions send messages)
    const muteRoleId = cfg?.muteRoleId;
    if (muteRoleId) {
      const muteRole = member.guild.roles.cache.get(muteRoleId);
      if (muteRole) {
        await member.roles.add(muteRole).catch(() => {});
      }
    }

    // Timeout Discord (plus moderne)
    await member.timeout(duration * 1000, reason).catch(() => {});

    return true;
  } catch (error) {
    logger.error('CountingError', `Mute failed: ${error.message}`);
    return false;
  }
}

async function handleMessage(message, countingChannelId) {
  if (!countingChannelId) return false;
  if (message.channel.id !== countingChannelId) return false;

  const number = extractLeadingNumber(message.content);

  // Message qui ne commence pas par un nombre → supprimé (salon réservé au counting)
  if (number === null) {
    await message.delete().catch(() => {});
    return true;
  }

  const gid = message.guild.id;
  const uid = message.author.id;
  const cfg = await Config.findOne({ guildId: gid });
  const current = cfg?.countingCurrent || 0;
  const lastUserId = cfg?.countingLastUserId || null;
  const expected = current + 1;

  // Même personne ne peut pas compter deux fois de suite
  if (lastUserId && lastUserId === message.author.id) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `${message.author} tu ne peux pas compter deux fois de suite ! Le prochain nombre est **${expected}**, laisse quelqu'un d'autre le poster.`,
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);
    return true;
  }

  // Mauvais nombre → BAN PROGRESSIF
  if (number !== expected) {
    await message.delete().catch(() => {});
    const best = Math.max(cfg?.countingBestStreak || 0, current);
    await Config.updateOne({ guildId: gid }, { countingCurrent: 0, countingLastUserId: null, countingBestStreak: best });

    // ─────────────────────────────────────────────
    // 📊 TRACKER L'ERREUR
    // ─────────────────────────────────────────────
    let countingError = await CountingError.findOne({ userId: uid, guildId: gid });
    
    if (!countingError) {
      countingError = new CountingError({
        userId: uid,
        guildId: gid,
        errorCount: 0,
        errorLog: []
      });
    }

    // Incrémenter le compteur d'erreurs
    countingError.errorCount += 1;
    
    // Ajouter l'erreur à l'historique
    countingError.errorLog.push({
      timestamp: new Date(),
      expected,
      given: number,
      streakBroken: current
    });

    // Sauvegarder
    await countingError.save();

    const errorCount = countingError.errorCount;
    const muteDuration = getMuteDuration(errorCount);
    const severity = SEVERITY_EMOJIS[Math.min(errorCount, 6)] || '💀';

    // ─────────────────────────────────────────────
    // 🔇 APPLIQUER LE MUTE
    // ─────────────────────────────────────────────
    let muteApplied = false;
    if (message.member && muteDuration > 0) {
      const reason = `Erreur counting #${errorCount} — fallait ${expected}, a écrit ${number}`;
      muteApplied = await applyMute(message.member, muteDuration, reason);
    }

    // Convertir en format lisible
    const durationStr = 
      muteDuration >= 3600 ? `${Math.floor(muteDuration / 3600)}h` :
      muteDuration >= 60 ? `${Math.floor(muteDuration / 60)}m` :
      `${muteDuration}s`;

    // ─────────────────────────────────────────────
    // 📢 MESSAGE D'ERREUR DÉTAILLÉ
    // ─────────────────────────────────────────────
    const failMessage = `${severity} ${message.author} a cassé le compte à **${current}** !
Il fallait écrire **${expected}**, tu as écrit **${number}**.

🔴 **Erreur #${errorCount}** — ${muteApplied ? `🔇 Mute **${durationStr}**` : '(Pas de mute appliqué)'}
On recommence à **1**.`;

    const fail = await message.channel.send({
      content: failMessage,
    }).catch(() => null);

    // Log l'erreur
    logger.warn('Counting', `${message.author.tag} (#${errorCount}) broke at ${current} in ${message.guild.name}`);

    return true;
  }

  // Bon nombre → on met à jour le compteur
  await Config.updateOne({ guildId: gid }, { countingCurrent: expected, countingLastUserId: message.author.id });

  // Réaction sympa tous les multiples de 100
  if (expected % 100 === 0) {
    message.react('🎉').catch(() => {});
  } else {
    message.react('✅').catch(() => {});
  }

  return false;
}

module.exports = { handleMessage };
