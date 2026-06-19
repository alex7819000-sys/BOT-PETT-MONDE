// src/handlers/commandHandlers/staff.js — /staff
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

module.exports = async function handleStaff(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'valider') {
    const target = interaction.options.getMember('membre');
    return interaction.editReply({ content: `✅ Période d'essai de **${target?.displayName}** validée.` });
  }
  if (sub === 'quotas') return interaction.editReply({ content: '📋 Quotas staff : système en cours de configuration.' });
  if (sub === 'classement') {
    const embed = new EmbedBuilder().setColor(COLORS.PURPLE).setTitle('👑 Classement Staff')
      .setDescription('*Aucune donnée staff disponible*').setTimestamp();
    return interaction.editReply({ embeds: [embed], ephemeral: true });
  }
  if (sub === 'score') {
    const target = interaction.options.getMember('membre') || interaction.member;
    return interaction.editReply({ content: `📊 Score staff de **${target.displayName}** : *à configurer*` });
  }
};
