// src/db/models/ChannelActivity.js — Compteur léger de messages par salon,
// pour savoir quels salons sont réellement utilisés (voir /stats salons).
'use strict';
const { Schema, model } = require('mongoose');

const schema = new Schema({
  guildId:      { type: String, required: true },
  channelId:    { type: String, required: true },
  messageCount: { type: Number, default: 0 },
  lastMessageAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ guildId: 1, channelId: 1 }, { unique: true });
schema.index({ guildId: 1, messageCount: -1 });

module.exports = model('ChannelActivity', schema);
