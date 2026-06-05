'use strict';
const { getMissionsEmbed } = require('../../systems/missions');

async function handle(interaction) {
  const target = interaction.options.getUser('membre') || interaction.user;
  const embed = await getMissionsEmbed(target.id, interaction.guildId);
  embed.setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL({ size: 64 }) });
  return interaction.reply({ embeds: [embed], ephemeral: false });
}

module.exports = { handle };
