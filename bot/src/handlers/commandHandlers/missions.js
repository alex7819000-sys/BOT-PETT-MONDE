// src/handlers/commandHandlers/missions.js — /missions
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const User = require('../../db/models/User');

module.exports = async function handleMissions(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getMember('membre') || interaction.member;
  const gid = interaction.guild.id;
  const user = await User.findOne({ userId: target.id, guildId: gid });

  const daily = user?.dailyMissions || {};
  const missions = [
    { label: '💬 Envoyer 20 messages',  done: (user?.messagesDay || 0) >= 20,   progress: `${Math.min(user?.messagesDay||0,20)}/20` },
    { label: '🚀 Bumper 1 fois',        done: (user?.bumpDay || 0) >= 1,         progress: `${Math.min(user?.bumpDay||0,1)}/1` },
    { label: '🎙️ 20 min en vocal',      done: (user?.vocalMinutesToday||0) >= 20, progress: `${Math.min(user?.vocalMinutesToday||0,20)}/20` },
    { label: '📨 Inviter 1 membre',     done: (user?.invitesToday||0) >= 1,       progress: `${Math.min(user?.invitesToday||0,1)}/1` },
    { label: '⭐ Réagir 5 messages',    done: (user?.reactionsToday||0) >= 5,     progress: `${Math.min(user?.reactionsToday||0,5)}/5` },
  ];

  const completed = missions.filter(m => m.done).length;
  const lines = missions.map(m => `${m.done ? '✅' : '❌'} ${m.label} *(${m.progress})*`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(completed === 5 ? COLORS.GREEN : COLORS.PURPLE)
    .setTitle(`📋 Missions du jour — ${target.displayName}`)
    .setDescription(lines)
    .addFields({ name: '🏅 Progression', value: `**${completed}/5** missions complétées` })
    .setFooter({ text: 'Reset à minuit • Fais /niveau pour voir tes défis actifs' })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
};
