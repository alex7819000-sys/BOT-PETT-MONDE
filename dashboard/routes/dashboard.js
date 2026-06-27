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
  const roles = rolesRaw
    .filter((r) => r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#99AAB5' }));
  return { textChannels, categories, roles };
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
  update.sassEnabled = req.body.sassEnabled === '1';
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
  res.render('pages/xp', { cfg: cfg || {}, leaderboard, textChannels: selectables.textChannels, saved: req.query.saved });
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

module.exports = router;
