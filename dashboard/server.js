// dashboard/server.js — Point d'entrée du dashboard web King Bot
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const REQUIRED = ['DISCORD_TOKEN', 'MONGODB_URI', 'DASHBOARD_CLIENT_ID', 'DASHBOARD_CLIENT_SECRET', 'DASHBOARD_REDIRECT_URI'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('❌  Variables manquantes pour le dashboard :', missing.join(', '));
  console.error('    → Remplis-les dans ton fichier .env (voir .env.example, section DASHBOARD).');
  process.exit(1);
}

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// ─────────────────────────────────────────────
// Vues & fichiers statiques
// ─────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─────────────────────────────────────────────
// Connexion MongoDB (réutilise la même base que le bot)
// ─────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅  Dashboard connecté à MongoDB'))
  .catch((err) => {
    console.error('❌  Connexion MongoDB échouée :', err.message);
    process.exit(1);
  });

// ─────────────────────────────────────────────
// Sessions (stockées en base, persistent après redémarrage)
// ─────────────────────────────────────────────
app.use(session({
  secret: process.env.DASHBOARD_SESSION_SECRET || 'king-bot-dashboard-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: 'dashboard_sessions' }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true }, // 7 jours
}));

// ─────────────────────────────────────────────
// Variables globales pour les vues
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.sessionUser = req.session.user || null;
  next();
});

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.get('/', (req, res) => res.redirect(req.session.user ? '/servers' : '/login'));
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/servers');
  res.render('pages/login', { error: req.query.error });
});
app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/servers'));
app.use('/dashboard/:guildId', require('./routes/dashboard'));

app.use((req, res) => {
  res.status(404).render('pages/error', { title: 'Page introuvable', message: "Cette page n'existe pas." });
});

app.use((err, req, res, next) => {
  console.error('[dashboard]', err);
  res.status(500).render('pages/error', { title: 'Erreur serveur', message: 'Une erreur inattendue est survenue.' });
});

app.listen(PORT, () => {
  console.log(`👑  Dashboard King Bot lancé sur http://localhost:${PORT}`);
});
