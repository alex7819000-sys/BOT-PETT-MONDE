// src/db/models/Nomination.js — Nominations singe & couple
'use strict';
const { Schema, model } = require('mongoose');

const nomSchema = new Schema({
  guildId:     { type: String, required: true },
  type:        { type: String, required: true },  // 'singe' | 'couple'
  nominatorId: { type: String, required: true },
  targetId:    { type: String, required: true },
  target2Id:   { type: String, default: null },   // pour couple uniquement
  week:        { type: Number, required: true },  // ISO week number
  year:        { type: Number, required: true },
}, { timestamps: true });

nomSchema.index({ guildId: 1, type: 1, nominatorId: 1, week: 1, year: 1 }, { unique: true });
module.exports = model('Nomination', nomSchema);
