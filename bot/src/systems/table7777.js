'use strict';

const { Table7777Model, SPECIAL_NUMBERS, COMBOS } = require('../db/models/Table7777');
const logger = require('../utils/logger');

/**
 * Tire un chiffre aléatoire entre 0 et 10000 (inclus)
 * 0.5% de chance d'avoir un chiffre spécial (parmi SPECIAL_NUMBERS)
 * Sinon chiffre normal aléatoire (excluant les spéciaux)
 */
function drawNumber() {
  const isSpecialRoll = Math.random() < 0.005; // 0.5%
  if (isSpecialRoll) {
    return SPECIAL_NUMBERS[Math.floor(Math.random() * SPECIAL_NUMBERS.length)];
  }
  // Chiffre normal entre 0 et 10000, on évite les spéciaux
  let n;
  do {
    n = Math.floor(Math.random() * 10001);
  } while (SPECIAL_NUMBERS.includes(n));
  return n;
}

/**
 * Effectue un tirage pour un utilisateur.
 * Retourne: { number, isSpecial, newNumber, jetonsGained, newCombo, collection }
 */
async function rollTable7777(userId, guildId) {
  const number = drawNumber();
  const isSpecial = SPECIAL_NUMBERS.includes(number);

  // Récupère ou crée le profil
  let profile = await Table7777Model.findOne({ userId, guildId });
  if (!profile) {
    profile = new Table7777Model({ userId, guildId, collectedNumbers: [], specialFound: [], completedCombos: [] });
  }

  const newNumber = !profile.collectedNumbers.includes(number);
  let jetonsGained = 0;
  let newCombo = null;

  if (newNumber) {
    profile.collectedNumbers.push(number);
    if (isSpecial) {
      profile.specialFound.push(number);
      jetonsGained += 50;
    } else {
      jetonsGained += 1;
    }

    // Vérification des combos
    for (const combo of COMBOS) {
      if (profile.completedCombos.includes(combo.id)) continue;
      const hasAll = combo.numbers.every(n => profile.collectedNumbers.includes(n));
      if (hasAll) {
        profile.completedCombos.push(combo.id);
        jetonsGained += 100;
        newCombo = combo;
      }
    }
  } else {
    // Chiffre déjà possédé → petit bonus quand même
    jetonsGained += isSpecial ? 5 : 0;
  }

  profile.jetons += jetonsGained;
  profile.weeklyJetons = (profile.weeklyJetons || 0) + jetonsGained;
  profile.totalRolls += 1;
  profile.weeklyRolls = (profile.weeklyRolls || 0) + 1;
  profile.lastRoll = new Date();

  await profile.save();

  return {
    number,
    isSpecial,
    newNumber,
    jetonsGained,
    newCombo,
    collection: {
      jetons: profile.jetons,
      totalFound: profile.collectedNumbers.length,
      specialFound: profile.specialFound.length,
      completedCombos: profile.completedCombos,
      totalRolls: profile.totalRolls,
    },
  };
}

/**
 * Récupère la collection d'un utilisateur
 */
async function getUserCollection(userId, guildId) {
  const profile = await Table7777Model.findOne({ userId, guildId });
  if (!profile) return null;

  const completedCombos = COMBOS.filter(c => profile.completedCombos.includes(c.id));

  return {
    jetons: profile.jetons,
    totalFound: profile.collectedNumbers.length,
    specialFound: profile.specialFound.length,
    completedCombos,
    totalRolls: profile.totalRolls,
    lastRoll: profile.lastRoll,
  };
}

/**
 * Classement global (top 10 par jetons)
 */
async function getLeaderboard(guildId) {
  return Table7777Model.find({ guildId })
    .sort({ jetons: -1 })
    .limit(10)
    .lean();
}

/**
 * Classement de la semaine (top 10 par weeklyJetons)
 */
async function getWeeklyLeaderboard(guildId) {
  return Table7777Model.find({ guildId, weeklyJetons: { $gt: 0 } })
    .sort({ weeklyJetons: -1 })
    .limit(10)
    .lean();
}

/**
 * Réinitialise le classement hebdomadaire (appelé chaque lundi)
 */
async function resetWeeklyLeaderboard() {
  try {
    await Table7777Model.updateMany({}, { $set: { weeklyJetons: 0, weeklyRolls: 0 } });
    logger.info('Table7777', 'Classement hebdomadaire réinitialisé');
  } catch (err) {
    logger.error('Table7777', 'Erreur resetWeeklyLeaderboard', err);
  }
}

module.exports = {
  rollTable7777,
  getUserCollection,
  getLeaderboard,
  getWeeklyLeaderboard,
  resetWeeklyLeaderboard,
  COMBOS,
  SPECIAL_NUMBERS,
};
