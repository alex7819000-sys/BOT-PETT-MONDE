// src/systems/invitetracker/index.js — Suivi invitations + récompenses XP
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

// Cache invitations : guildId → Map<code, uses>
const inviteCache = new Map();
const XP_INVITE   = 50;

// ── Charger le cache au démarrage ──────────────────────────────────────────
async function loadInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
    logger.info('InviteTracker', `${invites.size} invitations chargées pour ${guild.name}`);
  } catch (err) {
    logger.error('InviteTracker', 'loadInvites failed', err);
  }
}

// ── Détection quand un membre rejoint ─────────────────────────────────────
async function handleMemberJoin(member) {
  const guild  = member.guild;
  const gid    = guild.id;
  const config = await Config.findOne({ guildId: gid });
  if (!config?.inviteTrackerEnabled) return;

  const cachedInvites = inviteCache.get(gid) || new Map();

  let newInvites;
  try {
    newInvites = await guild.invites.fetch();
  } catch (_) { return; }

  // Trouver l'invite utilisée (celle dont uses a augmenté)
  let usedInvite = null;
  for (const [code, newInv] of newInvites) {
    const oldUses = cachedInvites.get(code) || 0;
    if (newInv.uses > oldUses) {
      usedInvite = newInv;
      break;
    }
  }

  // Mettre à jour le cache
  inviteCache.set(gid, new Map(newInvites.map(inv => [inv.code, inv.uses])));

  if (!usedInvite?.inviter) return;

  const inviterId = usedInvite.inviter.id;

  // Récompenser l'inviteur
  const xpSys = require('../xp');
  await xpSys.addXP(inviterId, gid, XP_INVITE);
  await User.updateOne(
    { userId: inviterId, guildId: gid },
    { $inc: { inviteCount: 1 } },
    { upsert: true }
  );

  // Progression défis 'invites'
  try {
    const { updateProgress } = require('../defis');
    await updateProgress(inviterId, gid, 'invites', 1);
  } catch (_) {}

  logger.info('InviteTracker', `${member.user.username} invité par ${usedInvite.inviter.username} (+${XP_INVITE} XP)`);

  // Notifier dans le salon invitations dédié (ou announce en fallback)
  const notifChannelId = config.inviteChannelId || config.announceChannelId;
  if (notifChannelId) {
    const channel = guild.channels.cache.get(notifChannelId);
    if (channel) {
      const user = await User.findOne({ userId: inviterId, guildId: gid });
      const total = user?.inviteCount || 1;
      const inviter = await member.guild.members.fetch(inviterId).catch(() => null);
      const inviterName = inviter?.displayName || 'Inconnu';

      // Message public court
      await channel.send(
        `👋 Bienvenue <@${member.id}> ! Grâce à **${inviterName}** on est **${member.guild.memberCount}** 🎉`
      );

      // DM privé à l'inviteur pour l'inciter à continuer
      try {
        if (inviter) {
          await inviter.send(
            `⚡ **+${XP_INVITE} XP** pour avoir invité **${member.displayName}** sur **${member.guild.name}** !\n🎯 Tu as désormais **${total}** invitation${total > 1 ? 's' : ''} — continue comme ça 🔥`
          );
        }
      } catch (_) {} // DM désactivés = on ignore
    }
  }
}

// ── Mise à jour cache quand une invite est créée/supprimée ────────────────
async function handleInviteCreate(invite) {
  const cache = inviteCache.get(invite.guild.id) || new Map();
  cache.set(invite.code, invite.uses || 0);
  inviteCache.set(invite.guild.id, cache);
}

async function handleInviteDelete(invite) {
  const cache = inviteCache.get(invite.guild.id);
  if (cache) cache.delete(invite.code);
}

module.exports = { loadInvites, handleMemberJoin, handleInviteCreate, handleInviteDelete };
