// src/systems/invitetracker/index.js — Invitations avec récompenses renforcées
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { XP }  = require('../../config/constants');

const inviteCache = new Map();

// ── Milestones d'invitations ───────────────────────────────────────────────
const INVITE_MILESTONES = [
  { count: 5,  xp: XP.INVITE_MILESTONE_5,  label: '🥉 5 invitations',  kakera: 500  },
  { count: 10, xp: XP.INVITE_MILESTONE_10, label: '🥈 10 invitations', kakera: 1000 },
  { count: 25, xp: XP.INVITE_MILESTONE_25, label: '🥇 25 invitations', kakera: 2500 },
  { count: 50, xp: 5000,                   label: '👑 50 invitations', kakera: 5000 },
];

async function loadInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
    logger.info('InviteTracker', `${invites.size} invitations chargées pour ${guild.name}`);
  } catch (err) {
    logger.error('InviteTracker', 'loadInvites failed', err);
  }
}

async function sendKakera(userId, amount, guild, cfg) {
  const channelId = cfg?.mudaeChannelId || cfg?.waifuChannelId;
  if (!channelId || !amount) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel) await channel.send(`$give <@${userId}> ${amount}`).catch(() => {});
}

async function handleMemberJoin(member) {
  const guild  = member.guild;
  const gid    = guild.id;
  const config = await Config.findOne({ guildId: gid });
  if (!config?.inviteTrackerEnabled) return;

  const cachedInvites = inviteCache.get(gid) || new Map();
  let newInvites;
  try { newInvites = await guild.invites.fetch(); } catch (_) { return; }

  let usedInvite = null;
  for (const [code, newInv] of newInvites) {
    const oldUses = cachedInvites.get(code) || 0;
    if (newInv.uses > oldUses) { usedInvite = newInv; break; }
  }
  inviteCache.set(gid, new Map(newInvites.map(inv => [inv.code, inv.uses])));
  if (!usedInvite?.inviter) return;

  const inviterId = usedInvite.inviter.id;
  const xpSys = require('../xp');

  // XP principal
  await xpSys.addXP(inviterId, gid, XP.INVITE_BONUS, null, guild);

  // Kakera Mudae
  await sendKakera(inviterId, XP.INVITE_KAKERA, guild, config);

  // Mise à jour compteur
  const user = await User.findOneAndUpdate(
    { userId: inviterId, guildId: gid },
    { $inc: { inviteCount: 1 } },
    { upsert: true, new: true }
  );

  const total = user.inviteCount || 1;

  // Progression défis
  try {
    const { updateProgress } = require('../defis');
    await updateProgress(inviterId, gid, 'invites', 1);
  } catch (_) {}

  // Vérifier milestones
  const milestone = INVITE_MILESTONES.find(m => m.count === total);
  if (milestone) {
    await xpSys.addXP(inviterId, gid, milestone.xp, null, guild);
    await sendKakera(inviterId, milestone.kakera, guild, config);
  }

  logger.info('InviteTracker', `${member.user.username} invité par ${usedInvite.inviter.username} (+${XP.INVITE_BONUS} XP +${XP.INVITE_KAKERA} kakera)`);

  const notifChannelId = config.inviteChannelId || config.announceChannelId;
  if (!notifChannelId) return;
  const channel = guild.channels.cache.get(notifChannelId);
  if (!channel) return;

  const inviter = await guild.members.fetch(inviterId).catch(() => null);
  const inviterName = inviter?.displayName || 'Inconnu';

  // Message public
  const lines = [
    `👋 Bienvenue <@${member.id}> ! Invité par **${inviterName}** — on est maintenant **${guild.memberCount}** 🎉`,
    `> **${inviterName}** gagne **+${XP.INVITE_BONUS} XP** + **${XP.INVITE_KAKERA} kakera** 💎`,
  ];
  if (milestone) {
    lines.push(`\n🏆 **MILESTONE !** ${inviterName} atteint **${milestone.label}** ! +${milestone.xp} XP +${milestone.kakera} kakera bonus 🔥`);
  }
  await channel.send(lines.join('\n'));

  // DM à l'inviteur
  if (inviter) {
    const dmLines = [
      `⚡ **+${XP.INVITE_BONUS} XP** + **${XP.INVITE_KAKERA} kakera** pour avoir invité **${member.displayName}** sur **${guild.name}** !`,
      `🎯 Tu as maintenant **${total}** invitation${total > 1 ? 's' : ''} au total.`,
    ];
    if (milestone) {
      dmLines.push(`\n🏆 **MILESTONE atteint : ${milestone.label}** ! Tu reçois **+${milestone.xp} XP** + **${milestone.kakera} kakera** bonus !`);
    }
    // Prochain milestone
    const next = INVITE_MILESTONES.find(m => m.count > total);
    if (next) {
      dmLines.push(`\n> Prochain objectif : **${next.label}** dans **${next.count - total}** invitation${next.count - total > 1 ? 's' : ''} 🎯`);
    }
    await inviter.send(dmLines.join('\n')).catch(() => {});
  }
}

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
