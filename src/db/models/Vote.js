// src/db/models/Vote.js — Smash or Pass sessions
'use strict';
const { Schema, model } = require('mongoose');

const voteSchema = new Schema({
  guildId:   { type: String, required: true },
  mode:      { type: String, required: true },  // anime-auto | anime-community | animals-auto | animals-community | face-reveal
  subject: {
    name:        String,
    imageUrl:    String,
    extra:       String,   // anime name, animal type, etc.
    submittedBy: String,   // userId si soumis par un membre
  },
  smashes:   { type: [String], default: [] },   // userIds
  passes:    { type: [String], default: [] },   // userIds
  messageId: String,
  channelId: String,
  threadId:  String,
  closed:    { type: Boolean, default: false },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 3600 * 1000) },
}, { timestamps: true });

voteSchema.index({ guildId: 1, mode: 1, closed: 1 });
module.exports = model('Vote', voteSchema);
