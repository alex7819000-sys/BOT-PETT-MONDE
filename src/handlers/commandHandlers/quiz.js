// src/handlers/commandHandlers/quiz.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getQuizLeaderboard } = require('../../systems/quiz');
const User = require('../../db/models/User');
const { COLORS, EMOJIS } = require('../../config/constants');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'classement') {
    await interaction.deferReply();
    const top   = await getQuizLeaderboard(interaction.guild.id);
    const lines = await Promise.all(top.map(async (u, i) => {
      const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
      return `**${i + 1}.** ${m?.displayName || `<@${u.userId}>`} — ${u.quizWins} victoires · ${u.otakuLevel}`;
    }));
    const embed = new EmbedBuilder().setColor(COLORS.TEAL).setTitle(`${EMOJIS.ANIME} Classement Quiz Anime`)
      .setDescription(lines.join('\n') || '*Aucun joueur*').setTimestamp();
    return interaction.followUp({ embeds: [embed] });
  }
  if (sub === 'moi') {
    await interaction.deferReply({ ephemeral: true });
    const user = await User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
    const embed = new EmbedBuilder().setColor(COLORS.TEAL).setTitle('📊 Mes stats Quiz')
      .addFields(
        { name: 'Victoires', value: `${user?.quizWins || 0}`, inline: true },
        { name: 'Niveau Otaku', value: user?.otakuLevel || 'aucun', inline: true },
      );
    return interaction.followUp({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { handle };
