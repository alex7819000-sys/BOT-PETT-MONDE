'use strict';
const { Schema, model } = require('mongoose');

const giveawaySchema = new Schema({
  guildId:      { type: String, required: true },
  channelId:    { type: String, required: true },
  messageId:    { type: String, default: null },
  prize:        { type: String, required: true },
  winnerCount:  { type: Number, default: 1 },
  endsAt:       { type: Date, required: true },
  ended:        { type: Boolean, default: false },
  winners:      { type: [String], default: [] },
  // participants: userId → tickets
  participants: { type: Map, of: Number, default: {} },
  hostedBy:     { type: String, default: null },
}, { timestamps: true });

module.exports = model('Giveaway', giveawaySchema);
