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
  update.roiDuJourRoleId = b.roiDuJourRoleId || null;
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
router.get('/welcome', async (req, res) => {
  const gid = req.guildId;
  const [cfg, { textChannels }] = await Promise.all([
    Config.findOne({ guildId: gid }).lean(),
    getSelectables(gid),
  ]);
  res.render('pages/welcome', { cfg: cfg || {}, textChannels, saved: req.query.saved === '1' });
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
    update.welcomeCardEnabled   = req.body.welcomeCardEnabled === '1';
    update.welcomeCardChannelId = req.body.welcomeCardChannelId || '';
    update.welcomeColor         = req.body.welcomeColor || '#2ecc71';
    update.welcomeTitle         = req.body.welcomeTitle || '';
    update.welcomeDesc          = req.body.welcomeDesc || '';
    update.welcomeImage         = req.body.welcomeImage || '';
  }
  if (section === 'bye') {
    update.byeEnabled   = req.body.byeEnabled === '1';
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
  const [cfg, { textChannels }] = await Promise.all([
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
// EMBEDS — créateur de messages/embeds
// ─────────────────────────────────────────────
const SavedEmbed = require('../../bot/src/db/models/SavedEmbed');

router.get('/embeds', async (req, res) => {
  const gid = req.guildId;
  const [{ textChannels }, savedEmbeds] = await Promise.all([
    getSelectables(gid),
    SavedEmbed.find({ guildId: gid }).sort({ createdAt: -1 }).lean(),
  ]);
  res.render('pages/embeds', { textChannels, savedEmbeds, saved: req.query.saved === '1' });
});

router.post('/embeds', async (req, res) => {
  const gid = req.guildId;
  const { section, action, embedId, embedName, embedChannelId, embedColor,
          embedAuthor, embedTitle, embedDesc, embedImage, embedThumb,
          embedFooter, embedFooterIcon, fieldsData, buttonsData, targetChannel } = req.body;

  if (section === 'delete' && embedId) {
    await SavedEmbed.deleteOne({ _id: embedId, guildId: gid });
    return res.redirect(`/dashboard/${gid}/embeds?saved=1`);
  }
  if (section === 'resend' && embedId) {
    const emb = await SavedEmbed.findOne({ _id: embedId, guildId: gid }).lean();
    if (emb) await sendEmbedToChannel(gid, targetChannel || emb.channelId, emb);
    return res.redirect(`/dashboard/${gid}/embeds?saved=1`);
  }

  const fields  = JSON.parse(fieldsData  || '[]');
  const buttons = JSON.parse(buttonsData || '[]');
  const data = {
    guildId: gid, name: embedName || 'Sans nom', channelId: embedChannelId || '',
    color: embedColor || '#e2c97e', author: embedAuthor || '', title: embedTitle || '',
    description: embedDesc || '', image: embedImage || '', thumbnail: embedThumb || '',
    footer: embedFooter || '', footerIcon: embedFooterIcon || '', fields, buttons,
  };

  if (embedId) {
    await SavedEmbed.findOneAndUpdate({ _id: embedId, guildId: gid }, data);
  } else {
    await SavedEmbed.create(data);
  }

  if (action === 'send' && embedChannelId) {
    await sendEmbedToChannel(gid, embedChannelId, data);
  }
  res.redirect(`/dashboard/${gid}/embeds?saved=1`);
});

async function sendEmbedToChannel(guildId, channelId, data) {
  try {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const client = global.discordClient;
    if (!client) return;
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;
    const color = data.color ? parseInt(data.color.replace('#',''), 16) : 0xe2c97e;
    const embed = new EmbedBuilder().setColor(color);
    if (data.author)      embed.setAuthor({ name: data.author });
    if (data.title)       embed.setTitle(data.title);
    if (data.description) embed.setDescription(data.description);
    if (data.image)       embed.setImage(data.image);
    if (data.thumbnail)   embed.setThumbnail(data.thumbnail);
    if (data.footer)      embed.setFooter({ text: data.footer, iconURL: data.footerIcon || undefined });
    if (data.fields && data.fields.length) {
      embed.addFields(data.fields.map(f => ({ name: f.name||'\u200b', value: f.value||'\u200b', inline: !!f.inline })));
    }
    let components = [];
    if (data.buttons && data.buttons.length) {
      const styleMap = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger, link: ButtonStyle.Link };
      const row = new ActionRowBuilder();
      data.buttons.slice(0,5).forEach((b,i) => {
        const btn = new ButtonBuilder().setLabel(b.label||'Bouton').setStyle(styleMap[b.style]||ButtonStyle.Primary);
        if (b.style === 'link' && b.url) btn.setURL(b.url);
        else btn.setCustomId('embed_btn_'+i+'_'+Date.now());
        row.addComponents(btn);
      });
      components = [row];
    }
    await channel.send({ embeds: [embed], components });
  } catch (err) {
    console.error('[dashboard embeds] send error:', err.message);
  }
}

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
