// src/systems/guerre.js — Guerre de guildes (bouton rejoindre équipe)
'use strict';
const User = require('../db/models/User');
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
