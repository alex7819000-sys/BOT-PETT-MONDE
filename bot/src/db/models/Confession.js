// db/models/Confession.js — Confessions anonymes avec révélation différée + classement permanent
'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: String,
  number: { type: Number },  // numéro global de la confession (#1, #2, ...)
  title: String,            // titre optionnel donné par l'auteur
  messageId: String,       // ID du message embed posté dans le salon
  threadId: String,        // ID du forum/thread créé pour cette confession
  channelId: String,       // salon où le message a été posté (pour le retrouver)
  text: String,
  authorId: String,        // qui a écrit la confession — connu du bot dès le départ
  authorName: String,      // username au moment de l'envoi (fallback si le membre quitte)

  reactionCount: { type: Number, default: 0 }, // total toutes réactions confondues
  isRevealed: { type: Boolean, default: false }, // le nom a déjà été révélé publiquement ?
  revealAt: Date,          // moment programmé de la révélation (createdAt + délai configuré)

  xpAwardedDays: { type: Number, default: 0 }, // nombre de jours où l'auteur a déjà touché l'XP top10
                                                 // (juste pour stats/debug, pas utilisé pour le calcul)
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ guildId: 1, reactionCount: -1 });
schema.index({ isRevealed: 1, revealAt: 1 });

module.exports = mongoose.models.Confession || mongoose.model('Confession', schema);
