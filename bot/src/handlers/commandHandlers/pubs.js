// src/handlers/commandHandlers/pubs.js
'use strict';
const { openPubModal, listPubs, togglePub, deletePub, sendPubPanel } = require('../../systems/pubs');
const { requireAdmin, safeReply } = require('../../utils/permissions');

async function handle(interaction) {
  if (!requireAdmin(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'creer')  return openPubModal(interaction);
  if (sub === 'liste')  return listPubs(interaction);

  if (sub === 'toggle') {
    const pubId = interaction.options.getString('id');
    const state = await togglePub(interaction.guild.id, pubId);
    if (state === null) return safeReply(interaction, { content: '❌ Pub introuvable.', ephemeral: true });
    return safeReply(interaction, { content: `${state ? '▶️ Pub activée' : '⏸️ Pub désactivée'} (\`${pubId}\`).`, ephemeral: true });
  }

  if (sub === 'supprimer') {
    const pubId = interaction.options.getString('id');
    const res = await deletePub(interaction.guild.id, pubId);
    if (!res?.deletedCount) return safeReply(interaction, { content: '❌ Pub introuvable.', ephemeral: true });
    return safeReply(interaction, { content: `🗑️ Pub \`${pubId}\` supprimée.`, ephemeral: true });
  }

  if (sub === 'panel') {
    const salon = interaction.options.getChannel('salon') || interaction.channel;
    await interaction.deferReply({ ephemeral: true });
    await sendPubPanel(salon, interaction.guild.id);
    return interaction.editReply({ content: `✅ Panel "Demander une publication" envoyé dans <#${salon.id}> !` });
  }
}

module.exports = { handle };
