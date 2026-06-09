// src/handlers/commandHandlers/missions.js
'use strict';
const { getDailyMissionsEmbed } = require('../../systems/dailymissions');

module.exports = async function handleMissions(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const embed = await getDailyMissionsEmbed(interaction.user.id, interaction.guild.id);
  return interaction.editReply({ embeds: [embed] });
};
