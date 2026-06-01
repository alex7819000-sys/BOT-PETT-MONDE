// src/db/models/Guilde.js
'use strict';
const { Schema, model } = require('mongoose');

const guildeSchema = new Schema({
  guildId:        { type: String, required: true },
  guildeId:       { type: String, required: true },  // slug unique
  name:           { type: String, required: true },
  emoji:          { type: String, default: '🏰' },
  description:    { type: String, default: '' },
  leaderId:       { type: String, required: true },
  members:        { type: [String], default: [] },
  // XP
  totalXp:        { type: Number, default: 0 },
  weekXp:         { type: Number, default: 0 },
  victories:      { type: Number, default: 0 },
  // Discord
  roleId:         { type: String, default: null },
  channelId:      { type: String, default: null },
  color:          { type: Number, default: 0x7C4DFF },
  isDominant:     { type: Boolean, default: false },
  dominantUntil:  { type: Date,   default: null },
  // Duel
  duelActive:      { type: Boolean, default: false },
  duelChallengerId:{ type: String, default: null },
  duelStartDate:   { type: Date,   default: null },
  duelEndDate:     { type: Date,   default: null },
  duelScore:       { type: Number, default: 0 },
  challengerScore: { type: Number, default: 0 },
  active:         { type: Boolean, default: true },
}, { timestamps: true });

guildeSchema.index({ guildId: 1, guildeId: 1 }, { unique: true });
module.exports = model('Guilde', guildeSchema);
