'use strict';
const Nomination = require('../db/models/Nomination');
const { getWeekNumber, getCurrentYear } = require('../utils/permissions');

async function nominate(interaction, target) {
  if (!target) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
  if (target.id === interaction.user.id) return interaction.reply({ content: 'Tu ne peux pas te nominer toi-meme !', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const week = getWeekNumber(), year = getCurrentYear();
  const existing = await Nomination.findOne({ guildId: gid, nominatorId: interaction.user.id, type: 'singe', week, year });
  if (existing) return interaction.editReply({ content: 'Tu as deja nomine quelquun cette semaine !' });
  await Nomination.create({ guildId: gid, nominatorId: interaction.user.id, targetId: target.id, type: 'singe', week, year });
  return interaction.editReply({ content: `Vote envoye pour **${target.displayName}** !` });
}

module.exports = { nominate };
