// src/systems/counting.js — Salon "counting" : compter 1, 2, 3... à la suite
'use strict';
const Config = require('../db/models/Config');

// Extrait un nombre entier au tout début du message (ex: "42" ou "42 🎉" → 42)
function extractLeadingNumber(content) {
  const match = content.trim().match(/^(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

async function handleMessage(message, countingChannelId) {
  if (!countingChannelId) return false;
  if (message.channel.id !== countingChannelId) return false;

  const number = extractLeadingNumber(message.content);

  // Message qui ne commence pas par un nombre → supprimé (salon réservé au counting)
  if (number === null) {
    await message.delete().catch(() => {});
    return true;
  }

  const gid = message.guild.id;
  const cfg = await Config.findOne({ guildId: gid });
  const current = cfg?.countingCurrent || 0;
  const lastUserId = cfg?.countingLastUserId || null;
  const expected = current + 1;

  // Même personne ne peut pas compter deux fois de suite
  if (lastUserId && lastUserId === message.author.id) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `${message.author} tu ne peux pas compter deux fois de suite ! Le prochain nombre est **${expected}**, laisse quelqu'un d'autre le poster.`,
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);
    return true;
  }

  // Mauvais nombre → on casse le compteur, reset à 0, on supprime le message fautif
  if (number !== expected) {
    await message.delete().catch(() => {});
    const best = Math.max(cfg?.countingBestStreak || 0, current);
    await Config.updateOne({ guildId: gid }, { countingCurrent: 0, countingLastUserId: null, countingBestStreak: best });
    const fail = await message.channel.send({
      content: `💥 ${message.author} a cassé le compte à **${current}** ! Il fallait écrire **${expected}**. On recommence à **1**.`,
    }).catch(() => null);
    return true;
  }

  // Bon nombre → on met à jour le compteur
  await Config.updateOne({ guildId: gid }, { countingCurrent: expected, countingLastUserId: message.author.id });

  // Réaction sympa tous les multiples de 100
  if (expected % 100 === 0) {
    message.react('🎉').catch(() => {});
  } else {
    message.react('✅').catch(() => {});
  }

  return false;
}

module.exports = { handleMessage };
