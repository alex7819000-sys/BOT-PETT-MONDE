'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  guildId:    { type: String, required: true },
  name:       { type: String, required: true },       // ex: "Sigma"
  keyword:    { type: String, required: true },       // ex: "sigma" (lowercase)
  imageUrl:   { type: String, default: null },        // image postée à chaque trigger
  emoji:      { type: String, default: '⚔️' },
  points:     { type: Number, default: 0 },           // points semaine en cours
  totalWins:  { type: Number, default: 0 },           // victoires hebdo historiques
  isDefault:  { type: Boolean, default: false },      // true = chien/chat, indestructibles
  createdBy:  { type: String, default: null },        // userId du créateur
  lastActivity: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ guildId: 1, keyword: 1 }, { unique: true });
schema.index({ guildId: 1, points: -1 });

module.exports = mongoose.models.Faction || mongoose.model('Faction', schema);
