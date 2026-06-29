// src/handlers/commandHandlers/top.js — /top
'use strict';
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const User = require('../../db/models/User');

module.exports = async function handleTop(interaction) {
  await interaction.deferReply();
  const type = interaction.options.getString('type') || 'weekXp';
  const gid  = interaction.guild.id;

  const labels = {
    weekXp:     { title: '📅 Top XP Semaine',      field: 'weekXp',     suffix: ' XP' },
    totalXp:    { title: '⭐ Top XP Total',         field: 'totalXp',    suffix: ' XP' },
    crownCount: { title: '👑 Top Couronnes King',   field: 'crownCount', suffix: ' couronnes' },
    bumpCount:  { title: '🚀 Top Bumpeurs',         field: 'bumpCount',  suffix: ' bumps' },
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

  // Rang de l'utilisateur
  const userRank = await User.countDocuments({ guildId: gid, [cfg.field]: { $gt: (await User.findOne({ userId: interaction.user.id, guildId: gid }))?.[cfg.field] || 0 } }) + 1;

  const select = new StringSelectMenuBuilder().setCustomId('top:switch').setPlaceholder('Changer le classement').addOptions(
    new StringSelectMenuOptionBuilder().setLabel('📅 XP Semaine').setValue('weekXp').setDefault(type === 'weekXp'),
    new StringSelectMenuOptionBuilder().setLabel('⭐ XP Total').setValue('totalXp').setDefault(type === 'totalXp'),
    new StringSelectMenuOptionBuilder().setLabel('👑 Couronnes King').setValue('crownCount').setDefault(type === 'crownCount'),
    new StringSelectMenuOptionBuilder().setLabel('🚀 Bumps').setValue('bumpCount').setDefault(type === 'bumpCount'),
  );
  const row = new ActionRowBuilder().addComponents(select);

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`🏆 ${cfg.title}`)
    .setDescription(lines.join('\n') || '*Aucune donnée*')
    .setFooter({ text: `Ton rang : #${userRank}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed], components: [row] });
};
