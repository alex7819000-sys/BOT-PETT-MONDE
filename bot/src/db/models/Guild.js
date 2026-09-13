// src/db/models/Guild.js
'use strict';
const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  nom:       { type: String, required: true },
  emoji:     { type: String, default: '⚔️' },
  couleur:   { type: String, default: '#5865F2' },
  xp:        { type: Number, default: 0 },
  membres:   [{ type: String }],
  chefId:    { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

guildSchema.index({ guildId: 1, nom: 1 }, { unique: true });

module.exports = mongoose.models.Guild || mongoose.model('Guild', guildSchema);
