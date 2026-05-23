// src/db/models/DailyStats.js — Stats quotidiennes du serveur
'use strict';
const { Schema, model } = require('mongoose');

const dailyStatsSchema = new Schema({
  guildId:      { type: String, required: true },
  date:         { type: String, required: true },  // "YYYY-MM-DD"
  messageCount: { type: Number, default: 0 },
  uniqueUsers:  { type: [String], default: [] },   // userIds distincts du jour
}, { timestamps: false });

dailyStatsSchema.index({ guildId: 1, date: 1 }, { unique: true });

module.exports = model('DailyStats', dailyStatsSchema);
