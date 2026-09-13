// dashboard/middleware/auth.js
'use strict';
const discordApi = require('../lib/discordApi');

function ensureAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

const SUPER_ADMINS = (process.env.DASHBOARD_SUPER_ADMIN_IDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

async function ensureGuildAccess(req, res, next) {
  try {
    const { guildId } = req.params;
    const isSuperAdmin = SUPER_ADMINS.includes(req.session.user.id);

    if (!isSuperAdmin) {
      const guilds = req.session.guilds || [];
      const summary = guilds.find((g) => g.id === guildId);
      if (!summary || !discordApi.isGuildAdmin(summary)) {
        return res.status(403).render('pages/error', {
          title: 'Accès refusé',
          message: "Tu n'as pas les droits d'administrateur sur ce serveur.",
        });
      }
    }

    const botGuilds = await discordApi.getBotGuilds();
    if (!botGuilds.find((g) => g.id === guildId)) {
      return res.status(404).render('pages/error', {
        title: 'Bot absent',
        message: "King Bot n'est pas présent sur ce serveur.",
      });
    }

    req.guildId = guildId;
    next();
  } catch (err) {
    console.error('[ensureGuildAccess]', err.message);
    res.status(500).render('pages/error', { title: 'Erreur', message: 'Impossible de vérifier les accès au serveur.' });
  }
}

module.exports = { ensureAuth, ensureGuildAccess };
