// src/db/models/StaffTicket.js
'use strict';
const { Schema, model } = require('mongoose');

const staffTicketSchema = new Schema({
  guildId:       { type: String, required: true },
  userId:        { type: String, required: true },   // candidat
  channelId:     { type: String, required: true },   // salon ticket
  roleWanted:    { type: String, enum: ['moderateur', 'animateur', 'technicien'], required: true },

  // Fiche candidature
  answers: {
    age:           { type: String, default: null },
    experience:    { type: String, default: null },
    disponibilite: { type: String, default: null },
    motivation:    { type: String, default: null },
    competences:   { type: String, default: null },  // technicien
    idees:         { type: String, default: null },  // animateur
  },

  // Stats auto-collectées
  stats: {
    messageCount:  { type: Number, default: 0 },
    weekXp:        { type: Number, default: 0 },
    totalXp:       { type: Number, default: 0 },
    level:         { type: Number, default: 0 },
    joinedAt:      { type: Date,   default: null },
    warnCount:     { type: Number, default: 0 },
    isMonkey:      { type: Boolean, default: false },
    hasPresentation: { type: Boolean, default: false },
  },

  // Gestion
  status:        { type: String, enum: ['pending', 'taken', 'trial', 'accepted', 'refused', 'waiting'], default: 'pending' },
  takenBy:       { type: String, default: null },   // staff qui a pris en charge
  parrainId:     { type: String, default: null },   // staff parrain
  trialStartAt:  { type: Date,   default: null },
  trialEndAt:    { type: Date,   default: null },
  refuseReason:  { type: String, default: null },
}, { timestamps: true });

staffTicketSchema.index({ guildId: 1, userId: 1 });
staffTicketSchema.index({ guildId: 1, status: 1 });

module.exports = model('StaffTicket', staffTicketSchema);
