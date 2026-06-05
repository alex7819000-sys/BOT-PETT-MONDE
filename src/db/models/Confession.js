// src/db/models/Confession.js — v5 simplifié (anonyme ou non, sans suspects)
'use strict';
const { Schema, model } = require('mongoose');

const confSchema = new Schema({
  guildId:   { type: String, required: true },
  authorId:  { type: String, required: true },
  title:     { type: String, default: '' },    // titre optionnel
  text:      { type: String, required: true },
  anonymous: { type: Boolean, default: true }, // true = Identité protégée
  messageId: String,
  channelId: String,
}, { timestamps: true });

module.exports = model('Confession', confSchema);
