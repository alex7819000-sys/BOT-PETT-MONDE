// src/systems/feur.js — Système "feur" complet : rage-bait, escalade, rôle Singe
'use strict';

const Config = require('../db/models/Config');

// Compteurs en mémoire : userId → { count, lastAt }
const quoiCounters = new Map();

function random(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Réponses immédiates au "quoi" ─────────────────────────────────────────
// Le bot répond pas juste "feur" — il rage, il humilie, il référence les réseaux
const QUOI_RESPONSES = [
  // Classiques feur
  (name) => `FEUR 💀`,
  (name) => `feur 😭😭😭`,
  (name) => `FEUR HAHAHAHA ${name} t'es nul`,
  (name) => `feur... arrache ta tête ${name} 💀`,
  (name) => `FEUR bro t'as vraiment dit quoi en 2026 😭`,
  (name) => `feur imbécile 😭💀`,
  (name) => `HAHAHA FEUR ${name} t'es tombé dans le panneau comme un bleu`,
  (name) => `feur t'as fait ça ${name} 😭😭 t'as honte`,
  (name) => `FEUR 💀 regarde ça il a dit quoi comme un gosse`,

  // Références réseaux / mèmes
  (name) => `feur 🤓 six seven 🤓 ${name} t'aurais dû lire le contrat avant de parler`,
  (name) => `FEUR — bro a dit quoi comme si on était en 2014 💀 ${name} réveil toi`,
  (name) => `feur 😭 sigma rule : les singes disent quoi. et ${name} a dit quoi.`,
  (name) => `feur ${name} 💀 speed serait déçu de toi fr fr`,
  (name) => `FEUR — ${name} est officiellement le singe du jour no cap`,
  (name) => `feur 😭 bro ${name} vient de se faire ratio par un seul mot`,
  (name) => `feur 💀 ${name} a dit quoi et maintenant tout le monde sait qu'il est inarrêtable`,
  (name) => `FEUR 😭 kai cenat regarderait ${name} faire ça et dirait "bro it's not giving"`,
  (name) => `feur ${name} t'es un singe certifié 🐒 gg`,
  (name) => `FEUR — ${name} : "je suis pas bête" / ${name} deux secondes après : quoi`,
  (name) => `feur 😭 comme dit l'ancien : celui qui dit quoi... est un singe. ${name} sait maintenant`,
  (name) => `FEUR 💀 arrache ta tête ${name} t'as osé dire quoi ici`,
  (name) => `feur ${name} 🐒 t'aurais pu parler normalement mais non`,
  (name) => `FEUR bro ${name} vient de se faire avoir en direct devant tout le monde 😭😭`,
  (name) => `feur imbécile 💀 ${name} réfléchit pas avant de parler apparemment`,
  (name) => `FEUR — ${name} dit quoi, le serveur pleure de rire 😭🐒`,
  (name) => `feur ${name} c'est triste vraiment 💀 t'as vraiment dit quoi là`,
  (name) => `FEUR six seven ${name} 🤓 t'as signé le contrat maintenant`,
  (name) => `feur 😭 ${name} vient d'activer son mode singe automatiquement`,
  (name) => `FEUR — t'es sorti du sol ${name} ? parce que t'as parlé comme une taupe 💀`,
];

// ── Autres easter eggs ───────────────────────────────────────────────────
const EASTER_EGGS = [
  { pattern: /\bcomment\b/i,  reply: (name) => random([`tateur 😭`, `TATEUR 💀`, `tateur ${name} c'était facile 😭`]) },
  { pattern: /\bnon\b/i,      reply: (name) => random([`bre 😭`, `OMBRE 💀`, `bre... ${name} t'as perdu là`]) },
  { pattern: /\boui\b/i,      reply: (name) => random([`stiti 🐒`, `STITI 😭`, `stiti ${name} t'es tombé dans le piège`]) },
  { pattern: /\bsi\b/i,       reply: (name) => random([`rop 😭`, `rop 💀 ${name} c'était trop facile`]) },
  { pattern: /\bwhy\b/i,      reply: (name) => random([`not 😭`, `NOT 💀`]) },
  { pattern: /\bwhen\b/i,     reply: (name) => random([`ever 😭`, `EVER 💀`]) },
  { pattern: /\bwhere\b/i,    reply: (name) => random([`wolf 🐺😭`, `wolf — ${name} t'as pris ça en pleine tête`]) },
  { pattern: /\bwhat\b/i,     reply: (name) => random([`sapp 😭`, `SAPP 💀 ${name} bro`]) },
];

// ── Messages d'escalade au 3ème quoi ────────────────────────────────────
const ESCALADE_MESSAGES = [
  (name) => `LOOL ${name} vient de dire quoi pour la 3ème fois 😭💀 t'es pas une victime bro t'es un SINGE CERTIFIÉ 🐒`,
  (name) => `OHH ${name} 3 fois... TROIS fois le même piège 😭😭 sigma ? non. singe ? OUI 🐒 bienvenue dans le club`,
  (name) => `${name} face au quoi feur : 🐒 c'est officiel maintenant, t'as mérité le rôle`,
  (name) => `bro ${name} a dit quoi 3 fois en moins de 10 minutes 💀 je suis mort de rire c'est pas normal`,
  (name) => `HAHAHA ${name} 😭 3 quoi en session t'es pas un humain t'es un personnage de dessin animé 🐒💀`,
  (name) => `${name} : "je me ferai pas avoir" — ${name} 5 min après : quoi. encore. une 3ème fois. 😭💀 singe de l'année`,
  (name) => `kai cenat dirait "LECTUM" en voyant ${name} se faire avoir 3 fois d'affilée par le quoi feur 🐒😭`,
];

async function handleMessage(message, config) {
  if (!config) return;

  const content = message.content.trim();
  const channelId = message.channel.id;
  const displayName = message.member?.displayName || message.author.username;

  // ── Test "quoi" en priorité ─────────────────────────────────────────
  if (/\bquoi\b/i.test(content)) {
    // Si feurChannelId configuré → répond uniquement dans ce salon
    // mais compte pour l'escalade partout
    const inFeurChannel = !config.feurChannelId || channelId === config.feurChannelId;

    if (inFeurChannel) {
      const reply = random(QUOI_RESPONSES)(displayName);
      await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});
    }

    await _incrementQuoi(message, config, displayName);
    return;
  }

  // ── Autres easter eggs (partout, toujours) ──────────────────────────
  for (const egg of EASTER_EGGS) {
    if (!egg.pattern.test(content)) continue;
    const reply = egg.reply(displayName);
    await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});
    return;
  }
}

async function _incrementQuoi(message, config, displayName) {
  const userId = message.author.id;
  const now = Date.now();
  const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  let entry = quoiCounters.get(userId);
  if (!entry || (now - entry.lastAt) > WINDOW_MS) {
    entry = { count: 0, lastAt: now };
  }
  entry.count += 1;
  entry.lastAt = now;
  quoiCounters.set(userId, entry);

  // Nettoyage mémoire
  if (quoiCounters.size > 500) {
    for (const [uid, e] of quoiCounters) {
      if (now - e.lastAt > WINDOW_MS) quoiCounters.delete(uid);
    }
  }

  if (entry.count < 3) return;

  // ── 3ème quoi → escalade ─────────────────────────────────────────────
  entry.count = 0;
  quoiCounters.set(userId, entry);

  const member = message.member;

  // Message rage-bait d'escalade
  const escaladeMsg = random(ESCALADE_MESSAGES)(displayName);
  await message.channel.send({ content: escaladeMsg }).catch(() => {});

  // Rôle Singe si configuré
  if (config.singeRoleId && member) {
    const role = message.guild.roles.cache.get(config.singeRoleId);
    if (role) {
      await member.roles.add(role).catch(() => {});

      // Annonce dans le salon rank si différent
      const rankCh = config.rankChannelId
        ? message.guild.channels.cache.get(config.rankChannelId)
        : null;
      if (rankCh && rankCh.id !== message.channel.id) {
        await rankCh.send({
          content: `🐒 **${displayName}** vient de décrocher le rôle Singe officiel — 3 quoi en 10 min, le record est battu 💀`
        }).catch(() => {});
      }
    }
  }
}

module.exports = { handleMessage };
