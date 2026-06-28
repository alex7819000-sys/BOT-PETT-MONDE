// src/systems/animalTrigger.js — Détecte "woaf"/"miaou" (+ toutes leurs variantes
// avec lettres répétées : "wooooaf", "miaaaoooo"...) et "chien"/"chat" littéral.
// Réagit avec une image + bonus XP d'équipe si le membre a rejoint /guerre.
'use strict';
const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const { ANIMAL_APIS, COLORS } = require('../config/constants');
const logger = require('../utils/logger');

// Images de secours si l'API externe est indisponible (timeout, panne, réseau bloqué...)
// Comme ça le salon affiche TOUJOURS une image, jamais juste un emoji muet.
const FALLBACK_DOG_IMAGES = [
  'https://images.dog.ceo/breeds/labrador/n02099712_1083.jpg',
  'https://cdn2.thedogapi.com/images/H1Jq8d_4r.jpg',
  'https://placedog.net/500/400?random',
];
const FALLBACK_CAT_IMAGES = [
  'https://cdn2.thecatapi.com/images/9j5.jpg',
  'https://cataas.com/cat?type=square',
  'https://placecats.com/500/400',
];
function pickFallback(isDog) {
  const list = isDog ? FALLBACK_DOG_IMAGES : FALLBACK_CAT_IMAGES;
  return list[Math.floor(Math.random() * list.length)];
}

// Construit un regex qui tolère n'importe quel nombre de répétitions de chaque lettre
// (et rend la toute dernière lettre optionnelle, car l'élongation orale la fait parfois disparaître).
// Ex: "woaf" → /w+o+a+(?:f+)?/  → matche "woaf", "wooooooaf", "woooa", etc.
function elongated(word) {
  const chars = word.split('');
  const lastIdx = chars.length - 1;
  return chars
    .map((c, i) => {
      const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return i === lastIdx ? `(?:${esc}+)?` : `${esc}+`;
    })
    .join('');
}

function buildRegex(words) {
  const parts = words.map((w) => elongated(w));
  return new RegExp(`\\b(?:${parts.join('|')})\\b`, 'i');
}

const DOG_WORDS = ['ouaf', 'ouah', 'woaf', 'waf', 'wouaf', 'woof', 'chien'];
const CAT_WORDS = ['miaou', 'miaow', 'miaw', 'miau', 'meow', 'chat'];

const DOG_REGEX = buildRegex(DOG_WORDS);
const CAT_REGEX = buildRegex(CAT_WORDS);

// Cooldown anti-spam par membre
const cooldowns = new Map();
const COOLDOWN_MS = 8_000;
function onCooldown(userId) {
  const last = cooldowns.get(userId);
  const now = Date.now();
  if (last && now - last < COOLDOWN_MS) return true;
  cooldowns.set(userId, now);
  if (cooldowns.size > 1000) {
    for (const [uid, t] of cooldowns) if (now - t > COOLDOWN_MS) cooldowns.delete(uid);
  }
  return false;
}

async function reactWithAnimal(message, type, config) {
  const isDog = type === 'dog';
  let imageUrl;
  try {
    const result = await (isDog ? ANIMAL_APIS.dog() : ANIMAL_APIS.cat());
    imageUrl = result.image;
  } catch (err) {
    // On log l'erreur réelle (timeout, API down, réseau bloqué...) pour pouvoir diagnostiquer
    logger.warn('AnimalTrigger', `API ${isDog ? 'dog.ceo' : 'thecatapi'} indisponible : ${err.message}`);
    imageUrl = pickFallback(isDog);
  }
  try {
    const embed = new EmbedBuilder()
      .setColor(isDog ? 0x8B4513 : COLORS.PINK)
      .setTitle(isDog ? '🐶 WOAF !' : '🐱 MIAOU !')
      .setImage(imageUrl)
      .setFooter({ text: isDog ? '🐶 Team Chien • /guerre pour rejoindre !' : '🐱 Team Chat • /guerre pour rejoindre !' });
    await message.channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('AnimalTrigger', `Impossible de poster l'embed : ${err.message}`);
    await message.react(isDog ? '🐶' : '🐱').catch(() => {});
  }

  // Bonus XP d'équipe si le membre a rejoint la guerre chien vs chat
  const team = isDog ? 'dog' : 'cat';
  const user = await User.findOne({ userId: message.author.id, guildId: message.guild.id }).catch(() => null);
  if (user?.team === team) {
    await User.updateOne(
      { userId: message.author.id, guildId: message.guild.id },
      { $inc: { teamXp: 5 } }
    ).catch(() => {});
  }
}

async function handleMessage(message, client) {
  if (!message.guild || message.author.bot || !message.content) return false;

  const config = await Config.findOne({ guildId: message.guild.id }).lean().catch(() => null);
  if (!config?.animalTriggerChannelId) return false; // désactivé tant qu'aucun salon n'est configuré
  if (message.channel.id !== config.animalTriggerChannelId) return false;

  if (onCooldown(message.author.id)) return false;

  if (DOG_REGEX.test(message.content)) {
    await reactWithAnimal(message, 'dog', config);
    return true;
  }
  if (CAT_REGEX.test(message.content)) {
    await reactWithAnimal(message, 'cat', config);
    return true;
  }
  cooldowns.delete(message.author.id); // pas de trigger → on ne consomme pas le cooldown
  return false;
}

module.exports = { handleMessage, DOG_REGEX, CAT_REGEX };
