// src/handlers/commandHandlers/xp.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getOrCreate, xpProgress, getTopUsers, getUserRank } = require('../../systems/xp');
const { COLORS, EMOJIS } = require('../../config/constants');

async function handle(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('membre') || interaction.user;
  const gid    = interaction.guild.id;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.followUp({ content: '❌ Membre introuvable.', ephemeral: true });

  const userData = await getOrCreate(target.id, gid);
  const { level, current, needed } = xpProgress(userData.totalXp);
  const pct  = Math.round((current / needed) * 100);
  const bar  = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  const rank = await getUserRank(target.id, gid);

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle(`${EMOJIS.XP} Profil — ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Niveau',        value: `**${level}**`,                            inline: true },
      { name: 'XP Total',      value: `**${userData.totalXp.toLocaleString()}**`, inline: true },
      { name: 'XP Semaine',    value: `**${userData.weekXp.toLocaleString()}**`,  inline: true },
      { name: 'Rang semaine',  value: rank ? `**#${rank.rank}**` : 'N/A',         inline: true },
      { name: 'Couronnes',     value: `${userData.crownCount} ${EMOJIS.KING}`,   inline: true },
      { name: 'Bumps',         value: `${userData.bumpCount} ${EMOJIS.BUMP}`,    inline: true },
      { name: 'Progression',   value: `\`${bar}\` ${current}/${needed} XP (${pct}%)`, inline: false },
      ...(userData.guildeId ? [{ name: 'Guilde', value: `\`${userData.guildeId}\``, inline: true }] : []),
      ...(userData.team ? [{ name: 'Équipe', value: userData.team === 'dog' ? '🐶 Chiens' : '🐱 Chats', inline: true }] : []),
      ...(userData.otakuLevel && userData.otakuLevel !== 'none' ? [{ name: 'Otaku', value: userData.otakuLevel, inline: true }] : []),
    )
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

async function classement(interaction) {
  await interaction.deferReply();
  const gid  = interaction.guild.id;
  const top  = await getTopUsers(gid, 10, 'weekXp');

  const lines = await Promise.all(top.map(async (u, i) => {
    const member = await interaction.guild.members.fetch(u.userId).catch(() => null);
    const name   = member?.displayName || `<@${u.userId}>`;
    const medals = ['🥇','🥈','🥉'];
    return `${medals[i] || `**${i+1}.**`} ${name} — **${u.weekXp.toLocaleString()}** XP`;
  }));

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${EMOJIS.KING} Classement XP — Semaine en cours`)
    .setDescription(lines.join('\n') || '*Aucun membre actif cette semaine*')
    .setTimestamp()
    .setFooter({ text: 'Reset chaque vendredi à 20h' });

  await interaction.followUp({ embeds: [embed] });
}

module.exports = { handle, classement };
