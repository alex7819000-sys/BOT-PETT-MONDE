'use strict';

const mongoose = require('mongoose');

// Chiffres spéciaux (ultra-rares dans la roulette)
const SPECIAL_NUMBERS = [
  12, 13, 15, 34, 67, 86, 147, 404, 666, 667, 696, 777, 993, 
  1789, 1998, 2018, 2019, 2077, 2209, 2222, 2410, 3630, 7777
];

// Combos — suites de chiffres à collectionner
const COMBOS = [
  { 
    id: 'ziak', 
    name: 'Ziak', 
    numbers: [75, 77, 78, 91, 92, 93, 94, 95],
    emoji: '🎮'
  },
  { 
    id: 'ww1', 
    name: 'Première Guerre mondiale', 
    numbers: [1914, 1918],
    emoji: '⚔️'
  },
  { 
    id: 'ww2', 
    name: 'Deuxième Guerre mondiale', 
    numbers: [1939, 1945],
    emoji: '⚔️'
  },
  { 
    id: 'fronts', 
    name: 'Sur tous les fronts', 
    numbers: [1998, 2018],
    emoji: '🌍'
  },
];

const schema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  
  // Collection globale
  collectedNumbers: [Number],           // Tous les chiffres uniques trouvés
  specialFound: [Number],               // Chiffres spéciaux trouvés (subset de collectedNumbers)
  completedCombos: [String],            // IDs des combos complétés (ex: ['ziak', 'ww1'])
  
  // Économie
  jetons: { type: Number, default: 0 }, // Points/jetons gagnés
  
  // Tracking
  totalRolls: { type: Number, default: 0 },
  lastRoll: Date,
  dailyRolls: { type: Number, default: 0 },
  lastDailyReset: Date,
  
  // Stats pour le classement
  weeklyJetons: { type: Number, default: 0 },
  weeklyRolls: { type: Number, default: 0 },
  
}, { timestamps: true });

schema.index({ guildId: 1, jetons: -1 });
schema.index({ guildId: 1, weeklyJetons: -1 });
schema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = {
  Table7777Model: mongoose.models.Table7777 || mongoose.model('Table7777', schema),
  SPECIAL_NUMBERS,
  COMBOS,
};
