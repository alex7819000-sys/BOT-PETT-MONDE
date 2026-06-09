// src/systems/smash.js — Smash or Pass (boutons)
'use strict';
const Vote = require('../db/models/Vote');
const logger = require('../utils/logger');

async function handleVote(interaction, type, voteId) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;

  let vote = null;
  if (voteId) vote = await Vote.findById(voteId).catch(() => null);
  if (!vote)  vote = await Vote.findOne({ guildId: interaction.guild.id, messageId: interaction.message.id }).catch(() => null);
  if (!vote)  return interaction.editReply({ content: '❌ Vote introuvable ou expiré.' });

  // Retire l'ancien vote s'il existe
  vote.smashes = vote.smashes.filter(id => id !== uid);
  vote.passes  = vote.passes.filter(id => id !== uid);

  if (type === 'smash') {
    vote.smashes.push(uid);
    await vote.save();
    const total = vote.smashes.length + vote.passes.length;
    const pct = total ? Math.round((vote.smashes.length / total) * 100) : 0;
    return interaction.editReply({ content: `💚 **Smash !** (${vote.smashes.length} smash · ${pct}% sur ${total} votes)` });
  } else {
    vote.passes.push(uid);
    await vote.save();
    const total = vote.smashes.length + vote.passes.length;
    const pct = total ? Math.round((vote.passes.length / total) * 100) : 0;
    return interaction.editReply({ content: `💔 **Pass.** (${vote.passes.length} pass · ${pct}% sur ${total} votes)` });
  }
}

module.exports = { handleVote };
