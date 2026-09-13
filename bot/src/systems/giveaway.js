// src/systems/giveaway.js — Giveaway (bouton participer)
'use strict';
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Modèle léger inline (évite un fichier de plus)
const gSchema = new mongoose.Schema({
  guildId: String, channelId: String, messageId: String,
  prize: String, winnersCount: { type: Number, default: 1 },
  hostId: String, endsAt: Date, ended: { type: Boolean, default: false },
  participants: [String],
}, { timestamps: true });
const Giveaway = mongoose.models.Giveaway || mongoose.model('Giveaway', gSchema);

async function handleEnter(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;
  const gid = interaction.guild.id;

  const gw = await Giveaway.findOne({ guildId: gid, messageId: interaction.message.id });
  if (!gw)    return interaction.editReply({ content: '❌ Giveaway introuvable.' });
  if (gw.ended) return interaction.editReply({ content: '⏰ Ce giveaway est terminé !' });
  if (gw.endsAt && gw.endsAt < new Date()) return interaction.editReply({ content: '⏰ Ce giveaway est terminé !' });

  if (gw.participants.includes(uid)) {
    gw.participants = gw.participants.filter(id => id !== uid);
    await gw.save();
    return interaction.editReply({ content: '🚪 Tu t\'es retiré du giveaway.' });
  }

  gw.participants.push(uid);
  await gw.save();
  return interaction.editReply({ content: `🎉 Tu participes au giveaway ! (**${gw.participants.length}** participant(s))` });
}

async function createGiveaway(data) {
  return Giveaway.create(data);
}

async function endGiveaway(guildId, messageId) {
  const gw = await Giveaway.findOne({ guildId, messageId });
  if (!gw || gw.ended) return null;
  gw.ended = true;
  await gw.save();
  if (!gw.participants.length) return { gw, winners: [] };
  const shuffled = [...gw.participants].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(gw.winnersCount, shuffled.length));
  return { gw, winners };
}

module.exports = { handleEnter, createGiveaway, endGiveaway, Giveaway };
