// src/handlers/commandHandlers/couple.js — /couple
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const Config = require('../../db/models/Config');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'nominer') {
    const m1 = interaction.options.getMember('membre1');
    const m2 = interaction.options.getMember('membre2');
    if (!m1 || !m2) return interaction.editReply({ content: '❌ Membres invalides.' });
    if (m1.id === m2.id) return interaction.editReply({ content: '❌ Tu ne peux pas nominer la même personne deux fois !' });
    return interaction.editReply({ content: `💑 Nomination envoyée pour **${m1.displayName}** & **${m2.displayName}** !` });
  }

  if (sub === 'actuel') {
    const config = await Config.findOne({ guildId: gid });
    if (!config?.currentCouple?.length) return interaction.editReply({ content: '*Aucun couple élu cette semaine.*' });
    const [id1, id2] = config.currentCouple;
    const embed = new EmbedBuilder().setColor(COLORS.PINK).setTitle(`${EMOJIS.COUPLE} Meilleur Couple de la Semaine`)
      .setDescription(`**<@${id1}>** 💑 **<@${id2}>**`).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
