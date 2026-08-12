// src/systems/couple.js — Votes couple
'use strict';
const Nomination = require('../db/models/Nomination');
const { getWeekNumber, getCurrentYear } = require('../utils/permissions');

async function handleVote(interaction, targetId) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;
  const gid = interaction.guild.id;
  const week = getWeekNumber(), year = getCurrentYear();

  if (!targetId) return interaction.editReply({ content: '❌ Cible invalide.' });

  const existing = await Nomination.findOne({ guildId: gid, nominatorId: uid, type: 'couple', week, year });
  if (existing) return interaction.editReply({ content: '✅ Tu as déjà voté pour le couple de la semaine !' });

  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });

  await Nomination.create({ guildId: gid, nominatorId: uid, targetId, type: 'couple', week, year });
  return interaction.editReply({ content: `💑 Vote envoyé pour **${target.displayName}** !` });
}

module.exports = { handleVote };
