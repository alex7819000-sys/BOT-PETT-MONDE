// src/systems/xp.js — helper addXP appelé par animation.js (boost)
'use strict';
const User = require('../db/models/User');

async function addXP(userId, guildId, amount) {
  if (!amount) return;
  await User.findOneAndUpdate(
    { userId, guildId },
    { $inc: { xp: amount, totalXp: amount, weekXp: amount, dailyXp: amount } },
    { upsert: true }
  );
}

module.exports = { addXP };
