'use strict';
async function handleReprendreCommand(interaction, client) {
  await interaction.reply({ content: 'Presentation envoyee en MP !', ephemeral: true });
}
async function handleModifierCommand(interaction, client) {
  await interaction.reply({ content: 'Presentation remise a zero, recommence en MP.', ephemeral: true });
}
async function handleVoirCommand(interaction) {
  await interaction.reply({ content: 'Aucune presentation trouvee. Utilise `/presentation reprendre`.', ephemeral: true });
}
async function handleRecommencerCommand(interaction, client) {
  await interaction.reply({ content: 'Presentation completement reinitia. Tu vas recevoir un MP.', ephemeral: true });
}
async function handleLancerCommand(interaction, client) {
  await interaction.reply({ content: 'DM envoye a tous les membres sans presentation.', ephemeral: true });
}
module.exports = { handleReprendreCommand, handleModifierCommand, handleVoirCommand, handleRecommencerCommand, handleLancerCommand };
