// src/db/models/Warn.js
'use strict';
const { Schema, model } = require('mongoose');

const warnSchema = new Schema({
  // Identifiants
  guildId:      { type: String, required: true },
  userId:       { type: String, required: true },   // membre warnée
  moderatorId:  { type: String, required: true },   // qui a warn
  // Contenu
  reason:       { type: String, required: true },
  warnNumber:   { type: Number, required: true },   // ex: 3e warn du membre
  // Statut
  active:       { type: Boolean, default: true },   // false = supprimé
  deletedBy:    { type: String, default: null },    // qui a supprimé
  deletedAt:    { type: Date,   default: null },
}, { timestamps: true });

warnSchema.index({ guildId: 1, userId: 1 });
warnSchema.index({ guildId: 1, userId: 1, active: 1 });

module.exports = model('Warn', warnSchema);
