// bot/src/systems/levelUp.js — Système de level up amélioré avec embed détaillé
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../config/constants');

// Messages de félicitations personnalisés basés sur le niveau
const CONGRATULATIONS = [
  (name, level) => `Félicitations ${name}! Tu viens de passer niveau ${level}, bientôt une vraie star!`,
  (name, level) => `Wow ${name}! Niveau ${level} c'est du lourd, continue comme ça!`,
  (name, level) => `${name} vient de monter niveau ${level}! 🎉 Un vrai roi en devenir!`,
  (name, level) => `${name} >> Niveau ${level} atteint! T'es sur la bonne voie! 👑`,
  (name, level) => `Respect ${name}! Niveau ${level}, tu domines! 💪`,
];

// Calcule le XP nécessaire pour atteindre un niveau
function xpForLevel(level) {
  return Math.pow(level / 0.1, 2);
}

// Calcule le pourcentage de progression vers le prochain niveau
function calculateProgress(totalXp, currentLevel) {
  const xpForCurrent = xpForLevel(currentLevel);
  const xpForNext = xpForLevel(currentLevel + 1);
  const xpInCurrentLevel = totalXp - xpForCurrent;
  const xpNeededInLevel = xpForNext - xpForCurrent;
  return Math.min(100, Math.round((xpInCurrentLevel / xpNeededInLevel) * 100));
}

// Affiche un message court + un embed détaillé quand quelqu'un level up
async function handleLevelUp(message, newLevel, user) {
  try {
    const cfg = await require('../db/models/Config').findOne({ guildId: message.guild.id }).lean().catch(() => null);
    const levelUpChannelId = cfg?.levelUpChannelId || cfg?.rankChannelId;
    const ch = levelUpChannelId ? message.guild.channels.cache.get(levelUpChannelId) : message.channel;

    if (!ch) return;

    // 1️⃣ Message court sympathique (comme dans l'image 1)
    const congratsIndex = Math.floor(Math.random() * CONGRATULATIONS.length);
    const congratsMsg = CONGRATULATIONS[congratsIndex](
      `<@${message.author.id}>`,
      newLevel
    );
    
    // Envoie le message court
    await ch.send({
      content: `🎉 ${congratsMsg}`,
      allowedMentions: { parse: [] } // Pas de vraie mention pour ne pas déranger
    }).catch(() => {});

    // 2️⃣ Embed détaillé (comme dans l'image 2)
    const totalXp = user.totalXp || 0;
    const progress = calculateProgress(totalXp, newLevel);
    const xpForNext = xpForLevel(newLevel + 1);
    const xpInNextLevel = totalXp - xpForLevel(newLevel);
    const xpNeeded = Math.max(0, xpForNext - totalXp);

    // Barre de progression visuelle
    const barLength = 20;
    const filledLength = Math.round((progress / 100) * barLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setAuthor({
        name: `${message.author.username}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('🏆 LEVEL UP! 🏆')
      .addFields(
        { name: '📊 Nouveau niveau', value: `**${newLevel}**`, inline: true },
        { name: '⭐ XP Total', value: `**${totalXp.toLocaleString('fr-FR')} XP**`, inline: true },
        { name: '💪 Progression vers niveau suivant', value: `**${progress}%**\n\`${progressBar}\``, inline: false },
        { name: '📈 XP manquants', value: `**${xpNeeded.toLocaleString('fr-FR')} XP**`, inline: true },
      )
      .setFooter({ text: new Date().toLocaleString('fr-FR') })
      .setTimestamp();

    // Envoie l'embed
    await ch.send({ embeds: [embed] }).catch(() => {});

  } catch (err) {
    console.error('Erreur handleLevelUp:', err);
  }
}

module.exports = { handleLevelUp };
