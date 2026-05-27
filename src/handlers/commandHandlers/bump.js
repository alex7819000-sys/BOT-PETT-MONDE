// src/handlers/commandHandlers/bump.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getBumpLeaderboard } = require('../../systems/bump');
const { COLORS, EMOJIS } = require('../../config/constants');

async function handle(interaction) {
  await interaction.deferReply();
  const top   = await getBumpLeaderboard(interaction.guild.id);
  const lines = await Promise.all(top.map(async (u, i) => {
    const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
    return `**${i + 1}.** ${m?.displayName || `<@${u.userId}>`} — **${u.bumpCount}** bumps`;
  }));
  const embed = new EmbedBuilder().setColor(COLORS.BLUE).setTitle(`${EMOJIS.BUMP} Classement Bumps`)
    .setDescription(lines.join('\n') || '*Personne n\'a bumpe cette semaine*').setTimestamp();
  await interaction.followUp({ embeds: [embed] });
}

module.exports = { handle };
