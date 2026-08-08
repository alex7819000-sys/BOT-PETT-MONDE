// src/handlers/commandHandlers/signaler.js — /signaler : n'importe qui peut signaler
// un membre avec une preuve, ça part en file d'attente de validation staff.
'use strict';
const { createRequest } = require('../../systems/sanctions');

async function handle(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getMember('membre') || interaction.options.getUser('membre');
  const reason = interaction.options.getString('raison');
  const attachment = interaction.options.getAttachment('preuve_image');
  const proofText = interaction.options.getString('preuve_texte');

  if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });
  if (target.id === interaction.user.id) return interaction.editReply({ content: '❌ Tu ne peux pas te signaler toi-même.' });
  if (target.user?.bot || target.bot) return interaction.editReply({ content: '❌ Impossible de signaler un bot.' });

  const result = await createRequest({
    guild: interaction.guild,
    target,
    reporter: interaction.user,
    reason,
    proofImageUrl: attachment?.url || null,
    proofText: proofText || null,
  });

  if (!result.ok) return interaction.editReply({ content: `❌ ${result.reason}` });

  return interaction.editReply({ content: '✅ Signalement envoyé au staff pour validation. Merci !' });
}

module.exports = { handle };
