// src/handlers/commandHandlers/animals.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { ANIMAL_APIS, COLORS } = require('../../config/constants');

async function handleCat(interaction) {
  await interaction.deferReply();
  try {
    const result = await ANIMAL_APIS.cat();
    const embed  = new EmbedBuilder().setColor(COLORS.PINK).setTitle('🐱 Chat aléatoire !').setImage(result.image).setFooter({ text: '🐱 Team Chat • /guerre pour rejoindre !' });
    await interaction.followUp({ embeds: [embed] });
  } catch (_) {
    await interaction.followUp({ content: '❌ API indisponible.', ephemeral: true });
  }
}

async function handleDog(interaction) {
  await interaction.deferReply();
  try {
    const result = await ANIMAL_APIS.dog();
    const embed  = new EmbedBuilder().setColor(0x8B4513).setTitle('🐶 Chien aléatoire !').setImage(result.image).setFooter({ text: '🐶 Team Chien • /guerre pour rejoindre !' });
    await interaction.followUp({ embeds: [embed] });
  } catch (_) {
    await interaction.followUp({ content: '❌ API indisponible.', ephemeral: true });
  }
}

module.exports = { handleCat, handleDog };
