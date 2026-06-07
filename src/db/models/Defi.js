// src/db/models/Defi.js — Défis communautaires
'use strict';
const { Schema, model } = require('mongoose');

const defiSchema = new Schema({
  guildId:         { type: String, required: true },
  type:            { type: String, required: true }, // 'messages', 'bumps', 'invites', 'vocal', 'nioui', 'custom'
  title:           { type: String, required: true },
  description:     { type: String, required: true },
  target:          { type: Number, default: null },
  rewardXp:        { type: Number, default: 0 },
  rewardKakera:    { type: Number, default: 0 },
  rewardRoleId:    { type: String, default: null },
  startAt:         { type: Date, required: true },
  endAt:           { type: Date, required: true },
  ended:           { type: Boolean, default: false },
  messageId:       { type: String, default: null },
  participants:    { type: Map, of: Number, default: {} }, // userId → progression (pour nioui: 1=encore en jeu)
  winners:         { type: [String], default: [] },
  hostedBy:        { type: String, default: null },
  isKingChallenge: { type: Boolean, default: false }, // 👑 King Challenge hebdo
  doubleXp:        { type: Boolean, default: false },  // 🟢 quête verte
}, { timestamps: true });

module.exports = model('Defi', defiSchema);
