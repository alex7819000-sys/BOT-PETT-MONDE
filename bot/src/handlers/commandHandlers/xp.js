// src/handlers/commandHandlers/xp.js — /xp, /profil, /classement
'use strict';
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const { getEmojis } = require('../../utils/getEmoji');
const User = require('../../db/models/User');

async function handle(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('membre') || interaction.member;
  const gid = interaction.guild.id;

  const user = await User.findOne({ userId: target.id, guildId: gid });
  if (!user) return interaction.editReply({ content: `❌ **${target.displayName}** n'a pas encore d'XP sur ce serveur.` });

  const E = await getEmojis(gid, 'STAR', 'XP', 'WIN', 'KING', 'BUMP');
  const totalUsers = await User.countDocuments({ guildId: gid, totalXp: { $gt: 0 } });
  const rank = await User.countDocuments({ guildId: gid, totalXp: { $gt: user.totalXp } }) + 1;

  const lvl = user.level || 1;
  const xpNeeded = lvl * lvl * 100;
  const xpCurrent = user.xp || 0;
  const progress = Math.min(Math.floor((xpCurrent / xpNeeded) * 20), 20);
  const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);

  const teamLine = user.team
    ? `${user.team === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat'} — ${(user.teamXp || 0).toLocaleString()} XP`
    : 'Aucune équipe';

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${E.STAR} Profil de ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: `${E.WIN} Rang`,        value: `#${rank} / ${totalUsers}`,              inline: true },
      { name: `${E.XP} Niveau`,       value: `${lvl}`,                                 inline: true },
      { name: `${E.STAR} XP Total`,   value: `${user.totalXp?.toLocaleString() || 0}`, inline: true },
      { name: '📅 XP Semaine',        value: `${user.weekXp?.toLocaleString()  || 0}`, inline: true },
      { name: `${E.KING} Couronnes`,  value: `${user.crownCount || 0}`,                inline: true },
      { name: `${E.BUMP} Bumps`,      value: `${user.bumpCount  || 0}`,                inline: true },
      { name: '⚔️ Guerre',            value: teamLine,                                  inline: false },
      { name: `Progression (${xpCurrent}/${xpNeeded} XP)`, value: `\`${bar}\`` },
    )
    .setFooter({ text: interaction.guild.name })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function classement(interaction) {
  await interaction.deferReply();
  const type = interaction.options.getString('type') || 'weekXp';
  const gid  = interaction.guild.id;

  const labels = {
    weekXp:     { title: '📅 Top XP Semaine',       field: 'weekXp',     suffix: ' XP' },
    totalXp:    { title: '⭐ Top XP Total',          field: 'totalXp',    suffix: ' XP' },
    crownCount: { title: '👑 Top Couronnes King',    field: 'crownCount', suffix: ' couronnes' },
    bumpCount:  { title: '🚀 Top Bumpeurs',          field: 'bumpCount',  suffix: ' bumps' },
    quizWins:   { title: '🎌 Top Quiz Anime',        field: 'quizWins',   suffix: ' victoires' },
    teamXp:     { title: '⚔️ Top Guerre Animale',   field: 'teamXp',     suffix: ' XP équipe' },
  };

  const cfg = labels[type] || labels.weekXp;
  const top = await User.find({ guildId: gid, [cfg.field]: { $gt: 0 } })
    .sort({ [cfg.field]: -1 }).limit(10);

  const medals = ['🥇','🥈','🥉'];
  const lines = await Promise.all(top.map(async (u, i) => {
    const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
    const name = m?.displayName || `<@${u.userId}>`;
    return `${medals[i] || `**${i+1}.**`} ${name} — ${(u[cfg.field] || 0).toLocaleString()}${cfg.suffix}`;
  }));

  const userDoc = await User.findOne({ userId: interaction.user.id, guildId: gid });
  const userRank = await User.countDocuments({ guildId: gid, [cfg.field]: { $gt: userDoc?.[cfg.field] || 0 } }) + 1;

  const options = Object.entries(labels).map(([val, l]) =>
    new StringSelectMenuOptionBuilder().setLabel(l.title).setValue(val).setDefault(type === val)
  );
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('classement:switch').setPlaceholder('Changer le classement').addOptions(options)
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`🏆 ${cfg.title}`)
    .setDescription(lines.join('\n') || '*Aucune donnée*')
    .setFooter({ text: `Ton rang : #${userRank}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], components: [row] });
}

module.exports = { handle, classement };
