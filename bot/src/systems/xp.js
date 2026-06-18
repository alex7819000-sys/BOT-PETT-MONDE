// src/systems/xp.js — helper addXP appelé par animation.js (boost)
'use strict';
const User = require('../db/models/User');

async function addXP(userId, guildId, amount) {
  if (!amount || amount <= 0) return;
  await User.findOneAndUpdate(
    { userId, guildId },
    { $inc: { xp: amount, totalXp: amount, weekXp: amount } },
    { upsert: true }
  );
}

module.exports = { addXP };
