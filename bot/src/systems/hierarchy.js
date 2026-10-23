// src/systems/hierarchy/index.js
'use strict';

const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

// ── Hiérarchie des niveaux ────────────────────────────────────────────────────
const LEVELS = {
  OWNER:     5,
  CO_OWNER:  4,
  ADMIN:     3,
  MODERATEUR: 2,
  ANIMATEUR:  1,
  TECHNICIEN: 1,
  MEMBRE:     0,
};

// ── Permissions Discord par rôle ──────────────────────────────────────────────
const DISCORD_PERMISSIONS = {
  moderateur: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageThreads,
  ],
  animateur: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.MentionEveryone,
  ],
  technicien: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageWebhooks,
  ],
  admin: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ManageThreads,
  ],
  co_owner: [
    PermissionFlagsBits.Administrator,
  ],
};

// ── Obtenir l'ID Owner depuis les env vars (hardcodé, immuable) ───────────────
function getOwnerId() {
  return process.env.OWNER_ID || null;
}

// ── Déterminer le niveau d'un membre ─────────────────────────────────────────
async function getMemberLevel(member, guildId) {
  const config = await Config.findOne({ guildId });
  const uid    = member.id || member;

  // Owner — hardcodé
  if (uid === getOwnerId()) return LEVELS.OWNER;

  // Co-Owner
  if (config?.coOwnerIds?.includes(uid)) return LEVELS.CO_OWNER;

  // Admin Discord natif
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return LEVELS.ADMIN;

  // Admin configuré
  if (config?.adminRoleId && member.roles?.cache?.has?.(config.adminRoleId)) return LEVELS.ADMIN;

  // Staff spécialisés
  if (config?.moderateurRoleId && member.roles?.cache?.has?.(config.moderateurRoleId)) return LEVELS.MODERATEUR;
  if (config?.animateurRoleId  && member.roles?.cache?.has?.(config.animateurRoleId))  return LEVELS.ANIMATEUR;
  if (config?.technicienRoleId && member.roles?.cache?.has?.(config.technicienRoleId)) return LEVELS.TECHNICIEN;

  return LEVELS.MEMBRE;
}

// ── Vérifier si un membre peut effectuer une action ──────────────────────────
async function canDo(member, action, guildId) {
  const level = await getMemberLevel(member, guildId);

  const requirements = {
    // Owner seulement
    'set_coowner':      LEVELS.OWNER,
    'reset_data':       LEVELS.OWNER,
    // Co-Owner+
    'set_admin':        LEVELS.CO_OWNER,
    'setup_config':     LEVELS.CO_OWNER,
    'view_all_logs':    LEVELS.CO_OWNER,
    // Admin+
    'ban':              LEVELS.ADMIN,
    'manage_staff':     LEVELS.ADMIN,
    'warn_reset':       LEVELS.ADMIN,
    'staff_valider':    LEVELS.ADMIN,
    'manage_channels':  LEVELS.ADMIN,
    // Modérateur+
    'warn':             LEVELS.MODERATEUR,
    'kick':             LEVELS.MODERATEUR,
    'manage_tickets':   LEVELS.MODERATEUR,
    'view_logs':        LEVELS.MODERATEUR,
    // Animateur+
    'giveaway':         LEVELS.ANIMATEUR,
    'event':            LEVELS.ANIMATEUR,
    'announce':         LEVELS.ANIMATEUR,
    // Technicien+
    'setup_bot':        LEVELS.TECHNICIEN,
  };

  const required = requirements[action] ?? LEVELS.ADMIN;
  return level >= required;
}

// ── Attribuer les permissions Discord automatiquement ────────────────────────
async function applyRolePermissions(guild, member, roleType) {
  const permissions = DISCORD_PERMISSIONS[roleType];
  if (!permissions) return;

  // On ne touche pas aux permissions Discord directement sur le membre
  // On configure le rôle lui-même si le bot a les perms
  const config    = await Config.findOne({ guildId: guild.id });
  const roleIdKey = `${roleType === 'co_owner' ? 'coOwner' : roleType}RoleId`;
  const roleId    = config?.[roleIdKey];
  if (!roleId) return;

  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) return;

    // Calculer les nouvelles permissions
    const newPerms = new PermissionsBitField(permissions);
    await role.setPermissions(newPerms);
    logger.info('Hierarchy', `Permissions appliquées sur le rôle ${role.name} (${roleType})`);
  } catch (err) {
    logger.error('Hierarchy', `Impossible d'appliquer les permissions sur ${roleType}`, err);
  }
}

// ── Nommer un Co-Owner ────────────────────────────────────────────────────────
async function setCoOwner(guild, targetId, callerId) {
  if (callerId !== getOwnerId()) return { ok: false, reason: 'Seul le Owner peut nommer un Co-Owner.' };

  const config = await Config.findOne({ guildId: guild.id });
  const coOwners = config?.coOwnerIds || [];

  if (coOwners.includes(targetId)) return { ok: false, reason: 'Ce membre est déjà Co-Owner.' };

  await Config.updateOne(
    { guildId: guild.id },
    { $addToSet: { coOwnerIds: targetId } },
    { upsert: true }
  );

  // Attribuer le rôle Co-Owner si configuré
  if (config?.coOwnerRoleId) {
    try {
      const member = await guild.members.fetch(targetId);
      await member.roles.add(config.coOwnerRoleId);
    } catch (_) {}
  }

  logger.info('Hierarchy', `${targetId} nommé Co-Owner par ${callerId}`);
  return { ok: true };
}

// ── Retirer un Co-Owner ───────────────────────────────────────────────────────
async function removeCoOwner(guild, targetId, callerId) {
  if (callerId !== getOwnerId()) return { ok: false, reason: 'Seul le Owner peut retirer un Co-Owner.' };

  await Config.updateOne({ guildId: guild.id }, { $pull: { coOwnerIds: targetId } });

  const config = await Config.findOne({ guildId: guild.id });
  if (config?.coOwnerRoleId) {
    try {
      const member = await guild.members.fetch(targetId);
      await member.roles.remove(config.coOwnerRoleId);
    } catch (_) {}
  }

  logger.info('Hierarchy', `${targetId} retiré du rôle Co-Owner par ${callerId}`);
  return { ok: true };
}

// ── Middleware pour les interactions ─────────────────────────────────────────
async function checkPermission(interaction, action) {
  const allowed = await canDo(interaction.member, action, interaction.guild.id);
  if (!allowed) {
    const { safeReply } = require('../utils/permissions');
    await safeReply(interaction, {
      content: `❌ Tu n'as pas les permissions nécessaires pour cette action.\n> Niveau requis : **${getActionLabel(action)}**`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

function getActionLabel(action) {
  const map = {
    'set_coowner': 'Owner', 'reset_data': 'Owner',
    'set_admin': 'Co-Owner+', 'setup_config': 'Co-Owner+',
    'ban': 'Admin+', 'manage_staff': 'Admin+', 'staff_valider': 'Admin+',
    'warn': 'Modérateur+', 'kick': 'Modérateur+', 'manage_tickets': 'Modérateur+',
    'giveaway': 'Animateur+', 'event': 'Animateur+',
    'setup_bot': 'Technicien+',
  };
  return map[action] || 'Admin+';
}

module.exports = {
  LEVELS,
  getOwnerId,
  getMemberLevel,
  canDo,
  checkPermission,
  applyRolePermissions,
  setCoOwner,
  removeCoOwner,
};
