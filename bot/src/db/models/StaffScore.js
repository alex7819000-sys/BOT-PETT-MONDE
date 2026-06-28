// src/db/models/StaffScore.js
'use strict';
const { Schema, model } = require('mongoose');

const staffScoreSchema = new Schema({
  guildId:    { type: String, required: true },
  userId:     { type: String, required: true },
  // Semaine
  weekNumber: { type: Number, default: 0 },
  weekYear:   { type: Number, default: 0 },
  // Points hebdo
  weekScore:  { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 }, // all-time
  // Détail des actions
  ticketsTraited:      { type: Number, default: 0 },
  warnsGiven:          { type: Number, default: 0 },
  candidaturesTraited: { type: Number, default: 0 },
  stagiairesValidated: { type: Number, default: 0 },
  messagesStaff:       { type: Number, default: 0 },
  fastResponses:       { type: Number, default: 0 }, // réponse ticket < 30min
  inactivityPenalty:   { type: Number, default: 0 },
  // Satisfaction membres
  satisfactionTotal:   { type: Number, default: 0 },
  satisfactionCount:   { type: Number, default: 0 },
  // Inactivité
  lastActionAt:        { type: Date, default: null },
  inactivityWarned:    { type: Boolean, default: false },
  inactivityWarnedAt:  { type: Date, default: null },
  // Grade all-time
  grade: { type: String, enum: ['stagiaire', 'junior', 'confirme', 'senior', 'elite'], default: 'stagiaire' },
  gradeXp: { type: Number, default: 0 },
  // King of staff
  isKingStaff:    { type: Boolean, default: false },
  kingStaffCount: { type: Number, default: 0 },
}, { timestamps: true });

staffScoreSchema.index({ guildId: 1, userId: 1 }, { unique: true });
staffScoreSchema.index({ guildId: 1, weekScore: -1 });

module.exports = model('StaffScore', staffScoreSchema);
