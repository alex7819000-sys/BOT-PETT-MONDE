// dashboard/routes/auth.js
'use strict';
const express = require('express');
const router = express.Router();
const discordApi = require('../lib/discordApi');

router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DASHBOARD_CLIENT_ID,
    redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/login?error=annule');

  try {
    const tokens = await discordApi.exchangeCode(code);
    const user = await discordApi.getUser(tokens.access_token);
    const guilds = await discordApi.getUserGuilds(tokens.access_token);

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: discordApi.avatarUrl(user),
    };
    req.session.guilds = guilds;
    req.session.accessToken = tokens.access_token;

    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    res.redirect(returnTo || '/servers');
  } catch (err) {
    console.error('[auth/callback]', err.response?.data || err.message);
    res.redirect('/login?error=oauth');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
