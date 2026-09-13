// src/db/models/Ticket.js
'use strict';
const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  type:      { type: String, default: 'support' },
  channelId: { type: String, required: true },
  status:    { type: String, default: 'open', enum: ['open', 'closed'] },
  claimedBy: { type: String, default: null },
  closedBy:  { type: String, default: null },
  closedAt:  { type: Date,   default: null },
}, { timestamps: true });

ticketSchema.index({ guildId: 1, status: 1 });
ticketSchema.index({ guildId: 1, userId: 1, type: 1, status: 1 });

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
