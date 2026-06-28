// src/handlers/commandHandlers/rk.js — /rk (rank public style Statbot)
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const { getEmojis } = require('../../utils/getEmoji');

async function handle(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('membre') || interaction.member;
  const User = require('../../db/models/User');
  const user = await User.findOne({ userId: target.id, guildId: interaction.guild.id });

  if (!user) {
    return interaction.editReply({ content: `❌ **${target.displayName}** n'a pas encore d'XP sur ce serveur.` });
  }

  const totalUsers = await User.countDocuments({ guildId: interaction.guild.id, totalXp: { $gt: 0 } });
  const rank = await User.countDocuments({ guildId: interaction.guild.id, totalXp: { $gt: user.totalXp } }) + 1;
  const E = await getEmojis(interaction.guild.id, 'STAR', 'XP', 'WIN', 'KING', 'BUMP');

  const lvl = user.level || 1;
  const xpNeeded = lvl * lvl * 100;
  const xpCurrent = user.xp || 0;
  const progress = Math.min(Math.floor((xpCurrent / xpNeeded) * 20), 20);
  const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${E.STAR} Profil de ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: `${E.WIN} Rang`,      value: `#${rank} / ${totalUsers}`,   inline: true },
      { name: `${E.XP} Niveau`,     value: `${lvl}`,                      inline: true },
      { name: `${E.STAR} XP Total`, value: `${user.totalXp?.toLocaleString() || 0}`, inline: true },
      { name: '📅 XP Semaine',      value: `${user.weekXp?.toLocaleString() || 0}`, inline: true },
      { name: `${E.KING} Couronnes`,value: `${user.crownCount || 0}`,  inline: true },
      { name: `${E.BUMP} Bumps`,    value: `${user.bumpCount || 0}`,    inline: true },
      { name: `Progression niveau (${xpCurrent}/${xpNeeded} XP)`, value: `\`${bar}\`` },
    )
    .setFooter({ text: `${interaction.guild.name}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

module.exports = { handle };
