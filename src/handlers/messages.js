// src/handlers/messages.js — Gestion des messages (XP, détections)
'use strict';
const { addXP, getOrCreate } = require('../systems/xp');
const { handleWarTrigger }   = require('../systems/guerre');
const { checkMonkeyRule }    = require('../systems/singe');
const { detectBump }         = require('../systems/bump');
const { getLevelFromXP }     = require('../systems/xp');
const Config  = require('../db/models/Config');
const logger  = require('../utils/logger');
const { XP, TRIGGERS, ANIMAL_APIS } = require('../config/constants');

const ANIMAL_COOLDOWN = new Map(); // `${uid}:${guildId}` → timestamp
const ANIMAL_CD_MS    = 15_000;

async function handleMessage(message, client) {
  if (message.author.bot || !message.guild) return;

  const uid = message.author.id;
  const gid = message.guild.id;

  // ── Détection bump Disboard ───────────────────────────────────────────
  await detectBump(message);

  // ── Règle du singe ────────────────────────────────────────────────────
  await checkMonkeyRule(message, client);

  // ── Guerre chien vs chat ──────────────────────────────────────────────
  await handleWarTrigger(message);

  // ── Détection mots animaux ────────────────────────────────────────────
  await handleAnimalTrigger(message);

  // ── XP ───────────────────────────────────────────────────────────────
  const config = await Config.findOne({ guildId: gid });
  if (config?.xpExcludedChannels?.includes(message.channel.id)) return;

  const user = await getOrCreate(uid, gid);
  const cooldownMs = (config?.xpCooldown || 60) * 1000;
  if (user.lastMessage && Date.now() - user.lastMessage.getTime() < cooldownMs) return;

  await addXP(uid, gid, config?.xpPerMessage || XP.PER_MESSAGE());
  user.lastMessage = new Date();
  await user.save();
}

async function handleAnimalTrigger(message) {
  const content = message.content.toLowerCase();
  const uid = message.author.id;
  const gid = message.guild.id;
  const key  = `${uid}:${gid}`;

  // Cooldown
  if (ANIMAL_COOLDOWN.get(key) && Date.now() - ANIMAL_COOLDOWN.get(key) < ANIMAL_CD_MS) return;

  let animalType = null;
  for (const [type, words] of Object.entries(TRIGGERS)) {
    if (words.some(w => content.includes(w))) { animalType = type; break; }
  }
  if (!animalType) return;

  ANIMAL_COOLDOWN.set(key, Date.now());

  try {
    const fetcher = ANIMAL_APIS[animalType] || ANIMAL_APIS['dog'];
    const result  = await fetcher();
    if (!result?.image) return;

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x4CAF50)
      .setTitle(`${result.emoji} ${result.name} aléatoire !`)
      .setImage(result.image)
      .setFooter({ text: `Demandé par ${message.author.displayName || message.author.username}` });

    await message.reply({ embeds: [embed] });
  } catch (err) {
    logger.error('Animals', 'Trigger failed', err);
  }
}

module.exports = { handleMessage };
