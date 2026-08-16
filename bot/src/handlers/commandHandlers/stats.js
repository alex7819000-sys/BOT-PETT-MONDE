// src/handlers/commandHandlers/stats.js — /stats croissance : joins/leaves par période
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getGrowthStats } = require('../../systems/inviteTracker');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();

  if (sub === 'croissance') {
    const stats = await getGrowthStats(interaction.guild.id);
    const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📈 Croissance — ${interaction.guild.name}`)
      .addFields(
        { name: '👥 Membres actuels', value: `**${interaction.guild.memberCount}**`, inline: false },
        { name: '📅 24h', value: `📥 ${stats['24h'].joins} arrivées\n📤 ${stats['24h'].leaves} départs\n📊 ${fmt(stats['24h'].net)} net`, inline: true },
        { name: '📅 7 jours', value: `📥 ${stats['7j'].joins} arrivées\n📤 ${stats['7j'].leaves} départs\n📊 ${fmt(stats['7j'].net)} net`, inline: true },
        { name: '📅 30 jours', value: `📥 ${stats['30j'].joins} arrivées\n📤 ${stats['30j'].leaves} départs\n📊 ${fmt(stats['30j'].net)} net`, inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
