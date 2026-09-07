// src/config/env.js — Validation des variables d'environnement au démarrage
'use strict';

const REQUIRED = ['DISCORD_TOKEN', 'GUILD_ID', 'KING_ROLE_ID', 'ANNOUNCE_CHANNEL_ID', 'MONGODB_URI'];

function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('❌  Variables manquantes dans .env :', missing.join(', '));
    process.exit(1);
  }
  console.log('✅  Variables d\'environnement validées');
}

module.exports = { validateEnv };
