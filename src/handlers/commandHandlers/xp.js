// src/handlers/commandHandlers/xp.js — Profil + Classement optimisé
'use strict';
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getOrCreate, xpProgress, getTopUsers, getUserRank } = require('../../systems/xp');
const User    = require('../../db/models/User');
const Guilde  = require('../../db/models/Guilde');
const { COLORS, EMOJIS } = require('../../config/constants');

// ── Helpers visuels ───────────────────────────────────────────────────────

function xpBar(pct, len = 16) {
  const fill = Math.round((pct / 100) * len);
  return '`' + '▰'.repeat(fill) + '▱'.repeat(len - fill) + '`';
}

function rankBadge(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `**#${rank}**`;
}

function teamLabel(team) {
  if (team === 'dog') return '🐶 Chiens';
  if (team === 'cat') return '🐱 Chats';
  return '—';
}

function otakuLabel(lvl) {
  const map = { weeb: '🎌 Weeb', otaku: '⚔️ Otaku', senpai: '👑 Senpai', sensei: '🐉 Sensei' };
  return map[lvl] || '—';
}

// ── /profil ───────────────────────────────────────────────────────────────

async function handle(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('membre') || interaction.user;
  const gid    = interaction.guild.id;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.followUp({ content: '❌ Membre introuvable.', ephemeral: true });

  const [userData, weekRank, totalRank] = await Promise.all([
    getOrCreate(target.id, gid),
    getUserRank(target.id, gid, 'weekXp'),
    getUserRank(target.id, gid, 'totalXp'),
  ]);

  const { level, current, needed } = xpProgress(userData.totalXp);
  const pct  = needed > 0 ? Math.round((current / needed) * 100) : 100;
  const bar  = xpBar(pct);

  // Guilde
  let guildeInfo = '—';
  if (userData.guildeId) {
    const g = await Guilde.findOne({ guildId: gid, guildeId: userData.guildeId });
    if (g) guildeInfo = `${g.emoji} ${g.name}${g.leaderId === target.id ? ' *(Chef)*' : ''}`;
  }

  // Boost actif ?
  const hasBoost = userData.xpBoostUntil && userData.xpBoostUntil > new Date();

  const embed = new EmbedBuilder()
    .setColor(member.displayColor || COLORS.PURPLE)
    .setAuthor({ name: `Profil de ${member.displayName}`, iconURL: member.displayAvatarURL({ size: 64 }) })
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    // Niveau + progression
    .addFields(
      {
        name: `${EMOJIS.XP} Niveau ${level}${hasBoost ? '  *(×2 XP actif !)*' : ''}`,
        value: `${bar} ${pct}%\n${current.toLocaleString('fr-FR')} / ${needed.toLocaleString('fr-FR')} XP pour le niveau ${level + 1}`,
        inline: false,
      },
    )
    // Stats XP
    .addFields(
      { name: '⭐ XP total',       value: `**${userData.totalXp.toLocaleString('fr-FR')}**`, inline: true },
      { name: '📅 XP semaine',     value: `**${userData.weekXp.toLocaleString('fr-FR')}**`,  inline: true },
      { name: '🌍 Rang semaine',   value: weekRank  ? rankBadge(weekRank.rank)  : '—',        inline: true },
      { name: '🏅 Rang total',     value: totalRank ? rankBadge(totalRank.rank) : '—',        inline: true },
      { name: `${EMOJIS.KING} Couronnes`,  value: `**${userData.crownCount}**`,    inline: true },
      { name: `${EMOJIS.BUMP} Bumps`,      value: `**${userData.bumpCount}**`,     inline: true },
    )
    // Identité serveur
    .addFields(
      { name: '🏰 Guilde',         value: guildeInfo,                   inline: true },
      { name: '⚔️ Équipe',         value: teamLabel(userData.team),      inline: true },
      { name: '🎌 Otaku',          value: otakuLabel(userData.otakuLevel), inline: true },
    );

  // Badges spéciaux
  const badges = [];
  if (userData.isKing)   badges.push('👑 Roi actuel');
  if (userData.isMonkey) badges.push(`🐒 Singe (${userData.monkeyFaults} faute(s))`);
  if (userData.quizWins >= 20) badges.push('🐉 Sensei Légendaire');
  if (userData.crownCount >= 5) badges.push('👑 Vétéran King');
  if (badges.length) embed.addFields({ name: '🎖️ Badges', value: badges.join(' · '), inline: false });

  embed.setFooter({ text: `ID: ${target.id}` }).setTimestamp();

  // Bouton comparer
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`profile:compare:${target.id}`)
      .setLabel('⚔️ Comparer avec quelqu\'un')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.followUp({ embeds: [embed], components: [row] });
}

// ── /classement ───────────────────────────────────────────────────────────

async function classement(interaction) {
  await interaction.deferReply();
  const gid = interaction.guild.id;

  // Par défaut : XP semaine. Menu pour changer de type.
  const type = interaction.options.getString('type') || 'weekXp';
  await sendLeaderboard(interaction, gid, type);
}

async function sendLeaderboard(interaction, gid, type) {
  const typeConfig = {
    weekXp:    { label: 'XP Semaine',     emoji: '📅', field: 'weekXp',    suffix: 'XP' },
    totalXp:   { label: 'XP Total',       emoji: '⭐', field: 'totalXp',   suffix: 'XP' },
    crownCount:{ label: 'Couronnes King', emoji: '👑', field: 'crownCount', suffix: '👑' },
    bumpCount: { label: 'Bumps',          emoji: '🚀', field: 'bumpCount',  suffix: 'bumps' },
    quizWins:  { label: 'Quiz Anime',     emoji: '🎌', field: 'quizWins',   suffix: 'victoires' },
    teamXp:    { label: 'Guerre Animale', emoji: '⚔️', field: 'teamXp',    suffix: 'pts' },
  };

  const cfg = typeConfig[type] || typeConfig.weekXp;
  const top = await User.find({ guildId: gid, [cfg.field]: { $gt: 0 } })
    .sort({ [cfg.field]: -1 }).limit(10);

  const self     = await User.findOne({ userId: interaction.user.id, guildId: gid });
  const selfRank = await getUserRank(interaction.user.id, gid, cfg.field);

  const lines = await Promise.all(top.map(async (u, i) => {
    const member = await interaction.guild.members.fetch(u.userId).catch(() => null);
    const name   = member?.displayName || `<@${u.userId}>`;
    const val    = (u[cfg.field] || 0).toLocaleString('fr-FR');
    const isSelf = u.userId === interaction.user.id ? ' ← *toi*' : '';
    return `${rankBadge(i + 1)} **${name}** — ${val} ${cfg.suffix}${isSelf}`;
  }));

  // Ajouter le rang de l'utilisateur s'il est hors top 10
  let selfLine = '';
  if (selfRank && selfRank.rank > 10 && self) {
    const val = (self[cfg.field] || 0).toLocaleString('fr-FR');
    selfLine = `\n*…*\n**#${selfRank.rank}** toi — ${val} ${cfg.suffix}`;
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${cfg.emoji} Classement — ${cfg.label}`)
    .setDescription((lines.join('\n') || '*Aucun membre actif*') + selfLine)
    .setThumbnail(interaction.guild.iconURL())
    .setTimestamp()
    .setFooter({ text: `Serveur : ${interaction.guild.memberCount} membres` });

  // Menu pour switcher de type
  const menu = new StringSelectMenuBuilder()
    .setCustomId('leaderboard:type')
    .setPlaceholder('Changer de classement…')
    .addOptions(Object.entries(typeConfig).map(([val, c]) => ({
      label: c.label, value: val, emoji: c.emoji,
      default: val === type,
    })));

  const row = new ActionRowBuilder().addComponents(menu);

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], components: [row] });
  } else {
    await interaction.update({ embeds: [embed], components: [row] });
  }
}

module.exports = { handle, classement, sendLeaderboard };
