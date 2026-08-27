'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: String,
  messageId: String,
  channelId: String,
  type: { type: String, default: 'sop' }, // sop, quiz
  subject: { name: String, image: String, source: String },
  smashes: [String],
  passes: [String],
  expiresAt: Date,
}, { timestamps: true });
schema.index({ guildId: 1, messageId: 1 });
module.exports = mongoose.models.Vote || mongoose.model('Vote', schema);
