// src/handlers/commandHandlers/pubs.js
'use strict';
const { openPubModal, listPubs, togglePub, deletePub } = require('../../systems/pubs');
const { requireAdmin, safeReply } = require('../../utils/permissions');

async function handle(interaction) {
  if (!requireAdmin(interaction)) return;
  const sub = interaction.options.getSubcommand();
  if (sub === 'creer')     return openPubModal(interaction);
  if (sub === 'liste')     return listPubs(interaction);
  if (sub === 'toggle') {
    const pubId = interaction.options.getString('id');
    const state = await togglePub(interaction.guild.id, pubId);
    if (state === false && state !== true) return safeReply(interaction, { content: '❌ Pub introuvable.', ephemeral: true });
    return safeReply(interaction, { content: `${state ? '▶️ Pub activée' : '⏸️ Pub désactivée'} (\`${pubId}\`).`, ephemeral: true });
  }
  if (sub === 'supprimer') {
    const pubId = interaction.options.getString('id');
    await deletePub(interaction.guild.id, pubId);
    return safeReply(interaction, { content: `🗑️ Pub \`${pubId}\` supprimée.`, ephemeral: true });
  }
}

module.exports = { handle };
