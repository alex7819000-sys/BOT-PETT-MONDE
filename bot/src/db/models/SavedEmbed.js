'use strict';
const mongoose = require('mongoose');

const SavedEmbedSchema = new mongoose.Schema({
  guildId:     { type: String, required: true },
  name:        { type: String, default: 'Sans nom' },
  channelId:   { type: String, default: '' },
  content:     { type: String, default: '' },        // texte au-dessus de l'embed (pings, intro...)
  color:       { type: String, default: '#e2c97e' },
  author:      { type: String, default: '' },
  authorIcon:  { type: String, default: '' },
  authorUrl:   { type: String, default: '' },
  title:       { type: String, default: '' },
  titleUrl:    { type: String, default: '' },
  description: { type: String, default: '' },
  image:       { type: String, default: '' },
  thumbnail:   { type: String, default: '' },
  footer:      { type: String, default: '' },
  footerIcon:  { type: String, default: '' },
  timestamp:   { type: Boolean, default: false },
  fields:      [{ name: String, value: String, inline: Boolean }],
  buttons:     [{ label: String, emoji: String, style: String, url: String, action: String }],
  // Dernier message posté avec cet embed (permet de le MODIFIER au lieu d'en reposter un)
  messageId:   { type: String, default: '' },
  messageChannelId: { type: String, default: '' },
}, { timestamps: true });

SavedEmbedSchema.index({ guildId: 1, createdAt: -1 });
module.exports = mongoose.models.SavedEmbed || mongoose.model('SavedEmbed', SavedEmbedSchema);
