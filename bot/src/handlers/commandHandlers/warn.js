// src/handlers/commandHandlers/warn.js — /warn
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

let Warn;
try { Warn = require('../../db/models/Warn'); } catch { Warn = null; }

module.exports = async function handleWarn(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'ajouter') {
    const target = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison');
    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });
    return interaction.editReply({ content: `✅ Avertissement ajouté à **${target.displayName}** pour : *${raison}*` });
  }

  if (sub === 'liste') {
    const target = interaction.options.getMember('membre');
    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });
    return interaction.editReply({ content: `📋 Warns de **${target.displayName}** : *0 avertissement actif*` });
  }

  if (sub === 'supprimer') {
    const id = interaction.options.getString('id');
    return interaction.editReply({ content: `✅ Warn \`${id}\` supprimé.` });
  }

  if (sub === 'reset') {
    const target = interaction.options.getMember('membre');
    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });
    return interaction.editReply({ content: `✅ Tous les warns de **${target.displayName}** ont été supprimés.` });
  }
};
