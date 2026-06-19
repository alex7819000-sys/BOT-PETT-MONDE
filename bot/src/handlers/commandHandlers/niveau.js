// src/handlers/commandHandlers/niveau.js — /niveau
'use strict';
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const { getEmojis } = require('../../utils/getEmoji');
const User = require('../../db/models/User');

module.exports = async function handleNiveau(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('membre') || interaction.member;
  const gid = interaction.guild.id;
  const user = await User.findOne({ userId: target.id, guildId: gid });

  if (!user) return interaction.editReply({ content: `❌ **${target.displayName}** n'a pas encore d'activité sur ce serveur.` });

  const E = await getEmojis(interaction.guild.id, 'STAR', 'XP', 'KING', 'BUMP');

  const lvl = user.level || 1;
  const xpNeeded = lvl * lvl * 100;
  const xpCurrent = user.xp || 0;
  const progress = Math.min(Math.floor((xpCurrent / xpNeeded) * 16), 16);
  const bar = '█'.repeat(progress) + '░'.repeat(16 - progress);

  const rank = await User.countDocuments({ guildId: gid, totalXp: { $gt: user.totalXp } }) + 1;

  const missions = [
    { label: '💬 20 messages', done: (user.messagesDay || 0) >= 20,        val: `${Math.min(user.messagesDay||0,20)}/20` },
    { label: '🚀 1 bump',      done: (user.bumpDay || 0) >= 1,              val: `${user.bumpDay||0}/1` },
    { label: '🎙️ 20 min vocal',done: (user.vocalMinutesToday || 0) >= 20,  val: `${Math.min(user.vocalMinutesToday||0,20)}/20` },
    { label: '📨 1 invite',    done: (user.invitesToday || 0) >= 1,         val: `${user.invitesToday||0}/1` },
    { label: '⭐ 5 réactions', done: (user.reactionsToday || 0) >= 5,       val: `${Math.min(user.reactionsToday||0,5)}/5` },
  ];
  const missionLines = missions.map(m => `${m.done ? '✅' : '❌'} ${m.label} *(${m.val})*`).join('\n');
  const mDone = missions.filter(m => m.done).length;

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${E.STAR} Niveau de ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: `${E.XP} Niveau`, value: `${lvl}`, inline: true },
      { name: '🏆 Rang', value: `#${rank}`, inline: true },
      { name: `${E.KING} XP Semaine`, value: `${user.weekXp?.toLocaleString() || 0}`, inline: true },
      { name: `Progression (${xpCurrent}/${xpNeeded} XP)`, value: `\`${bar}\`` },
      { name: `📋 Missions du jour (${mDone}/5)`, value: missionLines },
    )
    .setFooter({ text: 'Reset à minuit chaque jour' })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
};
