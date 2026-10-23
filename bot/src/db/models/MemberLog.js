// src/db/models/MemberLog.js — un enregistrement par arrivée sur le serveur.
// Permet de calculer la croissance (joins/leaves par période) et de savoir
// qui a invité qui (+ si l'invité est resté ou reparti).
'use strict';
const { Schema, model } = require('mongoose');

const schema = new Schema({
  guildId:    { type: String, required: true },
  userId:     { type: String, required: true },
  joinedAt:   { type: Date, default: Date.now },
  leftAt:     { type: Date, default: null },     // rempli quand le membre repart

  inviteCode: { type: String, default: null },   // code de l'invitation utilisée
  inviterId:  { type: String, default: null },   // qui a créé cette invitation
  inviteType: { type: String, enum: ['normal', 'vanity', 'unknown'], default: 'unknown' },
}, { timestamps: true });

schema.index({ guildId: 1, userId: 1 });
schema.index({ guildId: 1, inviterId: 1 });
schema.index({ guildId: 1, joinedAt: 1 });
schema.index({ guildId: 1, leftAt: 1 });

module.exports = model('MemberLog', schema);
