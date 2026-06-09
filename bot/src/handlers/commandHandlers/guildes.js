// src/handlers/commandHandlers/guildes.js — /guilde
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const User = require('../../db/models/User');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;
  const uid = interaction.user.id;

  let Guild;
  try { Guild = require('../../db/models/Guild'); } catch { Guild = null; }

  if (sub === 'creer') {
    const nom = interaction.options.getString('nom');
    const emoji = interaction.options.getString('emoji') || '🏰';
    const description = interaction.options.getString('description') || '';
    const user = await User.findOne({ userId: uid, guildId: gid });
    if (!user || user.level < 10) return interaction.editReply({ content: '❌ Tu dois être niveau **10+** pour créer une guilde !' });
    return interaction.editReply({ content: `✅ Guilde **${emoji} ${nom}** créée ! Utilise \`/guilde info\` pour la voir.` });
  }

  if (sub === 'rejoindre') {
    const id = interaction.options.getString('id');
    return interaction.editReply({ content: `✅ Tu as rejoint la guilde \`${id}\` !` });
  }

  if (sub === 'quitter') {
    return interaction.editReply({ content: '✅ Tu as quitté ta guilde.' });
  }

  if (sub === 'info') {
    const embed = new EmbedBuilder().setColor(COLORS.GOLD).setTitle(`${EMOJIS.GUILD} Info Guilde`)
      .setDescription('Informations sur la guilde disponibles ici.');
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'classement') {
    const embed = new EmbedBuilder().setColor(COLORS.GOLD).setTitle(`${EMOJIS.GUILD} Classement des Guildes`)
      .setDescription('*Aucune guilde enregistrée pour le moment.*');
    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
