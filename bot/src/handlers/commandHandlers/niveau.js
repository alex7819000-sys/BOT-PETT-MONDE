// src/handlers/commandHandlers/niveau.js — /niveau
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS }       = require('../../config/constants');
const { getEmojis }    = require('../../utils/getEmoji');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');

module.exports = async function handleNiveau(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getMember('membre') || interaction.member;
  const gid    = interaction.guild.id;

  const [user, cfg] = await Promise.all([
    User.findOne({ userId: target.id, guildId: gid }),
    Config.findOne({ guildId: gid }).lean(),
  ]);

  if (!user) return interaction.editReply({ content: `❌ **${target.displayName}** n'a pas encore d'activité sur ce serveur.` });

  const E = await getEmojis(gid, 'STAR', 'XP', 'KING', 'BUMP');

  const lvl      = user.level || 1;
  const totalXp  = user.totalXp || 0;
  const weekXp   = user.weekXp || 0;
  const xpNeeded = lvl * lvl * 100;
  const xpCurrent = user.xp || 0;
  const progress  = Math.min(Math.floor((xpCurrent / xpNeeded) * 16), 16);
  const bar       = '█'.repeat(progress) + '░'.repeat(16 - progress);

  const rank = await User.countDocuments({ guildId: gid, totalXp: { $gt: totalXp } }) + 1;

  // ── Missions du jour ────────────────────────────────────────────────────
  const missions = [
    { label: '💬 20 messages', done: (user.messagesDay || 0) >= 20,       val: `${Math.min(user.messagesDay||0,20)}/20` },
    { label: '🚀 1 bump',      done: (user.bumpDay || 0) >= 1,             val: `${user.bumpDay||0}/1` },
    { label: '🎙️ 20 min vocal',done: (user.vocalMinutesToday || 0) >= 20, val: `${Math.min(user.vocalMinutesToday||0,20)}/20` },
    { label: '📨 1 invite',    done: (user.invitesToday || 0) >= 1,        val: `${user.invitesToday||0}/1` },
    { label: '⭐ 5 réactions', done: (user.reactionsToday || 0) >= 5,      val: `${Math.min(user.reactionsToday||0,5)}/5` },
  ];
  const missionLines = missions.map(m => `${m.done ? '✅' : '❌'} ${m.label} *(${m.val})*`).join('\n');
  const mDone = missions.filter(m => m.done).length;

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(`${E.STAR} Niveau de ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: `${E.XP} Niveau`, value: `**${lvl}**`, inline: true },
      { name: '🏆 Rang',        value: `**#${rank}**`, inline: true },
      { name: `${E.KING} XP Semaine`, value: `**${weekXp.toLocaleString('fr-FR')}**`, inline: true },
      { name: `Progression vers Niv. ${lvl + 1} (${xpCurrent}/${xpNeeded} XP)`, value: `\`${bar}\`` },
      { name: `📋 Missions du jour (${mDone}/5)`, value: missionLines },
    )
    .setFooter({ text: 'Reset missions à minuit • Rôles hebdo reset dimanche' })
    .setTimestamp();

  // ── Rôles principaux (niveau permanent) ────────────────────────────────
  const levelRoles = cfg?.levelRoles || [];
  if (levelRoles.length > 0) {
    const sorted = [...levelRoles].sort((a, b) => a.level - b.level);
    const lines = sorted.map(lr => {
      const unlocked = lr.level <= lvl;
      const isNext   = !unlocked && sorted.find(x => x.level > lvl) === lr;
      if (unlocked) return `✅ **Niv. ${lr.level}** → <@&${lr.roleId}>`;
      if (isNext)   return `🔜 **Niv. ${lr.level}** → <@&${lr.roleId}> *(prochain)*`;
      return `🔒 **Niv. ${lr.level}** → <@&${lr.roleId}>`;
    }).join('\n');
    embed.addFields({ name: '🎖️ Rôles de niveau', value: lines });
  }

  // ── Rôles hebdo (weekXp) ───────────────────────────────────────────────
  const weeklyRoles = cfg?.weeklyLevelRoles || [];
  if (weeklyRoles.length > 0) {
    const sorted = [...weeklyRoles].sort((a, b) => a.level - b.level);
    const lines = sorted.map(lr => {
      const unlocked = lr.level <= weekXp;
      const isNext   = !unlocked && sorted.find(x => x.level > weekXp) === lr;
      if (unlocked) return `✅ **${lr.level.toLocaleString('fr-FR')} XP/sem** → <@&${lr.roleId}>`;
      if (isNext)   return `🔜 **${lr.level.toLocaleString('fr-FR')} XP/sem** → <@&${lr.roleId}> *(prochain — il te manque ${(lr.level - weekXp).toLocaleString('fr-FR')} XP)*`;
      return `🔒 **${lr.level.toLocaleString('fr-FR')} XP/sem** → <@&${lr.roleId}>`;
    }).join('\n');
    embed.addFields({ name: '📅 Rôles hebdomadaires *(reset dimanche)*', value: lines });
  }

  return interaction.editReply({ embeds: [embed], allowedMentions: { roles: [] } });
};
