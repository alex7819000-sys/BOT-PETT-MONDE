// src/db/models/Partenariat.js
'use strict';
const { Schema, model } = require('mongoose');

const partenariatSchema = new Schema({
  guildId:        { type: String, required: true },   // guild hôte
  partnerGuildId: { type: String, default: null },    // guild partenaire (si dispo)
  // Infos du partenaire
  inviteUrl:      { type: String, required: true },   // lien d'invitation
  serverName:     { type: String, default: null },
  serverIcon:     { type: String, default: null },
  memberCount:    { type: Number, default: 0 },
  onlineCount:    { type: Number, default: 0 },
  description:    { type: String, default: null },
  bannerUrl:      { type: String, default: null },
  // Demande
  requestedBy:    { type: String, required: true },   // userId du demandeur
  offer:          { type: String, default: null },    // ce qu'ils proposent
  contactPseudo:  { type: String, default: null },    // pseudo contact
  // Gestion
  status:         { type: String, enum: ['pending', 'accepted', 'refused', 'cancelled'], default: 'pending' },
  ticketChannelId: { type: String, default: null },
  postedMessageId: { type: String, default: null },   // message dans #partenariats
  handledBy:      { type: String, default: null },
  refuseReason:   { type: String, default: null },
  // Stats
  partnerCount:   { type: Number, default: 0 },       // nb de partenariats du partenaire
}, { timestamps: true });

partenariatSchema.index({ guildId: 1, status: 1 });

module.exports = model('Partenariat', partenariatSchema);
