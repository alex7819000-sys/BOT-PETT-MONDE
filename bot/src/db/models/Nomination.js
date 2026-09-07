'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: String, nominatorId: String, targetId: String,
  type: String, week: Number, year: Number,
}, { timestamps: true });
module.exports = mongoose.models.Nomination || mongoose.model('Nomination', schema);
