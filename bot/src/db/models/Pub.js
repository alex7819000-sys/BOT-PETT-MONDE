// src/db/models/Pub.js — Pubs planifiées (catalogue admin)
'use strict';
const mongoose = require('mongoose');

const pubSchema = new mongoose.Schema({
  guildId:         { type: String, required: true },
  pubId:           { type: String, required: true },  // uuid court
  title:           { type: String, default: '' },
  text:            { type: String, required: true },
  link:            { type: String, default: null },
  imageUrl:        { type: String, default: null },
  channels:        { type: [String], default: ['ALL'] },
  scheduleType:    { type: String, default: 'interval' }, // 'interval' | 'daily'
  intervalMinutes: { type: Number, default: 60 },
  dailyHour:       { type: Number, default: 20 },
  active:          { type: Boolean, default: true },
  lastSent:        { type: Date, default: null },
}, { timestamps: true });

pubSchema.index({ guildId: 1, pubId: 1 }, { unique: true });
module.exports = mongoose.models.Pub || mongoose.model('Pub', pubSchema);
