// db/models/CountingError.js — Tracker les erreurs counting par user
'use strict';
const mongoose = require('mongoose');

const CountingErrorSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },

  // Nombre total d'erreurs du user sur ce serveur
  errorCount: { type: Number, default: 0 },

  // Liste des erreurs avec timestamps
  errorLog: [
    {
      timestamp: { type: Date, default: Date.now },
      expected: Number,
      given: Number,
      streakBroken: Number // Quel compte il a cassé
    }
  ],

  // Mutes/bans temporaires appliqués
  muteUntil: { type: Date, default: null },
  muteActive: { type: Boolean, default: false },

  // Quand le dernier mute s'est terminé (pour reset le compteur après cooldown)
  lastMuteEnded: { type: Date, default: null },

  weeklyFaults: { type: Number, default: 0 },

  // ── Stats du jour pour le classement counting (reset chaque minuit) ──
  dailyGood: { type: Number, default: 0 },       // bons chiffres postés aujourd'hui
  dailyFaults: { type: Number, default: 0 },      // fautes commises aujourd'hui (mauvais chiffre, bluff suivi, édition)
  dailyBluffsCaught: { type: Number, default: 0 }, // bluffs qu'il a démasqués (clic 🔍 réussi) aujourd'hui

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index pour requêtes rapides
CountingErrorSchema.index({ userId: 1, guildId: 1 });

module.exports = mongoose.model('CountingError', CountingErrorSchema);
