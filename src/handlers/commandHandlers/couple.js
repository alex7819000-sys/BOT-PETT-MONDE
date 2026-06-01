// src/handlers/commandHandlers/couple.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { nominate } = require('../../systems/couple');
const Config = require('../../db/models/Config');
const { COLORS, EMOJIS } = require('../../config/constants');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'nominer') {
    const m1 = interaction.options.getMember('membre1');
    const m2 = interaction.options.getMember('membre2');
    return nominate(interaction, m1, m2);
  }
  if (sub === 'actuel') {
    await interaction.deferReply();
    const config = await Config.findOne({ guildId: interaction.guild.id });
    if (!config?.currentCoupleIds?.length) return interaction.followUp({ content: '*Aucun couple élu cette semaine*' });
    const names = await Promise.all(config.currentCoupleIds.map(id => interaction.guild.members.fetch(id).then(m => m.displayName).catch(() => `<@${id}>`)));
    const embed = new EmbedBuilder().setColor(COLORS.PINK).setTitle(`${EMOJIS.COUPLE} Meilleur Couple`)
      .setDescription(`**${names[0]}** & **${names[1]}** 💕`);
    return interaction.followUp({ embeds: [embed] });
  }
}

module.exports = { handle };
