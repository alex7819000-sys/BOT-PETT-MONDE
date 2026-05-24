// src/db/models/Confession.js
'use strict';
const { Schema, model } = require('mongoose');

const confSchema = new Schema({
  guildId:   { type: String, required: true },
  authorId:  { type: String, required: true },
  text:      { type: String, required: true },
  suspects:  { type: [String], required: true },   // 3-5 userId incluant l'auteur
  messageId: String,
  channelId: String,
  votes:     { type: Map, of: String, default: {} },  // voteurId -> suspectId
  revealed:  { type: Boolean, default: false },
  revealedTo:{ type: Boolean, default: false },        // l'auteur a appuyé sur révéler
  expiresAt: { type: Date, default: () => new Date(Date.now() + 48 * 3600 * 1000) },
}, { timestamps: true });

module.exports = model('Confession', confSchema);
