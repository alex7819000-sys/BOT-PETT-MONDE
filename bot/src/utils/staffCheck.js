// src/utils/staffCheck.js — Qui a le droit de traiter un ticket ? (v108)
// Avant la v108, TOUS les boutons de ticket (prendre en charge, fermer, accepter/refuser un partenariat ou
// une candidature staff…) étaient utilisables par n'importe qui voyant le salon, donc aussi par le demandeur.
'use strict';
const { PermissionFlagsBits } = require('discord.js');
const Config = require('../db/models/Config');

async function isTicketStaff(interaction) {
  const m = interaction.member;
  if (!m || !interaction.guild) return false;
  if (interaction.guild.ownerId === m.id) return true;
  const p = m.permissions;
  if (p && (p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild))) return true;
  const cfg = await Config.findOne({ guildId: interaction.guild.id }).lean();
  if (!cfg) return false;
  if ((cfg.coOwnerIds || []).includes(m.id)) return true;
  const roleIds = [cfg.staffRoleId, cfg.moderateurRoleId, cfg.adminRoleId, cfg.coOwnerRoleId, cfg.kingStaffRoleId, cfg.partnerManagerRoleId].filter(Boolean);
  return roleIds.some((r) => m.roles?.cache?.has(r));
}

module.exports = { isTicketStaff };
