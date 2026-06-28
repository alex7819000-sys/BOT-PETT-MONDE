// src/systems/guerre.js — Guerre de guildes (bouton rejoindre équipe)
'use strict';
const User = require('../db/models/User');
const Config = require('../db/models/Config');
const { COLORS } = require('../config/constants');
const { EmbedBuilder } = require('discord.js');

async function joinTeam(interaction, team) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;
  const gid = interaction.guild.id;

  if (!team) return interaction.editReply({ content: '❌ Équipe invalide.' });

  const user = await User.findOneAndUpdate(
    { userId: uid, guildId: gid },
    { team },
    { upsert: true, new: true }
  );

  // Attribue le rôle Discord configuré pour cette équipe (et retire l'autre, le cas échéant)
  const config = await Config.findOne({ guildId: gid }).lean().catch(() => null);
  const member = interaction.member;
  if (config && member) {
    const roleId = team === 'dog' ? config.dogTeamRoleId : config.catTeamRoleId;
    const otherRoleId = team === 'dog' ? config.catTeamRoleId : config.dogTeamRoleId;
    if (roleId) await member.roles.add(roleId).catch(() => {});
    if (otherRoleId) await member.roles.remove(otherRoleId).catch(() => {});
  }

  return interaction.editReply({ content: `⚔️ Tu as rejoint l'équipe **${team}** !` });
}

async function getTeamScores(guildId) {
  const users = await User.find({ guildId, team: { $ne: null } });
  const scores = {};
  for (const u of users) {
    if (!scores[u.team]) scores[u.team] = { xp: 0, members: 0 };
    scores[u.team].xp += u.teamXp || 0;
    scores[u.team].members++;
  }
  return scores;
}

module.exports = { joinTeam, getTeamScores };
