// src/db/models/Presentation.js — Stocke le WIP d'une présentation
'use strict';
const { Schema, model } = require('mongoose');

const presentationSchema = new Schema({
  userId:  { type: String, required: true },
  guildId: { type: String, required: true },

  // Étape actuelle (1, 2, 3, 'done')
  step: { type: Number, default: 1 },

  // Étape 1 — Identité
  prenom:      { type: String, default: '' },
  age:         { type: String, default: '' },
  genre:       { type: String, default: '' },
  origine:     { type: String, default: '' },
  orientation: { type: String, default: '' },

  // Étape 2 — Apparence & Personnalité
  taille:     { type: String, default: '' },
  yeux:       { type: String, default: '' },
  cheveux:    { type: String, default: '' },
  style:      { type: String, default: '' },
  positifs:   { type: String, default: '' },
  negatifs:   { type: String, default: '' },

  // Étape 3 — Préférences & Goûts
  couleur:    { type: String, default: '' },
  musique:    { type: String, default: '' },
  nourriture: { type: String, default: '' },
  anime:      { type: String, default: '' },
  persoF:     { type: String, default: '' },
  persoM:     { type: String, default: '' },
  aime:       { type: String, default: '' },
  deteste:    { type: String, default: '' },

  // ID du post forum créé (si terminé)
  forumPostId: { type: String, default: null },

  // Pour reprendre : dernière interaction ephemeral dans le serveur
  lastServeurChannelId: { type: String, default: null },
}, { timestamps: true });

presentationSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = model('Presentation', presentationSchema);
