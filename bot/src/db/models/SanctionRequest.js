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

  requestedTier:  { type: String, enum: ['warn', 'mute', 'voiceban', 'chatban', 'kick', 'ban'], default: null },
  chosenTier:     { type: String, enum: ['warn', 'mute', 'voiceban', 'chatban', 'kick', 'ban'], default: null },
  penaltyDurationMs: { type: Number, default: null },

  // draft = en cours de création par le signaleur (pas encore posté au staff)
  // pending = posté, en attente de validation
  // approved / rejected = traité
  status:         { type: String, enum: ['draft', 'pending', 'approved', 'rejected'], default: 'draft' },
  validatedBy:    { type: String, default: null },
  validatedAt:    { type: Date, default: null },

  messageId:      { type: String, default: null }, // message de la demande dans le salon staff
  channelId:      { type: String, default: null },
}, { timestamps: true });

schema.index({ guildId: 1, status: 1 });
schema.index({ guildId: 1, targetId: 1 });

module.exports = model('SanctionRequest', schema);
