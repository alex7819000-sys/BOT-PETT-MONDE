// src/systems/bonusXp.js — Rôles bonus XP temporaires (max 3 cumulables)
// Bonus possibles : +25%, +50%, +100% XP par message pendant une durée configurable
// Si un membre a déjà 3 bonus actifs, la quête donne de l'XP directe à la place
'use strict';
const User = require('../db/models/User');

const BONUS_TIERS = [
  { percent: 25,  label: '+25% XP',  emoji: '⭐' },
  { percent: 50,  label: '+50% XP',  emoji: '🌟' },
  { percent: 100, label: '+100% XP', emoji: '💫' },
];

const MAX_BONUSES = 3;

// XP de compensation si déjà 3 bonus (selon le tier du bonus manqué)
const OVERFLOW_XP = { 25: 50, 50: 100, 100: 200 };

/**
 * Calcule le multiplicateur XP total d'un membre (combine tous ses bonus actifs).
 * Retourne ex. 2.0 si le membre a +50% et +50% → 1.5 × 1.5 n'est PAS la logique —
 * on additionne les % pour rester simple : +25+50 = +75% → ×1.75
 */
async function getXpMultiplier(userId, guildId) {
  const user = await User.findOne({ userId, guildId }).lean().catch(() => null);
  if (!user?.activeXpBonuses?.length) return 1;

  const now = Date.now();
  const active = user.activeXpBonuses.filter(b => new Date(b.expiresAt).getTime() > now);
  if (!active.length) return 1;

  const totalPercent = active.reduce((sum, b) => sum + (b.percent || 0), 0);
  return 1 + totalPercent / 100;
}

/**
 * Ajoute un bonus XP à un membre.
 * Retourne { added: true, bonus } si ajouté, ou { added: false, overflowXp, bonus } si déjà 3 bonus.
 */
async function addBonus(userId, guildId, percent, durationHours = 24) {
  const now = Date.now();

  // Nettoyer les bonus expirés avant de compter
  await User.updateOne(
    { userId, guildId },
    { $pull: { activeXpBonuses: { expiresAt: { $lte: new Date() } } } }
  );

  const user = await User.findOne({ userId, guildId }).lean().catch(() => null);
  const active = (user?.activeXpBonuses || []).filter(b => new Date(b.expiresAt).getTime() > now);

  if (active.length >= MAX_BONUSES) {
    // Déjà au max → XP de compensation
    const overflowXp = OVERFLOW_XP[percent] || 50;
    return { added: false, overflowXp, percent };
  }

  const bonus = {
    percent,
    expiresAt: new Date(now + durationHours * 3600 * 1000),
    addedAt: new Date(),
  };

  await User.findOneAndUpdate(
    { userId, guildId },
    { $push: { activeXpBonuses: bonus } },
    { upsert: true }
  );

  return { added: true, bonus, percent };
}

/**
 * Supprime tous les bonus expirés pour tous les membres d'un serveur (appelé par cron).
 */
async function cleanExpiredBonuses() {
  await User.updateMany(
    { 'activeXpBonuses.0': { $exists: true } },
    { $pull: { activeXpBonuses: { expiresAt: { $lte: new Date() } } } }
  );
}

/**
 * Retourne les bonus actifs d'un membre avec temps restant.
 */
async function getActiveBonuses(userId, guildId) {
  const user = await User.findOne({ userId, guildId }).lean().catch(() => null);
  if (!user?.activeXpBonuses?.length) return [];
  const now = Date.now();
  return user.activeXpBonuses.filter(b => new Date(b.expiresAt).getTime() > now);
}

module.exports = { getXpMultiplier, addBonus, cleanExpiredBonuses, getActiveBonuses, BONUS_TIERS, MAX_BONUSES, OVERFLOW_XP };
