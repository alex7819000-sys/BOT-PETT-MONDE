// src/handlers/commandHandlers/top.js — /top : top 10 classement simple et direct
'use strict';
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const User = require('../../db/models/User');
const { getUserRank } = require('../../systems/xp');
const { COLORS } = require('../../config/constants');

function rankBadge(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `**#${rank}**`;
}

const TYPE_CONFIG = {
  totalXp:    { label: 'XP Total',       emoji: '⭐', suffix: 'XP'         },
  weekXp:     { label: 'XP Semaine',     emoji: '📅', suffix: 'XP'         },
  crownCount: { label: 'Couronnes King', emoji: '👑', suffix: 'couronnes'  },
  bumpCount:  { label: 'Bumps',          emoji: '🚀', suffix: 'bumps'      },
};

module.exports = async function handleTop(interaction) {
  await interaction.deferReply();

  const type = interaction.options.getString('type') || 'weekXp';
  const cfg  = TYPE_CONFIG[type] || TYPE_CONFIG.weekXp;
  const gid  = interaction.guild.id;

  const top = await User.find({ guildId: gid, [cfg.label === 'XP Semaine' ? 'weekXp' : type === 'weekXp' ? 'weekXp' : type]: { $gt: 0 } })
    .sort({ [type]: -1 }).limit(10);

  const selfData = await User.findOne({ userId: interaction.user.id, guildId: gid });
  const selfRank = await getUserRank(interaction.user.id, gid, type);

  const lines = await Promise.all(top.map(async (u, i) => {
    const m    = await interaction.guild.members.fetch(u.userId).catch(() => null);
    const name = m?.displayName || `<@${u.userId}>`;
    const val  = (u[type] || 0).toLocaleString('fr-FR');
    const self = u.userId === interaction.user.id ? '  ← **toi**' : '';
    return `${rankBadge(i + 1)}  ${name} — \`${val} ${cfg.suffix}\`${self}`;
  }));

  // Ajoute le rang de l'utilisateur s'il est hors top 10
  let selfLine = '';
  if (selfRank && selfRank.rank > 10 && selfData) {
    const val = (selfData[type] || 0).toLocaleString('fr-FR');
    selfLine = `\n┄┄┄┄┄┄┄┄┄┄┄┄\n**#${selfRank.rank}**  toi — \`${val} ${cfg.suffix}\``;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD || 0xFFD700)
    .setTitle(`${cfg.emoji} Top 10 — ${cfg.label}`)
    .setDescription((lines.join('\n') || '*Personne dans ce classement*') + selfLine)
    .setThumbnail(interaction.guild.iconURL())
    .setTimestamp()
    .setFooter({ text: `${interaction.guild.memberCount} membres · /niveau pour voir ton profil` });

  // Menu pour changer de classement
  const menu = new StringSelectMenuBuilder()
    .setCustomId('leaderboard:type')
    .setPlaceholder('Changer de classement…')
    .addOptions(Object.entries(TYPE_CONFIG).map(([val, c]) => ({
      label: c.label, value: val, emoji: c.emoji, default: val === type,
    })));

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.editReply({ embeds: [embed], components: [row] });
};
