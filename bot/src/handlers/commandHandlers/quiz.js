// src/handlers/commandHandlers/quiz.js — /quiz
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const User = require('../../db/models/User');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'classement') {
    const top = await User.find({ guildId: gid, quizWins: { $gt: 0 } }).sort({ quizWins: -1 }).limit(10);
    const lines = await Promise.all(top.map(async (u, i) => {
      const medals = ['🥇','🥈','🥉'];
      const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
      return `${medals[i] || `**${i+1}.**`} ${m?.displayName || `<@${u.userId}>`} — ${u.quizWins} victoires`;
    }));
    const embed = new EmbedBuilder().setColor(COLORS.PURPLE).setTitle('🎌 Classement Quiz Anime')
      .setDescription(lines.join('\n') || '*Aucune donnée*').setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'moi') {
    const user = await User.findOne({ userId: interaction.user.id, guildId: gid });
    return interaction.editReply({ content: `🎌 Tes stats quiz : **${user?.quizWins || 0}** victoires` });
  }
}

module.exports = { handle };
