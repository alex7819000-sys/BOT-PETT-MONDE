// src/db/models/TicketBlock.js — Membres bloqués des tickets / compteur de tickets "spam" (v109)
'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId:  { type: String, required: true },
  strikes: { type: Number, default: 0 },      // tickets fermés avec le motif « Spam »
  blocked: { type: Boolean, default: false }, // ne peut plus ouvrir de ticket
  reason:  { type: String, default: '' },
  blockedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.TicketBlock || mongoose.model('TicketBlock', schema);
