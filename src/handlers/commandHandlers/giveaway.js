'use strict';
const { createGiveaway } = require('../../systems/giveaway');

async function handle(interaction) {
  if (!interaction.memberPermissions?.has('ManageGuild') && !interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: '❌ Tu dois avoir la permission Gérer le serveur.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'creer') {
    const prize = interaction.options.getString('lot');
    const duration = interaction.options.getInteger('duree'); // en minutes
    const winners = interaction.options.getInteger('gagnants') || 1;

    await interaction.deferReply({ ephemeral: true });
    const result = await createGiveaway(interaction, prize, duration, winners);

    if (result.success) {
      return interaction.editReply({ content: `✅ Giveaway créé dans ${result.channel} !` });
    } else {
      return interaction.editReply({ content: '❌ Erreur lors de la création du giveaway.' });
    }
  }
}

module.exports = { handle };
