// dashboard/routes/servers.js
'use strict';
const express = require('express');
const router = express.Router();
const discordApi = require('../lib/discordApi');
const { ensureAuth } = require('../middleware/auth');

router.get('/servers', ensureAuth, async (req, res) => {
  try {
    const userGuilds = req.session.guilds || [];
    const botGuilds = await discordApi.getBotGuilds();
    const botGuildIds = new Set(botGuilds.map((g) => g.id));

    const SUPER_ADMINS = (process.env.DASHBOARD_SUPER_ADMIN_IDS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const isSuperAdmin = SUPER_ADMINS.includes(req.session.user.id);

    const managed = [];
    const other = [];

    for (const g of userGuilds) {
      const hasBot = botGuildIds.has(g.id);
      const isAdmin = isSuperAdmin || discordApi.isGuildAdmin(g);
      const entry = {
        id: g.id,
        name: g.name,
        icon: discordApi.iconUrl(g),
        hasBot,
        isAdmin,
      };
      if (hasBot && isAdmin) managed.push(entry);
      else other.push(entry);
    }

    res.render('pages/servers', { managed, other });
  } catch (err) {
    console.error('[servers]', err.message);
    res.status(500).render('pages/error', { title: 'Erreur', message: 'Impossible de charger la liste des serveurs.' });
  }
});

module.exports = router;
