// src/handlers/commandHandlers/notif.js
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS } = require('../../config/constants');

async function handle(interaction) {
  await interaction.deferReply();
  const msg   = interaction.options.getString('message');
  const lien  = interaction.options.getString('lien');
  const image = interaction.options.getString('image');

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle(`📣 ${interaction.user.displayName || interaction.user.username}`)
    .setDescription(msg)
    .setTimestamp();
  if (image) embed.setImage(image);

  const components = [];
  if (lien) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('🔗 Voir le lien').setStyle(ButtonStyle.Link).setURL(lien),
    ));
  }
  await interaction.followUp({ embeds: [embed], components });
}

module.exports = { handle };
