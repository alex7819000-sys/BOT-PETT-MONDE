// src/db/connect.js — Connexion MongoDB unique via Mongoose
'use strict';

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI manquant — impossible de démarrer');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, {
      dbName: 'petit-monde',
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅  [MONGO] Connecté à MongoDB Atlas — base : petit-monde');

    mongoose.connection.on('error', err => console.error('[MONGO] Erreur:', err.message));
    mongoose.connection.on('disconnected', () => {
      console.warn('[MONGO] Déconnecté — reconnexion automatique...');
    });
  } catch (err) {
    console.error('❌  [MONGO] Connexion échouée:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
