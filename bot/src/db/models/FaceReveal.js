'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: String,
  messageId: String, // ID du message avec l'image
  threadId: String, // ID du thread créé
  imageUrl: String,
  authorId: String, // Qui a posté (peut être anonyme)
  authorName: String, // Nom affiché
  smashCount: { type: Number, default: 0 },
  passCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  winnerAnnounced: { type: Boolean, default: false }, // Si c'est le gagnant du jour annoncé
}, { timestamps: true });

schema.index({ guildId: 1, createdAt: -1 });
schema.index({ guildId: 1, smashCount: -1 });

module.exports = mongoose.models.FaceReveal || mongoose.model('FaceReveal', schema);
