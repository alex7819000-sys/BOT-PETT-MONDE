'use strict';
const mongoose = require('mongoose');

const SavedEmbedSchema = new mongoose.Schema({
  guildId:     { type: String, required: true },
  name:        { type: String, default: 'Sans nom' },
  channelId:   { type: String, default: '' },
  color:       { type: String, default: '#e2c97e' },
  author:      { type: String, default: '' },
  title:       { type: String, default: '' },
  description: { type: String, default: '' },
  image:       { type: String, default: '' },
  thumbnail:   { type: String, default: '' },
  footer:      { type: String, default: '' },
  footerIcon:  { type: String, default: '' },
  fields:      [{ name: String, value: String, inline: Boolean }],
  buttons:     [{ label: String, style: String, url: String }],
}, { timestamps: true });

SavedEmbedSchema.index({ guildId: 1, createdAt: -1 });
module.exports = mongoose.models.SavedEmbed || mongoose.model('SavedEmbed', SavedEmbedSchema);
