// src/systems/xp.js — Petit helper générique pour créditer/débiter de l'XP
// directement (hors gain normal message/vocal). Utilisé par systems/singe.js
// pour la pénalité -100 XP en cas de trop de fautes "singe".
'use strict';
const User = require('../db/models/User');

/**
 * Ajoute (ou retire, si amount est négatif) de l'XP à un membre.
 * Impacte xp/totalXp/weekXp/dailyXp en même temps, comme toutes les autres
 * sources d'XP du bot (message, vocal, bump, confession, quête...).
 */
async function addXP(userId, guildId, amount) {
  return User.findOneAndUpdate(
    { userId, guildId },
    { $inc: { xp: amount, totalXp: amount, weekXp: amount, dailyXp: amount } },
    { upsert: true, new: true }
  );
}

module.exports = { addXP };
