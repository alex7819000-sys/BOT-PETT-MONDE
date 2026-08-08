// src/db/models/SanctionRequest.js — file d'attente des signalements avec preuve,
// en attente de validation par le staff (ou refus).
'use strict';
const { Schema, model } = require('mongoose');

const schema = new Schema({
  guildId:        { type: String, required: true },
  targetId:       { type: String, required: true },   // membre visé
  reporterId:     { type: String, required: true },   // qui a signalé
  reason:         { type: String, required: true },
  proofImageUrl:  { type: String, default: null },
  proofText:      { type: String, default: null },

  suggestedTier:  { type: String, enum: ['warn', 'mute', 'kick', 'ban'], required: true },
  chosenTier:     { type: String, enum: ['warn', 'mute', 'kick', 'ban'], default: null },
  muteDurationMs: { type: Number, default: null },

  status:         { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  validatedBy:    { type: String, default: null },
  validatedAt:    { type: Date, default: null },

  messageId:      { type: String, default: null }, // message de la demande (pour l'éditer après action)
  channelId:      { type: String, default: null },
}, { timestamps: true });

schema.index({ guildId: 1, status: 1 });
schema.index({ guildId: 1, targetId: 1 });

module.exports = model('SanctionRequest', schema);
