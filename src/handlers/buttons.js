// src/handlers/buttons.js — Dispatch tous les boutons
'use strict';
const logger = require('../utils/logger');

async function handleButton(interaction, client) {
  const id = interaction.customId;
  const [ns, action, ...rest] = id.split(':');

  try {
    switch (ns) {
      case 'sop': {
        const { handleVote } = require('../systems/smash');
        const voteId = rest[0] || null;
        if (action === 'smash') return handleVote(interaction, 'smash', voteId);
        if (action === 'pass')  return handleVote(interaction, 'pass',  voteId);
        if (action === 'stats') return handleSopStats(interaction, voteId);
        break;
      }
      case 'singe': {
        if (action === 'vote') {
          const { handleVote } = require('../systems/singe');
          return handleVote(interaction, rest[0]);
        }
        break;
      }
      case 'couple': {
        if (action === 'vote') {
          const { handleVote } = require('../systems/couple');
          return handleVote(interaction, rest.join(':'));
        }
        break;
      }
      case 'war': {
        if (action === 'join') {
          const { joinTeam } = require('../systems/guerre');
          return joinTeam(interaction, rest[0]);
        }
        break;
      }
      case 'quiz': {
        if (action === 'answer') {
          const { handleQuizAnswer } = require('../systems/quiz');
          return handleQuizAnswer(interaction, rest[0]);
        }
        break;
      }
      case 'confession': {
        if (action === 'vote') {
          const { handleVote } = require('../systems/confession');
          return handleVote(interaction, rest[0]);
        }
        if (action === 'reveal') {
          const { handleReveal } = require('../systems/confession');
          return handleReveal(interaction, rest[0]);
        }
        if (action === 'hide') {
          return interaction.update({ components: [] });
        }
        break;
      }
      case 'pub': {
        if (action === 'toggle_all') {
          const { requireAdmin } = require('../utils/permissions');
          if (!requireAdmin(interaction)) return;
          const { toggleAllPubs } = require('../systems/pubs');
          const state = await toggleAllPubs(interaction.guild.id);
          return interaction.update({ content: state ? '▶️ Toutes les pubs activées !' : '⏸️ Toutes les pubs désactivées !', components: [] });
        }
        break;
      }
      case 'setup': {
        // handled via modals or commands
        break;
      }
      default:
        logger.debug('Buttons', `Unknown button: ${id}`);
    }
  } catch (err) {
    logger.error('Buttons', `Error handling button ${id}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
    }
  }
}

async function handleSopStats(interaction, voteId) {
  const Vote = require('../db/models/Vote');
  await interaction.deferReply({ ephemeral: true });
  const vote = voteId ? await Vote.findById(voteId) : await Vote.findOne({ guildId: interaction.guild.id, messageId: interaction.message.id });
  if (!vote) return interaction.followUp({ content: '❌ Vote introuvable.', ephemeral: true });

  const total = vote.smashes.length + vote.passes.length;
  const pct   = total ? Math.round((vote.smashes.length / total) * 100) : 0;

  await interaction.followUp({
    content: `📊 **${vote.subject.name}** — ${vote.smashes.length} 💚 Smash vs ${vote.passes.length} 💔 Pass (${pct}% smash) — ${total} vote(s)`,
    ephemeral: true,
  });
}

module.exports = { handleButton };
