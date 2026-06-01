// src/db/models/Quiz.js — Questions + quiz actif du jour
'use strict';
const { Schema, model } = require('mongoose');

const activeQuizSchema = new Schema({
  guildId:   { type: String, required: true, unique: true },
  question:  String,
  answer:    String,
  options:   [String],
  anime:     String,
  imageUrl:  String,
  messageId: String,
  channelId: String,
  answered:  { type: Boolean, default: false },
  winnerId:  { type: String,  default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 12 * 3600 * 1000) },
}, { timestamps: true });

module.exports = model('ActiveQuiz', activeQuizSchema);
