// src/db/models/Warn.js
'use strict';
const { Schema, model } = require('mongoose');

const warnSchema = new Schema({
  // Identifiants
  guildId:      { type: String, required: true },
  userId:       { type: String, required: true },   // membre sanctionné
  moderatorId:  { type: String, required: true },   // qui a validé la sanction
  reporterId:   { type: String, default: null },    // qui a signalé (peut être différent du validateur)
  // Contenu
  reason:       { type: String, required: true },
  warnNumber:   { type: Number, required: true },   // ex: 3e warn du membre
  tier:         { type: String, enum: ['warn', 'mute', 'voiceban', 'chatban', 'kick', 'ban'], default: 'warn' },
  proofImageUrl:{ type: String, default: null },    // preuve (capture d'écran)
  proofText:    { type: String, default: null },    // preuve (texte/lien)
  penaltyDurationMs: { type: Number, default: null }, // durée si tier === mute/voiceban/chatban
  penaltyExpiresAt:  { type: Date, default: null },   // à quel moment retirer le rôle (voiceban/chatban)
  penaltyLifted:     { type: Boolean, default: false }, // rôle déjà retiré par le cron ?
  // Statut
  active:       { type: Boolean, default: true },   // false = supprimé
  deletedBy:    { type: String, default: null },    // qui a supprimé
  deletedAt:    { type: Date,   default: null },
}, { timestamps: true });

warnSchema.index({ guildId: 1, userId: 1 });
warnSchema.index({ guildId: 1, userId: 1, active: 1 });

module.exports = model('Warn', warnSchema);
