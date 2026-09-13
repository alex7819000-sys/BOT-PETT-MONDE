// src/handlers/commandHandlers/vocal.js — /vocal join|leave : fait rejoindre/quitter
// le bot d'un salon vocal (réutilise le système Ghost Bot déjà existant).
'use strict';
const Config = require('../../db/models/Config');
const { joinGhost, leaveGhost, isConnected } = require('../../systems/ghostBot');

async function handle(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();

  if (sub === 'join') {
    const channel = interaction.options.getChannel('salon');
    if (!channel || !channel.isVoiceBased?.()) {
      return interaction.editReply({ content: '❌ Ce n\'est pas un salon vocal.' });
    }

    const result = await joinGhost(interaction.client, interaction.guild.id, channel.id);
    if (!result.ok) return interaction.editReply({ content: `❌ ${result.reason}` });

    // Mémorise le salon pour que le bot revienne automatiquement après un redémarrage
    await Config.updateOne({ guildId: interaction.guild.id }, { ghostBotChannelId: channel.id }, { upsert: true });

    return interaction.editReply({ content: `✅ Connecté à **${result.channelName}**.` });
  }

  if (sub === 'leave') {
    if (!isConnected(interaction.guild.id)) {
      return interaction.editReply({ content: '❌ Je ne suis dans aucun salon vocal.' });
    }
    leaveGhost(interaction.guild.id);
    await Config.updateOne({ guildId: interaction.guild.id }, { ghostBotChannelId: null });
    return interaction.editReply({ content: '✅ Déconnecté du vocal.' });
  }
}

module.exports = { handle };
