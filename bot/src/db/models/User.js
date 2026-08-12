'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: String, guildId: String,
  username: { type: String, default: '' },
  xp: { type: Number, default: 0 }, level: { type: Number, default: 1 },
  totalXp: { type: Number, default: 0 }, weekXp: { type: Number, default: 0 }, dailyXp: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 }, messagesDay: { type: Number, default: 0 },
  imagesDay: { type: Number, default: 0 },
  bumpCount: { type: Number, default: 0 }, bumpWeek: { type: Number, default: 0 }, bumpDay: { type: Number, default: 0 },
  bumpDisboard: { type: Number, default: 0 }, bumpTopgg: { type: Number, default: 0 }, bumpDBL: { type: Number, default: 0 }, bumpVoting: { type: Number, default: 0 },
  crownCount: { type: Number, default: 0 }, quizWins: { type: Number, default: 0 },
  team: { type: String, default: null }, teamXp: { type: Number, default: 0 },
  battleChienCount: { type: Number, default: 0 }, // nb de fois où le membre a écrit "chien" dans #bataille
  battleChatCount:  { type: Number, default: 0 }, // nb de fois où le membre a écrit "chat" dans #bataille
  vocalMinutes: { type: Number, default: 0 },
  vocalMinutesToday: { type: Number, default: 0 }, reactionsToday: { type: Number, default: 0 },
  invitesToday: { type: Number, default: 0 }, inviteCount: { type: Number, default: 0 },
  monkeyFaults: { type: Number, default: 0 }, dailyMissions: { type: Object, default: {} },
  isMonkey: { type: Boolean, default: false }, monkeyWeek: { type: Number, default: 0 },
  streakDays: { type: Number, default: 0 },
  lastMessageAt: Date,
  lastMessageDate: Date,
  countingChampionUntil: Date, // expiration du rôle bonus XP counting (+X% pendant 24h)
  voiceSessionStartedAt: Date, // début de la session vocale en cours (pour le bonus de fidélité progressif)
  dailyBonusClaimed: { type: Boolean, default: false },
  // Bonus XP temporaires cumulables (max 3 actifs en même temps)
  activeXpBonuses: [{
    percent: Number,       // 25, 50, ou 100
    expiresAt: Date,       // quand le bonus expire
    addedAt: Date,         // quand il a été gagné
  }],
}, { timestamps: true });
schema.index({ guildId: 1, totalXp: -1 });
schema.index({ guildId: 1, weekXp: -1 });
module.exports = mongoose.models.User || mongoose.model('User', schema);
