// src/systems/inviteTracker.js — Sait qui a invité qui, et garde l'historique
// des arrivées/départs pour calculer la croissance du serveur (jour/semaine/mois).
'use strict';

const MemberLog = require('../db/models/MemberLog');
const logger    = require('../utils/logger');

// guildId → Map<code, { uses, inviterId }>  — snapshot des invitations en mémoire
const cache = new Map();

// ── Charger/rafraîchir le cache d'un serveur ────────────────────────────────
async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    invites.forEach(inv => map.set(inv.code, { uses: inv.uses || 0, inviterId: inv.inviterId || inv.inviter?.id || null }));

    // Invitation "vanity" (URL personnalisée) — uniquement dispo si le serveur y a accès
    if (guild.features?.includes('VANITY_URL')) {
      const vanity = await guild.fetchVanityData().catch(() => null);
      if (vanity?.code) map.set(`vanity:${vanity.code}`, { uses: vanity.uses || 0, inviterId: null });
    }

    cache.set(guild.id, map);
  } catch (err) {
    logger.debug('InviteTracker', `Impossible de charger les invitations de ${guild.name}`, err?.message);
  }
}

async function cacheAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
  logger.info('InviteTracker', `Invitations mises en cache sur ${client.guilds.cache.size} serveur(s)`);
}

function onInviteCreate(invite) {
  const map = cache.get(invite.guild.id) || new Map();
  map.set(invite.code, { uses: invite.uses || 0, inviterId: invite.inviterId || invite.inviter?.id || null });
  cache.set(invite.guild.id, map);
}

function onInviteDelete(invite) {
  const map = cache.get(invite.guild.id);
  if (map) map.delete(invite.code);
}

// ── Détecte quelle invitation a été utilisée par un nouveau membre ────────
// (compare le cache d'avant avec l'état actuel : le code dont "uses" a augmenté)
async function resolveUsedInvite(member) {
  const guild = member.guild;
  const before = cache.get(guild.id) || new Map();

  let after;
  try {
    after = await guild.invites.fetch();
  } catch {
    return { code: null, inviterId: null, type: 'unknown' };
  }

  let found = null;
  for (const inv of after.values()) {
    const prev = before.get(inv.code);
    if (!prev || (inv.uses || 0) > prev.uses) {
      found = { code: inv.code, inviterId: inv.inviterId || inv.inviter?.id || null, type: 'normal' };
      break;
    }
  }

  // Vérifie aussi l'invitation vanity si rien trouvé côté normal
  if (!found && guild.features?.includes('VANITY_URL')) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    const prevVanity = before.get(`vanity:${vanity?.code}`);
    if (vanity?.code && (!prevVanity || (vanity.uses || 0) > prevVanity.uses)) {
      found = { code: vanity.code, inviterId: null, type: 'vanity' };
    }
  }

  // Rafraîchit le cache dans tous les cas (nouvelle photo de référence)
  await cacheGuildInvites(guild);

  return found || { code: null, inviterId: null, type: 'unknown' };
}

// ── Enregistrement arrivée / départ ─────────────────────────────────────────
async function recordJoin(member, inviteInfo) {
  await MemberLog.create({
    guildId: member.guild.id, userId: member.id,
    inviteCode: inviteInfo?.code || null, inviterId: inviteInfo?.inviterId || null,
    inviteType: inviteInfo?.type || 'unknown',
  }).catch(err => logger.error('InviteTracker', 'Erreur recordJoin', err));
}

async function recordLeave(member) {
  const last = await MemberLog.findOne({ guildId: member.guild.id, userId: member.id, leftAt: null })
    .sort({ joinedAt: -1 }).catch(() => null);
  if (last) {
    last.leftAt = new Date();
    await last.save().catch(() => {});
  }
}

// ── Stats de croissance (joins/leaves par période) ─────────────────────────
async function getGrowthStats(guildId) {
  const now = Date.now();
  const ranges = { '24h': 1, '7j': 7, '30j': 30 };
  const result = {};

  for (const [label, days] of Object.entries(ranges)) {
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
    const [joins, leaves] = await Promise.all([
      MemberLog.countDocuments({ guildId, joinedAt: { $gte: cutoff } }),
      MemberLog.countDocuments({ guildId, leftAt: { $gte: cutoff } }),
    ]);
    result[label] = { joins, leaves, net: joins - leaves };
  }
  return result;
}

// ── Classement des inviteurs ────────────────────────────────────────────────
async function getInviteLeaderboard(guildId, limit = 10) {
  const rows = await MemberLog.aggregate([
    { $match: { guildId, inviterId: { $ne: null } } },
    { $group: {
      _id: '$inviterId',
      total: { $sum: 1 },
      stillHere: { $sum: { $cond: [{ $eq: ['$leftAt', null] }, 1, 0] } },
    } },
    { $sort: { stillHere: -1, total: -1 } },
    { $limit: limit },
  ]).catch(() => []);
  return rows.map(r => ({ inviterId: r._id, total: r.total, stillHere: r.stillHere, left: r.total - r.stillHere }));
}

// ── Stats d'un membre précis (combien il a invité) ─────────────────────────
async function getMemberInviteStats(guildId, userId) {
  const rows = await MemberLog.find({ guildId, inviterId: userId }).lean().catch(() => []);
  const total = rows.length;
  const stillHere = rows.filter(r => !r.leftAt).length;
  return { total, stillHere, left: total - stillHere };
}

module.exports = {
  cacheGuildInvites, cacheAllGuilds, onInviteCreate, onInviteDelete,
  resolveUsedInvite, recordJoin, recordLeave,
  getGrowthStats, getInviteLeaderboard, getMemberInviteStats,
};
