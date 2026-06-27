// src/db/models/Election.js — Vote final singe & couple
'use strict';
const { Schema, model } = require('mongoose');

const electionSchema = new Schema({
  guildId:    { type: String, required: true },
  type:       { type: String, required: true },  // 'singe' | 'couple'
  phase:      { type: String, default: 'vote' }, // 'vote' | 'closed'
  candidates: [{
    key:      String,        // userId ou "userId1-userId2" pour couple
    userId:   String,
    userId2:  String,
    nominations: Number,
    votes:    [String],      // userIds qui ont voté pour ce candidat
  }],
  winners:    { type: [String], default: [] },
  messageId:  String,
  channelId:  String,
  week:       Number,
  year:       Number,
  active:     { type: Boolean, default: true },
}, { timestamps: true });

electionSchema.index({ guildId: 1, type: 1, active: 1 });
module.exports = model('Election', electionSchema);
