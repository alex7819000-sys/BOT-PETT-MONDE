// src/db/models/User.js
'use strict';
const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  userId:        { type: String, required: true },
  guildId:       { type: String, required: true },
  // XP
  xp:            { type: Number, default: 0 },    // XP semaine en cours
  totalXp:       { type: Number, default: 0 },    // XP total all-time
  level:         { type: Number, default: 0 },
  lastMessage:   { type: Date,   default: null },
  // King
  crownCount:    { type: Number, default: 0 },
  isKing:        { type: Boolean, default: false },
  // Guerre animale
  team:          { type: String, enum: ['dog', 'cat', null], default: null },
  teamXp:        { type: Number, default: 0 },
  // Guilde
  guildeId:      { type: String, default: null },
  xpBoostUntil:  { type: Date,   default: null }, // x2 XP guilde dominante
  podiumBoostUntil: { type: Date, default: null }, // +0.5x XP podium 2e/3e place
  // Singe
  isMonkey:      { type: Boolean, default: false },
  monkeyFaults:  { type: Number, default: 0 },
  monkeyWeek:    { type: Number, default: 0 },    // numéro de semaine où il est singe
  // Bump
  bumpCount:     { type: Number, default: 0 },
  bumpWeek:      { type: Number, default: 0 },    // bumps semaine en cours
  // Quiz
  quizScore:     { type: Number, default: 0 },
  quizWins:      { type: Number, default: 0 },
  otakuLevel:    { type: String, default: 'none' },
  // Semaine
  weekXp:        { type: Number, default: 0 },    // XP gagné cette semaine (pour King)
  weekNumber:    { type: Number, default: 0 },    // numéro de semaine courante
  weekYear:      { type: Number, default: 0 },    // année de la semaine courante
}, {
  timestamps: true,
  indexes: [{ userId: 1, guildId: 1 }, { unique: true }],
});

userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = model('User', userSchema);
