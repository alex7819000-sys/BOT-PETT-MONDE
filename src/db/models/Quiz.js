// src/db/models/Quiz.js
'use strict';
const { Schema, model } = require('mongoose');

const activeQuizSchema = new Schema({
  guildId:    { type: String, required: true, unique: true },
  question:   String,
  answer:     String,
  options:    [String],
  anime:      String,
  imageUrl:   String,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  messageId:  String,
  channelId:  String,
  expiresAt:  { type: Date, default: () => new Date(Date.now() + 24 * 3600 * 1000) },
  // Qui a déjà répondu (bonne ou mauvaise) — une seule tentative
  answered:   { type: [String], default: [] }, // userIds ayant répondu
  correct:    { type: [String], default: [] }, // userIds ayant eu bon
  closed:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = model('ActiveQuiz', activeQuizSchema);
