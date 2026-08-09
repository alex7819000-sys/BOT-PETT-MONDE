'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../config/constants');

const BADGE_LABELS = {
  modele: 'Membre modele', actif: 'Tres actif', competitif: 'Competitif',
  fiable: 'Fiable', createur: 'Createur', veteran: 'Veteran', surveille: 'Surveille',
};

async function handleBadgeCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === 'donner') {
    const target = interaction.options.getMember('membre');
    const badge = interaction.options.getString('badge');
    return interaction.editReply({ content: `Badge **${BADGE_LABELS[badge]}** donne a **${target?.displayName}** !` });
  }
  if (sub === 'retirer') {
    const target = interaction.options.getMember('membre');
    const badge = interaction.options.getString('badge');
    return interaction.editReply({ content: `Badge **${BADGE_LABELS[badge]}** retire de **${target?.displayName}**.` });
  }
  if (sub === 'voir') {
    const target = interaction.options.getMember('membre') || interaction.member;
    const embed = new EmbedBuilder().setColor(COLORS.GOLD).setTitle(`Badges de ${target.displayName}`)
      .setDescription('*Aucun badge*').setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
}

async function handleSatisfactionNote(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const [, , note] = interaction.customId.split(':'); // rep:note:5
  const uid = interaction.user.id;
  return interaction.editReply({ content: `⭐ Note **${note}/5** enregistrée, merci !` });
}

module.exports = { handleBadgeCommand, handleSatisfactionNote };
