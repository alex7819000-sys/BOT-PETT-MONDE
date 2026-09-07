// src/db/models/Quest.js — Quêtes à XP : quotidiennes, manuelles, urgentes (premier à X), événementielles (concours)
'use strict';
const mongoose = require('mongoose');

const questSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  questId: { type: String, required: true }, // ex: "qst_a1b2c3"

  type: { type: String, enum: ['daily', 'urgent', 'event', 'contest'], default: 'daily' },
  title: String,
  description: String,
  xpReward: { type: Number, default: 100 },
  // Récompense bonus XP (rôle temporaire) — si null, récompense = XP uniquement
  bonusReward: {
    percent: { type: Number, default: null },  // 25, 50, ou 100
    durationHours: { type: Number, default: 24 }, // durée du bonus en heures
  },
  kakera: { type: Number, default: 0 }, // kakera Mudae en récompense (0 = aucun)

  // Condition de complétion
  kind: {
    type: String,
    enum: ['messages_channel', 'messages_total', 'bump', 'vocal_minutes', 'reactions_given', 'first_to_messages', 'contest_reactions', 'manual'],
    default: 'messages_channel',
  },
  channelId: String,   // salon concerné (messages_channel, contest)
  target: { type: Number, default: 1 }, // ex: 100 messages, 20 minutes vocal...

  // Progression par membre (clé = userId, valeur = compteur)
  progress: { type: Map, of: Number, default: {} },
  completedBy: [{ type: String }], // userIds ayant complété (quêtes normales : plusieurs gagnants possibles)
  winnerUserId: String,            // pour urgent (premier à X) et contest (meilleure réaction)

  contestChannelId: String,        // salon dédié auto-créé pour les quêtes "contest"

  active: { type: Boolean, default: true },
  startsAt: { type: Date, default: Date.now },
  endsAt: Date,                    // null = dure jusqu'au prochain reset d'XP hebdo

  createdBy: { type: String, default: 'bot' }, // 'bot' (auto-générée) ou l'ID du modo/admin
}, { timestamps: true });

module.exports = mongoose.model('Quest', questSchema);
