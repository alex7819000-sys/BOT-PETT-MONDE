// src/systems/bumpDetect.js — Détecte les bumps réussis (Disboard), donne de l'XP
// et poste un embed personnalisable (configurable depuis le dashboard).
'use strict';
const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const User = require('../db/models/User');

// ID stable et connu du bot Disboard (ne change pas)
const DISBOARD_BOT_ID = '302050872383242240';

// Les réponses d'échec (cooldown) mentionnent presque toujours une durée d'attente,
// quelle que soit la langue — c'est plus fiable que de chercher un mot de succès exact
// (le texte exact de Disboard peut changer selon les mises à jour/la langue du serveur).
const FAILURE_HINTS = /wait|attendre|patien|cooldown|encore\s*\d|heures?\s*(restantes?|et)|minutes?\s*(restantes?|et)/i;

function fillPlaceholders(str, data) {
  if (!str) return str;
  return str
    .replace(/\{user\}/g, `<@${data.userId}>`)
    .replace(/\{username\}/g, data.username)
    .replace(/\{xp\}/g, data.xp)
    .replace(/\{totalBumps\}/g, data.totalBumps)
    .replace(/\{servername\}/g, data.serverName);
}

function parseColor(hex) {
  if (!hex) return 0x00D165;
  const n = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(n) ? 0x00D165 : n;
}

async function handleMessage(message, client) {
  if (message.author.id !== DISBOARD_BOT_ID) return false;
  if (!message.guild) return false;

  // On ne traite que les réponses au slash command /bump (Disboard répond aussi à d'autres commandes)
  if (message.interaction && message.interaction.commandName !== 'bump') return false;

  const embedText = message.embeds?.[0]?.description || message.content || '';
  if (FAILURE_HINTS.test(embedText)) return false; // c'est un message de cooldown, pas un succès

  // Qui a bumpé ? Discord expose l'auteur de la commande via message.interaction.user
  const bumper = message.interaction?.user;
  if (!bumper) return false; // impossible d'identifier qui a bumpé → on ne peut pas créditer l'XP

  const gid = message.guild.id;
  const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);
  const { getCountingXpMultiplier } = require('./countingLeaderboard');
  const xpMultiplier = await getCountingXpMultiplier(bumper.id, gid).catch(() => 1);
  const xpReward = Math.round((cfg?.bumpXpReward ?? 500) * xpMultiplier);

  // Incrémente les compteurs de bump + l'XP (et par plateforme)
  const updated = await User.findOneAndUpdate(
    { userId: bumper.id, guildId: gid },
    {
      $inc: { bumpCount: 1, bumpDisboard: 1, bumpWeek: 1, bumpDay: 1, xp: xpReward, totalXp: xpReward, weekXp: xpReward, dailyXp: xpReward },
      $set: { username: bumper.username },
    },
    { upsert: true, new: true }
  );

  // Vérifie le level up (même formule que le gain d'XP classique dans index.js)
  const newLevel = Math.floor(0.1 * Math.sqrt(updated.totalXp));
  let leveledUp = false;
  if (newLevel > (updated.level || 0)) {
    await User.updateOne({ userId: bumper.id, guildId: gid }, { level: newLevel });
    leveledUp = true;
  }

  // Construit l'embed de remerciement (personnalisable via le dashboard, sinon valeurs par défaut)
  const placeholderData = {
    userId: bumper.id,
    username: bumper.username,
    xp: xpReward,
    totalBumps: updated.bumpCount,
    serverName: message.guild.name,
  };

  const title = fillPlaceholders(cfg?.bumpEmbedTitle, placeholderData) || '🚀 Bump effectué !';
  const description = fillPlaceholders(cfg?.bumpEmbedDescription, placeholderData)
    || `Merci {user} pour le bump ! Tu gagnes **{xp} XP** 🎉\nTotal de bumps : **{totalBumps}**`.replace(/\{user\}/g, `<@${bumper.id}>`).replace(/\{xp\}/g, xpReward).replace(/\{totalBumps\}/g, updated.bumpCount);

  const embed = new EmbedBuilder()
    .setColor(parseColor(cfg?.bumpEmbedColor))
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (cfg?.bumpEmbedFooter) embed.setFooter({ text: fillPlaceholders(cfg.bumpEmbedFooter, placeholderData) });
  if (cfg?.bumpEmbedImageUrl) embed.setImage(cfg.bumpEmbedImageUrl);
  if (cfg?.bumpEmbedThumbnailUrl) embed.setThumbnail(cfg.bumpEmbedThumbnailUrl);
  if (!cfg?.bumpEmbedThumbnailUrl) embed.setThumbnail(bumper.displayAvatarURL?.() || null);

  const targetChannel = cfg?.bumpChannelId
    ? message.guild.channels.cache.get(cfg.bumpChannelId)
    : message.channel;
  if (targetChannel) await targetChannel.send({ embeds: [embed] }).catch(() => {});

  if (leveledUp && targetChannel) {
    await targetChannel.send({ content: `🎉 <@${bumper.id}> grâce à ce bump, tu passes **niveau ${newLevel}** !` }).catch(() => {});
  }

  return true;
}

module.exports = { handleMessage, DISBOARD_BOT_ID, FAILURE_HINTS };
