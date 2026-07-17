'use strict';

const { Table7777Model, SPECIAL_NUMBERS, COMBOS } = require('../db/models/Table7777');

/**
 * Effectue un tirage aléatoire sur la roulette 7777
 * @param {string} userId 
 * @param {string} guildId 
 * @returns {object} { number, isSpecial, newCombo, jétonsGained, collection }
 */
async function rollTable7777(userId, guildId) {
  // Génère un chiffre aléatoire 0-10000
  const rolled = Math.floor(Math.random() * 10001);
  
  // Chance d'avoir un chiffre spécial : 0.5%
  const isSpecial = SPECIAL_NUMBERS.includes(rolled);
  
  // Points gagnés
  let jetonsGained = 1; // Base : 1 jeton par roulette
  if (isSpecial) jetonsGained = 50; // Spécial : 50 jetons
  
  // Récupère ou crée le doc utilisateur
  let data = await Table7777Model.findOne({ userId, guildId });
  if (!data) {
    data = new Table7777Model({ userId, guildId });
  }
  
  // Ajoute le chiffre à la collection (si pas déjà présent)
  let newNumber = false;
  if (!data.collectedNumbers.includes(rolled)) {
    data.collectedNumbers.push(rolled);
    newNumber = true;
  }
  
  // Vérifie si spécial et l'ajoute à specialFound
  if (isSpecial && !data.specialFound.includes(rolled)) {
    data.specialFound.push(rolled);
  }
  
  // Vérifie les combos complétés
  let newCombo = null;
  for (const combo of COMBOS) {
    if (data.completedCombos.includes(combo.id)) continue; // Déjà complété
    const hasAll = combo.numbers.every(n => data.collectedNumbers.includes(n));
    if (hasAll) {
      data.completedCombos.push(combo.id);
      newCombo = combo;
      jetonsGained += 100; // Bonus combo
    }
  }
  
  // Met à jour les stats
  data.jetons += jetonsGained;
  data.weeklyJetons += jetonsGained;
  data.totalRolls += 1;
  data.weeklyRolls += 1;
  data.lastRoll = new Date();
  data.dailyRolls = (data.dailyRolls || 0) + 1;
  
  await data.save();
  
  return {
    number: rolled,
    isSpecial,
    newNumber,
    newCombo,
    jetonsGained,
    collection: {
      totalFound: data.collectedNumbers.length,
      specialFound: data.specialFound.length,
      combosCompleted: data.completedCombos.length,
      jetons: data.jetons,
    },
  };
}

/**
 * Récupère le classement global (top 10)
 */
async function getLeaderboard(guildId) {
  const top = await Table7777Model
    .find({ guildId })
    .sort({ jetons: -1 })
    .limit(10)
    .select('userId jetons specialFound completedCombos');
  
  return top;
}

/**
 * Récupère le classement hebdomadaire
 */
async function getWeeklyLeaderboard(guildId) {
  const top = await Table7777Model
    .find({ guildId })
    .sort({ weeklyJetons: -1 })
    .limit(10)
    .select('userId weeklyJetons weeklyRolls specialFound');
  
  return top;
}

/**
 * Réinitialise le classement hebdomadaire (appelé via cron chaque lundi)
 */
async function resetWeeklyLeaderboard(guildId) {
  await Table7777Model.updateMany(
    { guildId },
    { 
      weeklyJetons: 0,
      weeklyRolls: 0,
    }
  );
}

/**
 * Récupère la collection d'un utilisateur
 */
async function getUserCollection(userId, guildId) {
  const data = await Table7777Model.findOne({ userId, guildId });
  if (!data) return null;
  
  return {
    userId,
    totalFound: data.collectedNumbers.length,
    specialFound: data.specialFound.length,
    completedCombos: data.completedCombos.map(id => COMBOS.find(c => c.id === id)),
    jetons: data.jetons,
    totalRolls: data.totalRolls,
  };
}

module.exports = {
  rollTable7777,
  getLeaderboard,
  getWeeklyLeaderboard,
  resetWeeklyLeaderboard,
  getUserCollection,
  SPECIAL_NUMBERS,
  COMBOS,
};
