// src/systems/feur.js — Système "feur" complet avec easter eggs + escalade au 3e quoi
'use strict';

const Config = require('../db/models/Config');

// Compteurs en mémoire : userId → { count, timer }
const quoiCounters = new Map();

// Easter eggs mots → réponses
const EASTER_EGGS = [
  { pattern: /\bquoi\b/i,      reply: () => random(['feur', 'feur 😭', 'FEUR', 'feur 💀', 'feur... 😶']) },
  { pattern: /\bcomment\b/i,   reply: () => random(['tateur 😭', 'TATEUR', 'tateur 💀']) },
  { pattern: /\bnon\b/i,       reply: () => random(['bre 😭', 'OMBRE', 'bre 💀']) },
  { pattern: /\boui\b/i,       reply: () => random(['stiti 😭', 'STITI', 'stiti 💀']) },
  { pattern: /\bsi\b/i,        reply: () => random(['rop 😭', 'rop 💀']) },
  { pattern: /\bwhy\b/i,       reply: () => random(['not 😭', 'NOT 💀']) },
  { pattern: /\bwhen\b/i,      reply: () => random(['ever 😭', 'EVER 💀']) },
];

// Insultes/rage-bait quand le mec s'est fait avoir 3x par "quoi"
const RAGE_MESSAGES = [
  (name) => `LOL ${name} s'est encore fait avoir par le quoi feur 😭💀 3ème fois cette session mon ami tu vas jamais apprendre`,
  (name) => `${name} face au quoi feur : 🐒 congrats bro t'es officiellement un singe certifié`,
  (name) => `3 fois ${name}... 3 FOIS. t'es pas une victime, t'es un habitué à ce stade 💀`,
  (name) => `ayo ${name} 😭 le quoi feur t'a encore eu ? bro c'est un piège vieux comme le monde comment t'es tombé dedans`,
  (name) => `${name} a dit quoi pour la 3ème fois et maintenant on sait tous que t'es inarrêtable 💀🐒`,
  (name) => `nouveau record : ${name} piégé 3x en une session par le même truc... sigma ? non. singe ? oui 🐒`,
  (name) => `${name} : "je tomberai pas dans le panneau" — ${name} 3 mins après : quoi 😭💀`,
];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function handleMessage(message, config) {
  if (!config) return;

  const content = message.content.trim();
  const guildId = message.guild?.id;
  const channelId = message.channel.id;

  // ── Easter eggs : réponses immédiates ─────────────────────────────────
  // Cherche le premier easter egg qui match
  for (const egg of EASTER_EGGS) {
    if (!egg.pattern.test(content)) continue;

    // Si c'est "quoi" et qu'un feurChannelId est configuré → seulement dans ce salon
    if (egg.pattern.toString().includes('\\bquoi\\b') && config.feurChannelId) {
      if (channelId !== config.feurChannelId) {
        // Hors du salon feur : on compte quand même pour l'escalade
        _incrementQuoi(message, config);
        return; // mais on ne répond pas hors salon feur
      }
    }

    // Répondre
    const reply = egg.reply();
    await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});

    // Pour "quoi" : incrémenter le compteur + vérifier escalade
    if (egg.pattern.toString().includes('\\bquoi\\b')) {
      await _incrementQuoi(message, config);
    }
    return; // un seul easter egg par message
  }
}

async function _incrementQuoi(message, config) {
  const userId = message.author.id;
  const now = Date.now();
  const WINDOW_MS = 10 * 60 * 1000; // fenêtre de 10 minutes

  let entry = quoiCounters.get(userId);
  if (!entry || (now - entry.lastAt) > WINDOW_MS) {
    entry = { count: 0, lastAt: now };
  }
  entry.count += 1;
  entry.lastAt = now;
  quoiCounters.set(userId, entry);

  // Nettoyage périodique (éviter memory leak)
  if (quoiCounters.size > 500) {
    for (const [uid, e] of quoiCounters) {
      if (now - e.lastAt > WINDOW_MS) quoiCounters.delete(uid);
    }
  }

  if (entry.count < 3) return;

  // ── 3ème quoi : escalade ─────────────────────────────────────────────
  entry.count = 0; // reset après pénalité
  quoiCounters.set(userId, entry);

  const member = message.member;
  const displayName = member?.displayName || message.author.username;

  // Envoyer message rage-bait public
  const rageMsg = random(RAGE_MESSAGES)(displayName);
  await message.channel.send({ content: rageMsg }).catch(() => {});

  // Attribuer le rôle Singe si configuré
  if (config.singeRoleId && member) {
    const role = message.guild.roles.cache.get(config.singeRoleId);
    if (role) {
      await member.roles.add(role).catch(() => {});

      // Annonce publique dans le salon de rang (ou dans le salon actuel)
      const announceChannelId = config.rankChannelId || message.channel.id;
      const announceChannel = message.guild.channels.cache.get(announceChannelId);
      if (announceChannel && announceChannel.id !== message.channel.id) {
        await announceChannel.send({
          content: `🐒 **${displayName}** vient de rejoindre le club des singes officiel du serveur (3 quoi en 10 min) 💀`
        }).catch(() => {});
      }
    }
  }
}

module.exports = { handleMessage };
