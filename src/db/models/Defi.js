// src/db/models/Defi.js — Défis communautaires
'use strict';
const { Schema, model } = require('mongoose');

const defiSchema = new Schema({
  guildId:      { type: String, required: true },
  type:         { type: String, required: true }, // 'messages', 'bumps', 'invites', 'vocal', 'custom'
  title:        { type: String, required: true },
  description:  { type: String, required: true },
  target:       { type: Number, default: null },   // objectif numérique
  rewardXp:     { type: Number, default: 0 },
  rewardKakera: { type: Number, default: 0 },      // kakera Mudae ($give via bot)
  rewardRoleId: { type: String, default: null },
  startAt:      { type: Date, required: true },
  endAt:        { type: Date, required: true },
  ended:        { type: Boolean, default: false },
  messageId:    { type: String, default: null },   // message embed dans le salon
  participants: { type: Map, of: Number, default: {} }, // userId → progression
  winners:      { type: [String], default: [] },
  hostedBy:     { type: String, default: null },
}, { timestamps: true });

module.exports = model('Defi', defiSchema);
