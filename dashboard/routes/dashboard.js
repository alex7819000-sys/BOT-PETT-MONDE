// dashboard/routes/dashboard.js — Toutes les pages de gestion d'un serveur
'use strict';
const express = require('express');
const router = express.Router({ mergeParams: true });
const discordApi = require('../lib/discordApi');
const { ensureAuth, ensureGuildAccess } = require('../middleware/auth');
const { GENERAL_GROUPS, OTHER_SYSTEMS_GROUPS, ALL_KEYS } = require('../lib/configFields');

const Config = require('../../bot/src/db/models/Config');
const Warn = require('../../bot/src/db/models/Warn');
const CountingError = require('../../bot/src/db/models/CountingError');
const User = require('../../bot/src/db/models/User');
const Ticket = require('../../bot/src/db/models/Ticket');
const Presentation = require('../../bot/src/db/models/Presentation');
const Pub = require('../../bot/src/db/models/Pub');
const StaffScore = require('../../bot/src/db/models/StaffScore');

router.use(ensureAuth, ensureGuildAccess);

// ─────────────────────────────────────────────
// Contexte commun injecté dans chaque page (nom du serveur, icône, nav active)
// ─────────────────────────────────────────────
router.use(async (req, res, next) => {
  try {
    const guild = await discordApi.getGuild(req.guildId);
    res.locals.guild = {
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
      memberCount: guild.approximate_member_count || 0,
      onlineCount: guild.approximate_presence_count || 0,
    };
    res.locals.user = req.session.user;
    res.locals.currentPath = req.path;
    next();
  } catch (err) {
    console.error('[dashboard ctx]', err.message);
    res.status(500).render('pages/error', { title: 'Erreur', message: 'Impossible de charger les informations du serveur Discord.' });
  }
});

// ─────────────────────────────────────────────
// Pseudos au lieu des identifiants à 18 chiffres (v103)
// Les tableaux (modération, tickets, XP, staff…) affichaient les ID bruts.
// Avant chaque rendu on repère les ID de membres présents dans les données, on les
// traduit via le cache du bot (ou une requête rapide), et les vues appellent who(id).
// ─────────────────────────────────────────────
const SNOWFLAKE = /^\d{17,20}$/;
const NAME_KEYS = new Set(['userId', 'moderatorId', 'claimedBy', 'closedBy', 'authorId', 'targetId', 'reporterId']);

function collectMemberIds(v, out, depth = 0) {
  if (!v || depth > 3 || out.size >= 150) return;
  if (Array.isArray(v)) { v.forEach((x) => collectMemberIds(x, out, depth + 1)); return; }
  if (typeof v !== 'object' || v instanceof Date || Buffer.isBuffer(v) || v._bsontype) return;
  for (const [k, val] of Object.entries(v)) {
    if (NAME_KEYS.has(k) && typeof val === 'string' && SNOWFLAKE.test(val)) out.add(val);
    else if (val && typeof val === 'object') collectMemberIds(val, out, depth + 1);
  }
}

async function resolveMemberNames(guildId, ids) {
  const names = {};
  const client = global.discordClient;
  if (!client || !ids.size) return names;
  const guild = client.guilds && client.guilds.cache && client.guilds.cache.get(guildId);
  const missing = [];
  for (const id of ids) {
    const m = guild && guild.members.cache.get(id);
    const u = (m && m.user) || (client.users && client.users.cache.get(id));
    const n = (m && m.displayName) || (u && (u.globalName || u.username));
    if (n) names[id] = n; else missing.push(id);
  }
  if (guild && missing.length) {
    try {
      const got = await Promise.race([
        guild.members.fetch({ user: missing.slice(0, 100) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
      ]);
      got.forEach((m) => { names[m.id] = m.displayName; });
    } catch { /* membre parti ou intent manquant : on affichera l'ID */ }
  }
  return names;
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

router.use((req, res, next) => {
  const origRender = res.render.bind(res);
  res.render = function (view, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    const opts = options || {};
    const ids = new Set();
    collectMemberIds(opts, ids);
    resolveMemberNames(req.guildId, ids).then((names) => {
      // who(id) → HTML sûr : pseudo (l'ID reste visible au survol), ou l'ID si inconnu
      opts.who = (id) => {
        if (id == null || id === '') return '—';
        const n = names[id];
        return n ? `<span title="${escHtml(id)}">${escHtml(n)}</span>` : escHtml(id);
      };
      origRender(view, opts, callback);
    }).catch(() => { opts.who = (id) => escHtml(id == null || id === '' ? '—' : id); origRender(view, opts, callback); });
  };
  next();
});

async function getSelectables(guildId) {
  const [channelsRaw, rolesRaw] = await Promise.all([
    discordApi.getGuildChannels(guildId),
    discordApi.getGuildRoles(guildId),
  ]);
  const T = discordApi.CHANNEL_TYPES;
  const textChannels = channelsRaw
    .filter((c) => [T.GUILD_TEXT, T.GUILD_NEWS, T.GUILD_FORUM].includes(c.type))
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, name: c.name, isForum: c.type === T.GUILD_FORUM }));
  const categories = channelsRaw
    .filter((c) => c.type === T.GUILD_CATEGORY)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, name: c.name }));
  const voiceChannels = channelsRaw
    .filter((c) => [T.GUILD_VOICE, T.GUILD_STAGE_VOICE].includes(c.type))
    .sort((a, b) => a.position - b.position)
    .map((c) => ({ id: c.id, name: c.name }));
  const roles = rolesRaw
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#99AAB5' }));
  return { textChannels, voiceChannels, categories, roles };
}

// ─────────────────────────────────────────────
// OVERVIEW — vue d'ensemble & stats
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const gid = req.guildId;
  const [cfg, totalUsers, warnsActive, ticketsOpen, topUsers, recentWarns, recentTickets, countingTop] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    User.countDocuments({ guildId: gid }),
    Warn.countDocuments({ guildId: gid, active: true }),
    Ticket.countDocuments({ guildId: gid, status: 'open' }),
    User.find({ guildId: gid }).sort({ totalXp: -1 }).limit(5).lean(),
    Warn.find({ guildId: gid }).sort({ createdAt: -1 }).limit(5).lean(),
    Ticket.find({ guildId: gid }).sort({ createdAt: -1 }).limit(5).lean(),
    CountingError.find({ guildId: gid }).sort({ errorCount: -1 }).limit(3).lean(),
  ]);

  const messagesToday = await User.aggregate([
    { $match: { guildId: gid } },
    { $group: { _id: null, total: { $sum: '$messagesDay' } } },
  ]);

  res.render('pages/overview', {
    cfg: cfg || {},
    totalUsers,
    warnsActive,
    ticketsOpen,
    topUsers,
    recentWarns,
    recentTickets,
    countingTop,
    messagesToday: messagesToday[0]?.total || 0,
  });
});

// ─────────────────────────────────────────────
// GÉNÉRAL — salons système, hiérarchie, rôles, paramètres
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// RÔLES AUTOMATIQUES
// ─────────────────────────────────────────────
router.get('/autoroles', async (req, res) => {
  const [cfg, selectables] = await Promise.all([
    Config.findOne({ guildId: req.guildId }).lean(),
    getSelectables(req.guildId),
  ]);
  res.render('pages/autoroles', { cfg: cfg || {}, roles: selectables.roles || [], saved: req.query.saved });
});

router.post('/autoroles', async (req, res) => {
  const gid = req.guildId;
  const b = req.body;
  const update = {};
  // Rôles à l'arrivée (multi)
  const joinRoleIds = [b.joinRole1, b.joinRole2, b.joinRole3].filter(Boolean);
  update.joinRoleIds = joinRoleIds;
  update.membreRoleId = b.membreRoleId || null;
  // Rôle vocal
  update.voiceRoleId = b.voiceRoleId || null;
  // Rôles spéciaux
  update.kingRoleId = b.kingRoleId || null;
  update.podiumTextChampionRoleId = b.podiumTextChampionRoleId || null;
  update.podiumVoiceChampionRoleId = b.podiumVoiceChampionRoleId || null;
  update.singeRoleId = b.singeRoleId || null;
  update.coupleRoleId = b.coupleRoleId || null;
  update.boostRoleId = b.boostRoleId || null;
  update.bumperRoleId = b.bumperRoleId || null;

  await Config.findOneAndUpdate({ guildId: gid }, update, { upsert: true });
  res.redirect(`/dashboard/${gid}/autoroles?saved=1`);
});


// ─────────────────────────────────────────────
// PINGS & NOTIFICATIONS
// ─────────────────────────────────────────────
router.get('/pings', async (req, res) => {
  const [cfg, selectables] = await Promise.all([
    Config.findOne({ guildId: req.guildId }).lean(),
    getSelectables(req.guildId),
  ]);
  res.render('pages/pings', { cfg: cfg || {}, roles: selectables.roles || [], saved: req.query.saved });
});

router.post('/pings', async (req, res) => {
  const gid = req.guildId;
  const { action, pingId } = req.body;

  if (action === 'toggle') {
    const val = req.body.onboardingEnabled === 'on';
    await Config.findOneAndUpdate({ guildId: gid }, { onboardingEnabled: val }, { upsert: true });
    return res.redirect(`/dashboard/${gid}/pings?saved=1`);
  }

  const cfg = await Config.findOne({ guildId: gid }) || new (require('../../bot/src/db/models/Config'))({ guildId: gid });
  let pings = cfg.pingRoles || [];

  if (action === 'delete') {
    pings = pings.filter(p => p.id !== pingId);
  } else if (action === 'save') {
    const entry = {
      id: pingId || Date.now().toString(36),
      label: req.body.label || 'Ping',
      emoji: req.body.emoji || '🔔',
      desc: req.body.desc || '',
      roleId: req.body.roleId || '',
    };
    const idx = pings.findIndex(p => p.id === entry.id);
    if (idx >= 0) pings[idx] = entry;
    else pings.push(entry);
  }

  await Config.findOneAndUpdate({ guildId: gid }, { pingRoles: pings }, { upsert: true });
  res.redirect(`/dashboard/${gid}/pings?saved=1`);
});

router.get('/general', async (req, res) => {
  const [cfg, selectables] = await Promise.all([
    Config.findOne({ guildId: req.guildId }).lean(),
    getSelectables(req.guildId),
  ]);
  res.render('pages/general', { cfg: cfg || {}, groups: GENERAL_GROUPS, ...selectables, saved: req.query.saved });
});

router.post('/general', async (req, res) => {
  const update = {};
  for (const key of ALL_KEYS) {
    if (key in req.body) update[key] = req.body[key] || null;
  }
  if (req.body.crownHour !== undefined) update.crownHour = Number(req.body.crownHour) || 20;
  if (req.body.animeIntervalHours !== undefined) update.animeIntervalHours = Number(req.body.animeIntervalHours) || 24;
  if (req.body.animalsIntervalHours !== undefined) update.animalsIntervalHours = Number(req.body.animalsIntervalHours) || 4;
  if (req.body.trialDays !== undefined) update.trialDays = Number(req.body.trialDays) || 14;
  if (req.body.pinStarThreshold !== undefined) update.pinStarThreshold = Number(req.body.pinStarThreshold) || 5;
  if (req.body.smashEmoji !== undefined) update.smashEmoji = req.body.smashEmoji || '🔥';
  if (req.body.passEmoji !== undefined) update.passEmoji = req.body.passEmoji || '💀';

  if (req.body.coOwnerIds !== undefined) {
    update.coOwnerIds = String(req.body.coOwnerIds).split(',').map((s) => s.trim()).filter(Boolean);
  }

  await Config.findOneAndUpdate({ guildId: req.guildId }, update, { upsert: true });
  res.redirect(`/dashboard/${req.guildId}/general?saved=1`);
});

// ─────────────────────────────────────────────
// AUTRES SYSTÈMES — tous les salons des mini-systèmes (confession, anime, défis, etc.)
// ─────────────────────────────────────────────
router.get('/systems', async (req, res) => {
  const [cfg, selectables] = await Promise.all([
    Config.findOne({ guildId: req.guildId }).lean(),
    getSelectables(req.guildId),
  ]);
  res.render('pages/systems', { cfg: cfg || {}, groups: OTHER_SYSTEMS_GROUPS, ...selectables, saved: req.query.saved });
});

router.post('/systems', async (req, res) => {
  const update = {};
  for (const key of ALL_KEYS) {
    if (key in req.body && key !== 'mediaChannelIds') update[key] = req.body[key] || null;
  }
  if (req.body.mediaChannelIds !== undefined) {
    const raw = Array.isArray(req.body.mediaChannelIds) ? req.body.mediaChannelIds : [req.body.mediaChannelIds];
    update.mediaChannelIds = raw.filter(Boolean);
  }
  await Config.findOneAndUpdate({ guildId: req.guildId }, update, { upsert: true });
  res.redirect(`/dashboard/${req.guildId}/systems?saved=1`);
});

// ─────────────────────────────────────────────
// MODÉRATION — warns + ban progressif counting
// ─────────────────────────────────────────────
router.get('/moderation', async (req, res) => {
  const gid = req.guildId;
  const [warns, offenders] = await Promise.all([
    Warn.find({ guildId: gid }).sort({ createdAt: -1 }).limit(50).lean(),
    CountingError.find({ guildId: gid }).sort({ errorCount: -1 }).limit(20).lean(),
  ]);
  const muteDurations = [
    { n: 1, label: '30 secondes', emoji: '🟡' },
    { n: 2, label: '2 minutes', emoji: '🟠' },
    { n: 3, label: '5 minutes', emoji: '🔴' },
    { n: 4, label: '15 minutes', emoji: '💢' },
    { n: 5, label: '30 minutes', emoji: '🚫' },
    { n: '6+', label: '1 heure', emoji: '💀' },
  ];
  res.render('pages/moderation', { warns, offenders, muteDurations, saved: req.query.saved });
});

router.post('/moderation/warns/:warnId/delete', async (req, res) => {
  await Warn.findOneAndUpdate(
    { _id: req.params.warnId, guildId: req.guildId },
    { active: false, deletedBy: `dashboard:${req.session.user.id}`, deletedAt: new Date() }
  );
  res.redirect(`/dashboard/${req.guildId}/moderation?saved=1`);
});

router.post('/moderation/counting/:userId/reset', async (req, res) => {
  await CountingError.findOneAndUpdate(
    { guildId: req.guildId, userId: req.params.userId },
    { errorCount: 0, muteActive: false, muteUntil: null, errorLog: [] }
  );
  res.redirect(`/dashboard/${req.guildId}/moderation?saved=1`);
});

// ─────────────────────────────────────────────
// XP & NIVEAUX
// ─────────────────────────────────────────────
router.get('/xp', async (req, res) => {
  const gid = req.guildId;
  const [cfg, leaderboard, selectables] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    User.find({ guildId: gid }).sort({ totalXp: -1 }).limit(50).lean(),
    getSelectables(gid),
  ]);
  res.render('pages/xp', {
    cfg: cfg || {},
    leaderboard,
    textChannels: selectables.textChannels,
    roles: selectables.roles || [],
    saved: req.query.saved
  });
});

// Ajouter une récompense de niveau
router.post('/xp/level-rewards/add', async (req, res) => {
  const gid = req.guildId;
  const level = parseInt(req.body.level, 10);
  const roleId = req.body.roleId;
  const stackable = req.body.stackable === 'true';
  if (!level || !roleId) return res.redirect(`/dashboard/${gid}/xp?saved=error`);
  const cfg = await Config.findOne({ guildId: gid });
  const arr = cfg?.levelRoles || [];
  // Remplacer si même niveau existe déjà
  const idx = arr.findIndex(r => r.level === level);
  if (idx >= 0) arr[idx] = { level, roleId, stackable };
  else arr.push({ level, roleId, stackable });
  arr.sort((a, b) => a.level - b.level);
  await Config.findOneAndUpdate({ guildId: gid }, { levelRoles: arr }, { upsert: true });
  res.redirect(`/dashboard/${gid}/xp?saved=1`);
});

// Supprimer une récompense de niveau
router.post('/xp/level-rewards/delete', async (req, res) => {
  const gid = req.guildId;
  const level = parseInt(req.body.level, 10);
  const cfg = await Config.findOne({ guildId: gid });
  const arr = (cfg?.levelRoles || []).filter(r => r.level !== level);
  await Config.findOneAndUpdate({ guildId: gid }, { levelRoles: arr }, { upsert: true });
  res.redirect(`/dashboard/${gid}/xp?saved=1`);
});

router.post('/xp/weekly-rewards/add', async (req, res) => {
  const gid = req.guildId;
  const level = parseInt(req.body.level, 10);
  const { roleId } = req.body;
  if (!level || !roleId) return res.redirect(`/dashboard/${gid}/xp?saved=0`);
  const cfg = await Config.findOne({ guildId: gid });
  const arr = (cfg?.weeklyLevelRoles || []).filter(r => r.level !== level);
  arr.push({ level, roleId });
  await Config.findOneAndUpdate({ guildId: gid }, { weeklyLevelRoles: arr }, { upsert: true });
  res.redirect(`/dashboard/${gid}/xp?saved=1`);
});

router.post('/xp/weekly-rewards/delete', async (req, res) => {
  const gid = req.guildId;
  const level = parseInt(req.body.level, 10);
  const cfg = await Config.findOne({ guildId: gid });
  const arr = (cfg?.weeklyLevelRoles || []).filter(r => r.level !== level);
  await Config.findOneAndUpdate({ guildId: gid }, { weeklyLevelRoles: arr }, { upsert: true });
  res.redirect(`/dashboard/${gid}/xp?saved=1`);
});

router.post('/xp', async (req, res) => {
  const b = req.body;
  const update = {};
  if (b.xpPerMessage !== undefined) update.xpPerMessage = Number(b.xpPerMessage) || 15;
  if (b.xpCooldown !== undefined) update.xpCooldown = Number(b.xpCooldown) || 60;
  if (b.rankChannelId !== undefined) update.rankChannelId = b.rankChannelId || null;
  if (b.levelUpChannelId !== undefined) update.levelUpChannelId = b.levelUpChannelId || null;
  if (b.bumpXpReward !== undefined) update.bumpXpReward = Number(b.bumpXpReward) || 500;
  if (b.bumpChannelId !== undefined) update.bumpChannelId = b.bumpChannelId || null;
  if (b.bumpEmbedTitle !== undefined) update.bumpEmbedTitle = b.bumpEmbedTitle || null;
  if (b.bumpEmbedDescription !== undefined) update.bumpEmbedDescription = b.bumpEmbedDescription || null;
  if (b.bumpEmbedColor !== undefined) update.bumpEmbedColor = b.bumpEmbedColor || null;
  if (b.bumpEmbedFooter !== undefined) update.bumpEmbedFooter = b.bumpEmbedFooter || null;
  if (b.bumpEmbedImageUrl !== undefined) update.bumpEmbedImageUrl = b.bumpEmbedImageUrl || null;
  if (b.bumpEmbedThumbnailUrl !== undefined) update.bumpEmbedThumbnailUrl = b.bumpEmbedThumbnailUrl || null;

  await Config.findOneAndUpdate({ guildId: req.guildId }, update, { upsert: true });
  res.redirect(`/dashboard/${req.guildId}/xp?saved=1`);
});

// ─────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────
router.get('/tickets', async (req, res) => {
  const gid = req.guildId;
  const [cfg, openTickets, closedTickets, selectables] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    Ticket.find({ guildId: gid, status: 'open' }).sort({ createdAt: -1 }).lean(),
    Ticket.find({ guildId: gid, status: 'closed' }).sort({ createdAt: -1 }).limit(30).lean(),
    getSelectables(gid),
  ]);
  res.render('pages/tickets', { cfg: cfg || {}, openTickets, closedTickets, categories: selectables.categories, saved: req.query.saved });
});

router.post('/tickets', async (req, res) => {
  await Config.findOneAndUpdate(
    { guildId: req.guildId },
    { ticketCategoryId: req.body.ticketCategoryId || null },
    { upsert: true }
  );
  res.redirect(`/dashboard/${req.guildId}/tickets?saved=1`);
});

// ─────────────────────────────────────────────
// COUNTING
// ─────────────────────────────────────────────
router.get('/counting', async (req, res) => {
  const gid = req.guildId;
  const [cfg, offenders, selectables] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    CountingError.find({ guildId: gid }).sort({ errorCount: -1 }).limit(20).lean(),
    getSelectables(gid),
  ]);
  res.render('pages/counting', { cfg: cfg || {}, offenders, textChannels: selectables.textChannels, saved: req.query.saved });
});

router.post('/counting', async (req, res) => {
  await Config.findOneAndUpdate(
    { guildId: req.guildId },
    { countingChannelId: req.body.countingChannelId || null },
    { upsert: true }
  );
  res.redirect(`/dashboard/${req.guildId}/counting?saved=1`);
});

router.post('/counting/reset-count', async (req, res) => {
  await Config.findOneAndUpdate(
    { guildId: req.guildId },
    { countingCurrent: 0, countingLastUserId: null },
    { upsert: true }
  );
  res.redirect(`/dashboard/${req.guildId}/counting?saved=1`);
});

// ─────────────────────────────────────────────
// PRÉSENTATIONS
// ─────────────────────────────────────────────
router.get('/presentations', async (req, res) => {
  const gid = req.guildId;
  const [cfg, done, inProgress, selectables] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    Presentation.countDocuments({ guildId: gid, forumPostId: { $ne: null } }),
    Presentation.find({ guildId: gid, forumPostId: null }).sort({ updatedAt: -1 }).limit(20).lean(),
    getSelectables(gid),
  ]);
  const forums = selectables.textChannels.filter((c) => c.isForum);
  res.render('pages/presentations', { cfg: cfg || {}, done, inProgress, forums, saved: req.query.saved });
});

router.post('/presentations', async (req, res) => {
  await Config.findOneAndUpdate(
    { guildId: req.guildId },
    { presentationForumId: req.body.presentationForumId || null },
    { upsert: true }
  );
  res.redirect(`/dashboard/${req.guildId}/presentations?saved=1`);
});

// ─────────────────────────────────────────────
// PUBS & PARTENARIATS
// ─────────────────────────────────────────────
router.get('/pubs', async (req, res) => {
  const gid = req.guildId;
  const [cfg, pubs] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    Pub.find({ guildId: gid }).sort({ createdAt: -1 }).lean(),
  ]);
  res.render('pages/pubs', { cfg: cfg || {}, pubs, saved: req.query.saved });
});

router.post('/pubs/:pubId/toggle', async (req, res) => {
  const pub = await Pub.findOne({ guildId: req.guildId, pubId: req.params.pubId });
  if (pub) {
    pub.active = !pub.active;
    await pub.save();
  }
  res.redirect(`/dashboard/${req.guildId}/pubs?saved=1`);
});

router.post('/pubs/:pubId/delete', async (req, res) => {
  await Pub.deleteOne({ guildId: req.guildId, pubId: req.params.pubId });
  res.redirect(`/dashboard/${req.guildId}/pubs?saved=1`);
});

router.post('/pubs/create', async (req, res) => {
  const pubId = Math.random().toString(36).slice(2, 8);
  await Pub.create({
    guildId: req.guildId,
    pubId,
    title: req.body.title || '',
    text: req.body.text,
    link: req.body.link || null,
    scheduleType: req.body.scheduleType || 'interval',
    intervalMinutes: Number(req.body.intervalMinutes) || 60,
    dailyHour: Number(req.body.dailyHour) || 20,
    active: true,
  });
  res.redirect(`/dashboard/${req.guildId}/pubs?saved=1`);
});


// ─────────────────────────────────────────────
// WELCOME — arrivées & départs
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TEST — Envoie un vrai message de test dans le salon choisi
// POST /dashboard/:guildId/test
// body: { type: 'short'|'card'|'bye', channelId }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  const gid = req.guildId;
  const { type, channelId } = req.body;

  if (!channelId) return res.json({ ok: false, error: 'Aucun salon sélectionné.' });

  try {
    const cfg = await Config.findOne({ guildId: gid }).lean() || {};
    const user = req.session.user || {};

    // Faux membre pour les variables
    const fakeUsername = user.username || 'Testeur';
    const fakeId       = user.id       || '123456789012345678';

    function fill(str) {
      return (str || '')
        .replace(/\{user\}/g,        `<@${fakeId}>`)
        .replace(/\{username\}/g,    fakeUsername)
        .replace(/\{server\}/g,      '[ TEST ]')
        .replace(/\{membercount\}/g, '999')
        .replace(/\{id\}/g,          fakeId);
    }

    // ── Message court ──────────────────────────────────────────────────────────
    if (type === 'short') {
      const text = fill(cfg.welcomeShortText) || `Bienvenue <@${fakeId}> ! Nous sommes désormais **999** membres. 🎉 *(test dashboard)*`;
      await discordApi.sendMessage(channelId, { content: text + '\n> 🧪 *Message de test — dashboard*' });
      return res.json({ ok: true, msg: 'Message court envoyé !' });
    }

    // ── Embed bienvenue ────────────────────────────────────────────────────────
    if (type === 'card') {
      const color = cfg.welcomeColor ? parseInt(cfg.welcomeColor.replace('#',''), 16) : 0x2ecc71;

      const embed = { color, fields: [] };

      if (cfg.welcomeAuthor) {
        embed.author = { name: fill(cfg.welcomeAuthor) };
        if (cfg.welcomeAuthorIcon) embed.author.icon_url = cfg.welcomeAuthorIcon;
        if (cfg.welcomeAuthorUrl)  embed.author.url      = cfg.welcomeAuthorUrl;
      }

      embed.title       = fill(cfg.welcomeTitle) || '🎉 Bienvenue sur [ TEST ] !';
      embed.description = fill(cfg.welcomeDesc)  || `Hey <@${fakeId}>, ceci est un test du dashboard ! 🧪`;

      if (cfg.welcomeFields && cfg.welcomeFields.length) {
        embed.fields = cfg.welcomeFields
          .filter(f => f.name || f.value)
          .map(f => ({ name: fill(f.name || '⠀'), value: fill(f.value || '⠀'), inline: !!f.inline }));
      }

      if (cfg.welcomeFooter) {
        embed.footer = { text: fill(cfg.welcomeFooter) };
        if (cfg.welcomeFooterIcon) embed.footer.icon_url = cfg.welcomeFooterIcon;
      }
      if (cfg.welcomeTimestamp) embed.timestamp = new Date().toISOString();

      const payload = { content: `<@${fakeId}> 🧪 *Test dashboard*`, embeds: [embed] };

      // Canvas welcome card si image configurée
      if (cfg.welcomeImage) {
        try {
          const { generateWelcomeCard } = require('../../bot/src/systems/welcomeCard');
          // Fake member object pour le canvas
          const fakeMember = {
            user: {
              username: fakeUsername,
              id: fakeId,
              displayAvatarURL: () => user.avatar
                ? `https://cdn.discordapp.com/avatars/${fakeId}/${user.avatar}.png?size=256`
                : `https://cdn.discordapp.com/embed/avatars/0.png`,
            },
            guild: { name: '[ TEST ]', memberCount: 999 },
          };
          const buf = await generateWelcomeCard(fakeMember, cfg.welcomeImage, cfg.welcomeColor || '#a855f7');
          // Envoie via multipart form-data
          const FormData = (await import('node:stream')).Transform; // not needed, use manual multipart
          // Utilise l'API Discord directement avec buffer
          const axios = require('axios');
          const form = new (require('form-data'))();
          form.append('payload_json', JSON.stringify(payload), { contentType: 'application/json' });
          form.append('files[0]', buf, { filename: 'welcome.png', contentType: 'image/png' });
          // Met l'image comme attachment dans l'embed
          payload.embeds[0].image = { url: 'attachment://welcome.png' };
          form.append('payload_json', JSON.stringify(payload), { contentType: 'application/json' });
          await axios.post(`https://discord.com/api/v10/channels/${channelId}/messages`, form, {
            headers: { ...form.getHeaders(), Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
          });
          return res.json({ ok: true, msg: 'Embed envoyé avec l\'image canvas !' });
        } catch(canvasErr) {
          embed.image = { url: cfg.welcomeImage };
          // fallback sans canvas
        }
      }

      await discordApi.sendMessage(channelId, payload);
      return res.json({ ok: true, msg: 'Embed de bienvenue envoyé !' });
    }

    // ── Message au revoir ──────────────────────────────────────────────────────
    if (type === 'bye') {
      const color = cfg.byeColor ? parseInt(cfg.byeColor.replace('#',''), 16) : 0xe74c3c;
      const desc  = fill(cfg.byeDesc) || `${fakeUsername} a quitté le serveur. On est désormais **999** membres.`;
      await discordApi.sendMessage(channelId, {
        content: '> 🧪 *Test au revoir — dashboard*',
        embeds: [{ color, description: desc }],
      });
      return res.json({ ok: true, msg: 'Message d\'au revoir envoyé !' });
    }

    res.json({ ok: false, error: 'Type inconnu.' });
  } catch (err) {
    console.error('Test send error:', err?.response?.data || err.message);
    res.json({ ok: false, error: err?.response?.data?.message || err.message || 'Erreur inconnue' });
  }
});

router.get('/welcome', async (req, res) => {
  const gid = req.guildId;
  const [cfg, { textChannels }, guildEmojis] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    getSelectables(gid),
    discordApi.getGuildEmojis(gid).catch(() => []),
  ]);
  res.render('pages/welcome', { cfg: cfg || {}, textChannels, guildEmojis: guildEmojis || [], saved: req.query.saved === '1' });
});

router.post('/welcome', async (req, res) => {
  const gid = req.guildId;
  const { section } = req.body;
  const update = {};
  if (section === 'short') {
    update.welcomeChannelId = req.body.welcomeChannelId || '';
    update.welcomeShortText = req.body.welcomeShortText || '';
  }
  if (section === 'card') {
    update.welcomeCardEnabled    = req.body.welcomeCardEnabled === '1';
    update.welcomeCardChannelId  = req.body.welcomeCardChannelId || '';
    update.welcomeColor          = req.body.welcomeColor || '#2ecc71';
    update.welcomeTitle          = req.body.welcomeTitle || '';
    update.welcomeDesc           = req.body.welcomeDesc || '';
    update.welcomeImage          = req.body.welcomeImage || '';
    update.welcomeAuthor         = req.body.welcomeAuthor || '';
    update.welcomeAuthorIcon     = req.body.welcomeAuthorIcon || '';
    update.welcomeAuthorUrl      = req.body.welcomeAuthorUrl || '';
    update.welcomeThumbnail      = req.body.welcomeThumbnail || 'avatar';
    update.welcomeThumbnailUrl   = req.body.welcomeThumbnailUrl || '';
    update.welcomeFooter         = req.body.welcomeFooter || '';
    update.welcomeFooterIcon     = req.body.welcomeFooterIcon || '';
    update.welcomeTimestamp      = req.body.welcomeTimestamp === 'on';
    try {
      update.welcomeFields = JSON.parse(req.body.welcomeFields || '[]');
    } catch { update.welcomeFields = []; }
  }
  if (section === 'bye_toggle') {
    // l'interrupteur enregistre seul l'activation (avant, décocher ne changeait rien en base)
    update.byeEnabled = req.body.byeEnabled === '1';
  }
  if (section === 'bye') {
    update.byeChannelId = req.body.byeChannelId || '';
    update.byeColor     = req.body.byeColor || '#e74c3c';
    update.byeDesc      = req.body.byeDesc || '';
  }
  if (section === 'interactive') {
    // Configuration du welcome interactif
    update.welcomeInteractiveEnabled = req.body.welcomeInteractiveEnabled === 'on';
    update.welcomeEmbedEmoji = req.body.welcomeEmbedEmoji || '⭐';
    update.welcomeEmbedTitle = req.body.welcomeEmbedTitle || 'Bienvenue sur {server}!';
    update.welcomeEmbedDesc = req.body.welcomeEmbedDesc || 'Hey {user}! 👋';
  }
  if (section === 'add_interactive_section') {
    // Ajouter une section au welcome interactif
    const cfg = await Config.findOne({ guildId: gid });
    const sections = cfg?.welcomeSections || [];
    
    // Générer un ID unique
    let id = req.body.sectionTitle.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
    let counter = 1;
    while (sections.some(s => s.id === id)) {
      id = id + '-' + counter;
      counter++;
    }

    sections.push({
      id,
      emoji: req.body.sectionEmoji || '❓',
      title: req.body.sectionTitle,
      description: req.body.sectionDesc,
    });

    update.welcomeSections = sections;
  }
  if (section === 'delete_interactive_section') {
    // Supprimer une section
    const cfg = await Config.findOne({ guildId: gid });
    const sections = (cfg?.welcomeSections || []).filter(s => s.id !== req.body.sectionId);
    update.welcomeSections = sections;
  }
  await Config.findOneAndUpdate({ guildId: gid }, { $set: update }, { upsert: true });
  res.redirect(`/dashboard/${gid}/welcome?saved=1`);
});

// ─────────────────────────────────────────────
// REGLEMENT — Système de règlement style Etherya
// ─────────────────────────────────────────────
router.get('/reglement', async (req, res) => {
  const gid = req.guildId;
  const [cfg, { textChannels }, guildEmojis] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    getSelectables(gid),
  ]);
  res.render('pages/reglement', { cfg: cfg || {}, textChannels, saved: req.query.saved === '1' });
});

router.post('/reglement', async (req, res) => {
  const gid = req.guildId;
  const { action } = req.body;
  const update = {};

  if (action === 'general') {
    // Configuration générale du règlement
    update.reglementEnabled = req.body.reglementEnabled === 'on';
    update.reglementChannelId = req.body.reglementChannelId || '';
    update.reglementColor = req.body.reglementColor || '#2ecc71';
    update.reglementImage = req.body.reglementImage || '';
  } else if (action === 'add_section') {
    // Ajouter une nouvelle section
    const cfg = await Config.findOne({ guildId: gid });
    const sections = cfg?.reglementSections || [];
    
    // Générer un ID unique basé sur le titre
    let id = req.body.title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
    let counter = 1;
    while (sections.some(s => s.id === id)) {
      id = id + '-' + counter;
      counter++;
    }

    sections.push({
      id,
      title: req.body.title,
      emoji: req.body.emoji || '📋',
      description: req.body.description,
    });

    update.reglementSections = sections;
  } else if (action === 'edit_section') {
    // Éditer une section existante
    const cfg = await Config.findOne({ guildId: gid });
    const sections = cfg?.reglementSections || [];
    const sectionId = req.body.sectionId;
    
    const sectionIdx = sections.findIndex(s => s.id === sectionId);
    if (sectionIdx >= 0) {
      sections[sectionIdx] = {
        id: sectionId,
        title: req.body.title,
        emoji: req.body.emoji || '📋',
        description: req.body.description,
      };
    }

    update.reglementSections = sections;
  } else if (action === 'delete_section') {
    // Supprimer une section
    const cfg = await Config.findOne({ guildId: gid });
    const sections = (cfg?.reglementSections || []).filter(s => s.id !== req.body.sectionId);
    update.reglementSections = sections;
  } else if (action === 'post') {
    // Poster le règlement dans le salon
    const cfg = await Config.findOne({ guildId: gid });
    if (cfg?.reglementEnabled && cfg?.reglementChannelId) {
      const { postReglement } = require('../../bot/src/systems/reglement');
      try {
        // Créer une interaction fake pour postReglement
        const client = global.discordClient;
        const guild = await client.guilds.fetch(gid);
        const member = guild.members.cache.get(req.user.id);
        
        if (member) {
          const fakeInteraction = {
            guild,
            user: member.user,
            deferReply: async (opts) => ({}),
            editReply: async (msg) => console.log('[Reglement] Posted:', msg),
          };
          await postReglement(fakeInteraction);
        }
      } catch (err) {
        console.error('Error posting reglement:', err);
      }
    }
  }

  await Config.findOneAndUpdate({ guildId: gid }, { $set: update }, { upsert: true });
  res.redirect(`/dashboard/${gid}/reglement?saved=1`);
});

// ─────────────────────────────────────────────
// EMBEDS — créateur de messages/embeds (refonte v102)
// ─────────────────────────────────────────────
const SavedEmbed = require('../../bot/src/db/models/SavedEmbed');
const embedSender = require('../lib/embedSender');

router.get('/embeds', async (req, res) => {
  const gid = req.guildId;
  const [{ textChannels }, savedEmbeds] = await Promise.all([
    getSelectables(gid),
    SavedEmbed.find({ guildId: gid }).sort({ createdAt: -1 }).lean(),
  ]);
  const botUser = global.discordClient && global.discordClient.user;
  res.render('pages/embeds', {
    textChannels, savedEmbeds,
    saved: req.query.saved === '1',
    flashOk: typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : '',
    flashError: typeof req.query.err === 'string' ? req.query.err.slice(0, 600) : '',
    botName: botUser ? botUser.username : 'BOT HERA',
    botAvatar: botUser ? botUser.displayAvatarURL({ size: 64 }) : '',
    limits: embedSender.LIMITS,
  });
});

// JSON.parse sans risque de planter la page si le champ est vide/corrompu
function parseList(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

router.post('/embeds', async (req, res) => {
  const gid = req.guildId;
  const b = req.body;
  const back = (kind, msg) => res.redirect(`/dashboard/${gid}/embeds?${kind}=${encodeURIComponent(msg)}`);

  if (b.section === 'delete' && b.embedId) {
    await SavedEmbed.deleteOne({ _id: b.embedId, guildId: gid });
    return back('ok', 'Embed supprimé de la liste (le message déjà posté sur Discord reste en place).');
  }

  // Renvoyer un embed sauvegardé (nouveau message) dans le salon choisi
  if (b.section === 'resend' && b.embedId) {
    const emb = await SavedEmbed.findOne({ _id: b.embedId, guildId: gid }).lean();
    if (!emb) return back('err', 'Cet embed n\'existe plus.');
    const r = await embedSender.sendOrEdit(global.discordClient, gid, emb, 'send', { channelId: b.targetChannel || emb.channelId });
    if (!r.ok) return back('err', r.error);
    await SavedEmbed.updateOne({ _id: emb._id }, { messageId: r.messageId, messageChannelId: r.channelId });
    return back('ok', 'Message envoyé ✅');
  }

  const data = {
    guildId: gid,
    name: (b.embedName || '').trim().slice(0, 80) || 'Sans nom',
    channelId: b.embedChannelId || '',
    content: b.embedContent || '',
    color: b.embedColor || '#e2c97e',
    author: b.embedAuthor || '', authorIcon: b.embedAuthorIcon || '', authorUrl: b.embedAuthorUrl || '',
    title: b.embedTitle || '', titleUrl: b.embedTitleUrl || '',
    description: b.embedDesc || '', image: b.embedImage || '', thumbnail: b.embedThumb || '',
    footer: b.embedFooter || '', footerIcon: b.embedFooterIcon || '',
    timestamp: b.embedTimestamp === 'on',
    fields: parseList(b.fieldsData).map((f) => ({ name: String(f.name || ''), value: String(f.value || ''), inline: !!f.inline })),
    buttons: parseList(b.buttonsData).map((x) => ({
      label: String(x.label || ''), emoji: String(x.emoji || ''), style: String(x.style || 'primary'),
      url: String(x.url || ''), action: String(x.action || 'link'),
    })),
  };

  // Sauvegarde (toujours, même si l'envoi échoue ensuite : on ne perd pas le travail)
  let doc;
  if (b.embedId) {
    doc = await SavedEmbed.findOneAndUpdate({ _id: b.embedId, guildId: gid }, data, { new: true });
  }
  if (!doc) doc = await SavedEmbed.create(data);

  if (b.action === 'send' || b.action === 'edit') {
    const mode = b.action === 'edit' ? 'edit' : 'send';
    const r = await embedSender.sendOrEdit(global.discordClient, gid, doc.toObject(), mode, { channelId: data.channelId });
    if (!r.ok) return back('err', `Sauvegardé, mais pas envoyé : ${r.error}`);
    await SavedEmbed.updateOne({ _id: doc._id }, { messageId: r.messageId, messageChannelId: r.channelId });
    return back('ok', mode === 'edit' ? 'Message modifié sur Discord ✅' : 'Message envoyé sur Discord ✅');
  }
  return back('ok', 'Embed sauvegardé ✅');
});

// ─────────────────────────────────────────────
// STAFF — classement King Staff
// ─────────────────────────────────────────────
router.get('/staff', async (req, res) => {
  const gid = req.guildId;
  const [weekly, allTime] = await Promise.all([
    StaffScore.find({ guildId: gid }).sort({ weekScore: -1 }).limit(20).lean(),
    StaffScore.find({ guildId: gid }).sort({ totalScore: -1 }).limit(20).lean(),
  ]);
  res.render('pages/staff', { weekly, allTime });
});

// ─────────────────────────────────────────────
// VOCAL — Ghost Bot, salons temporaires, King du Vocal
// ─────────────────────────────────────────────
router.get('/vocal', async (req, res) => {
  const gid = req.guildId;
  const [cfg, selectables] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    getSelectables(gid),
  ]);
  res.render('pages/vocal', {
    cfg: cfg || {},
    textChannels: selectables.textChannels,
    voiceChannels: selectables.voiceChannels,
    categories: selectables.categories,
    roles: selectables.roles,
    saved: req.query.saved,
  });
});

router.post('/vocal', async (req, res) => {
  const gid = req.guildId;
  const b = req.body;

  const ghostBot = require('../../bot/src/systems/ghostBot');
  const cfg = await Config.findOneAndUpdate(
    { guildId: gid },
    {
      ghostBotChannelId: b.ghostBotChannelId || null,
      tempVoiceEnabled: b.tempVoiceEnabled === '1',
      tempVoiceCreateChannelId: b.tempVoiceCreateChannelId || null,
      tempVoiceCategoryId: b.tempVoiceCategoryId || null,
      tempVoiceNameTemplate: b.tempVoiceNameTemplate || '🎙️ {username}',
      tempVoiceMaxUsers: parseInt(b.tempVoiceMaxUsers) || 0,
      voiceKingEnabled: b.voiceKingEnabled === '1',
      voiceKingRoleId: b.voiceKingRoleId || null,
      voiceKingChannelId: b.voiceKingChannelId || null,
    },
    { upsert: true, new: true }
  );

  // Mettre à jour le ghostBot en live (pas besoin de redémarrer)
  try {
    const client = global.discordClient;
    if (client) {
      if (b.ghostBotChannelId) {
        ghostBot.joinGhost(client, gid, b.ghostBotChannelId).catch(() => {});
      } else {
        ghostBot.leaveGhost(gid);
      }
    }
  } catch { /* ignore si client pas dispo */ }

  res.redirect(`/dashboard/${gid}/vocal?saved=1`);
});

module.exports = router;
