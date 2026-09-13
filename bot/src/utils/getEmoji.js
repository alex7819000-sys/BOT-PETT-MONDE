// src/utils/getEmoji.js — Récupère l'emoji custom du serveur ou le défaut
'use strict';
const Config = require('../db/models/Config');

const DEFAULTS = {
  KING:   '👑',
  XP:     '⚡',
  WIN:    '🏆',
  STAR:   '⭐',
  BUMP:   '🚀',
  SINGE:  '🐒',
  COUPLE: '💑',
  GUILD:  '🏰',
  SECRET: '🤫',
  ANIME:  '🎌',
  PRISON: '🔒',
  DOG:    '🐶',
  CAT:    '🐱',
};

// Cache en mémoire par guild (évite des requêtes DB répétées)
const cache = new Map(); // guildId -> { emojis, fetchedAt }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getEmoji(guildId, key) {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && (now - cached.fetchedAt) < CACHE_TTL) {
    return cached.emojis[key] || DEFAULTS[key] || key;
  }

  const config = await Config.findOne({ guildId }).select('customEmojis').lean().catch(() => null);
  const emojis = config?.customEmojis || {};
  cache.set(guildId, { emojis, fetchedAt: now });
  return emojis[key] || DEFAULTS[key] || key;
}

// Récupérer tous les emojis d'un coup (pour les embeds avec plusieurs)
async function getEmojis(guildId, ...keys) {
  const now = Date.now();
  const cached = cache.get(guildId);
  let emojis = {};

  if (cached && (now - cached.fetchedAt) < CACHE_TTL) {
    emojis = cached.emojis;
  } else {
    const config = await Config.findOne({ guildId }).select('customEmojis').lean().catch(() => null);
    emojis = config?.customEmojis || {};
    cache.set(guildId, { emojis, fetchedAt: now });
  }

  const result = {};
  for (const key of keys) result[key] = emojis[key] || DEFAULTS[key] || key;
  return result;
}

// Invalider le cache quand un emoji est modifié
function invalidateCache(guildId) {
  cache.delete(guildId);
}

module.exports = { getEmoji, getEmojis, invalidateCache, DEFAULTS };
