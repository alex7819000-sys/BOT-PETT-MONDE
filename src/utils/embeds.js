// src/utils/embeds.js — Builders d'embeds réutilisables
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../config/constants');

function base(color = COLORS.PURPLE) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

function success(title, desc) {
  return base(COLORS.GREEN).setTitle(`✅  ${title}`).setDescription(desc);
}

function error(title, desc) {
  return base(COLORS.RED).setTitle(`❌  ${title}`).setDescription(desc);
}

function king(member, weekXp, crownCount) {
  return base(COLORS.GOLD)
    .setTitle(`${EMOJIS.KING} Roi de la Semaine — ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL())
    .addFields(
      { name: 'XP cette semaine', value: `**${weekXp.toLocaleString()}** XP`, inline: true },
      { name: 'Total couronnes',  value: `**${crownCount}** ${EMOJIS.KING}`,  inline: true },
    )
    .setFooter({ text: 'Félicitations ! Prochain reset vendredi soir' });
}

function smashOrPass(subject, mode, smashCount = 0, passCount = 0) {
  const total = smashCount + passCount;
  const pct   = total ? Math.round((smashCount / total) * 100) : 0;
  const bar   = buildBar(pct);

  return base(COLORS.PINK)
    .setTitle(`${EMOJIS.SMASH} Smash or Pass — ${subject.name}`)
    .setDescription(subject.extra ? `*${subject.extra}*` : '')
    .setImage(subject.imageUrl)
    .addFields(
      { name: `${EMOJIS.SMASH} Smash`, value: `**${smashCount}**`, inline: true },
      { name: `${EMOJIS.PASS} Pass`,   value: `**${passCount}**`,  inline: true },
      { name: 'Score',                 value: `${bar} **${pct}%**`, inline: false },
    )
    .setFooter({ text: `Mode: ${modeLabel(mode)} · Votez !` });
}

function modeLabel(mode) {
  const labels = {
    'anime-auto':           '🎌 Anime auto',
    'anime-community':      '🗳️ Waifu communauté',
    'animals-auto':         '🐾 Animaux auto',
    'animals-community':    '🐶 Animaux communauté',
    'face-reveal':          '💅 Face Reveal',
  };
  return labels[mode] || mode;
}

function buildBar(pct, len = 12) {
  const filled = Math.round((pct / 100) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function profile(member, userData, level, xpInLevel, xpNeeded) {
  const bar = buildBar(Math.round((xpInLevel / xpNeeded) * 100));
  return base(COLORS.PURPLE)
    .setTitle(`Profil — ${member.displayName}`)
    .setThumbnail(member.displayAvatarURL())
    .addFields(
      { name: 'Niveau',    value: `**${level}**`,                     inline: true },
      { name: 'XP total',  value: `**${userData.totalXp.toLocaleString()}**`, inline: true },
      { name: 'XP semaine',value: `**${userData.weekXp.toLocaleString()}**`,  inline: true },
      { name: 'Progression', value: `\`${bar}\` ${xpInLevel}/${xpNeeded}`, inline: false },
      { name: 'Couronnes', value: `${userData.crownCount} ${EMOJIS.KING}`, inline: true },
      { name: 'Bumps',     value: `${userData.bumpCount} ${EMOJIS.BUMP}`,  inline: true },
    );
}

module.exports = { base, success, error, king, smashOrPass, profile, buildBar };
