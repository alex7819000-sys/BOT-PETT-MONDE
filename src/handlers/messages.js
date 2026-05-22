// src/handlers/messages.js — Gestion des messages (XP, détections)
'use strict';
const { addXP, getOrCreate } = require('../systems/xp');
const { handleWarTrigger }   = require('../systems/guerre');
const { checkMonkeyRule }    = require('../systems/singe');
const { detectBump }         = require('../systems/bump');
const Config     = require('../db/models/Config');
const DailyStats       = require('../db/models/DailyStats');
const { handleCounting } = require('../systems/counting');
const logger  = require('../utils/logger');
const { XP, TRIGGERS, ANIMAL_APIS } = require('../config/constants');

// ── Cooldown animaux ──────────────────────────────────────────────────────
const ANIMAL_COOLDOWN = new Map();
const ANIMAL_CD_MS    = 15_000;

// ── Easter eggs : compteur séparé par feature + par user ─────────────────
// 3 triggers libres, puis 5s de cooldown — indépendant entre feur et six-seven
const EASTER_TRACKERS = { feur: new Map(), sixseven: new Map() };
const EASTER_MAX      = 3;
const EASTER_CD_MS    = 5_000;

function canTrigger(userId, feature) {
  const tracker = EASTER_TRACKERS[feature];
  const now     = Date.now();
  const data    = tracker.get(userId) || { count: 0, cooldownUntil: 0 };

  // Encore en cooldown
  if (data.cooldownUntil > now) return false;

  // Cooldown expiré → reset propre
  if (data.cooldownUntil > 0 && data.cooldownUntil <= now) {
    data.count = 0;
    data.cooldownUntil = 0;
  }

  data.count++;
  if (data.count >= EASTER_MAX) {
    data.cooldownUntil = now + EASTER_CD_MS;
    data.count = 0;
  }
  tracker.set(userId, data);
  return true;
}

// ── Handler principal ─────────────────────────────────────────────────────
async function handleMessage(message, client) {
  if (message.author.bot || !message.guild) return;

  const uid = message.author.id;
  const gid = message.guild.id;

  // ── Counting — priorité max, on gère et on arrête si c'est le salon counting
  if (await handleCounting(message)) return;

  await detectBump(message);
  await checkMonkeyRule(message, client);
  await handleWarTrigger(message);
  await handleAnimalTrigger(message);
  await handleFeur(message);
  await handleSixSeven(message);
  if (await handleMediaChannel(message)) return; // salon média → on arrête là
  trackDailyStats(message.guild.id, message.author.id); // async fire-and-forget

  // ── XP ────────────────────────────────────────────────────────────────
  const config     = await Config.findOne({ guildId: gid });
  if (config?.xpExcludedChannels?.includes(message.channel.id)) return;

  const user       = await getOrCreate(uid, gid);
  const cooldownMs = (config?.xpCooldown || 60) * 1000;
  if (user.lastMessage && Date.now() - user.lastMessage.getTime() < cooldownMs) return;

  await addXP(uid, gid, config?.xpPerMessage || XP.PER_MESSAGE());
  user.lastMessage = new Date();
  await user.save();
}

// ── Détection animaux ─────────────────────────────────────────────────────
async function handleAnimalTrigger(message) {
  const content = message.content.toLowerCase();
  const key     = `animal:${message.author.id}:${message.guild.id}`;

  if (ANIMAL_COOLDOWN.get(key) && Date.now() - ANIMAL_COOLDOWN.get(key) < ANIMAL_CD_MS) return;

  let animalType = null;
  for (const [type, words] of Object.entries(TRIGGERS)) {
    if (words.some(w => content.includes(w))) { animalType = type; break; }
  }
  if (!animalType) return;

  ANIMAL_COOLDOWN.set(key, Date.now());

  try {
    const result = await (ANIMAL_APIS[animalType] || ANIMAL_APIS['dog'])();
    if (!result?.image) return;
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x4CAF50)
      .setTitle(`${result.emoji} ${result.name} aléatoire !`)
      .setImage(result.image)
      .setFooter({ text: `Demandé par ${message.member?.displayName || message.author.username}` });
    await message.reply({ embeds: [embed] });
  } catch (err) {
    logger.error('Animals', 'Trigger failed', err);
  }
}

// ── Feur ──────────────────────────────────────────────────────────────────
// Détecte "quoi ?" en fin de message (insensible casse, espaces tolerés)
async function handleFeur(message) {
  if (!/quoi\s*\?+\s*$/i.test(message.content.trim())) return;
  if (!canTrigger(message.author.id, 'feur')) return;
  await message.reply('feur 🗿');
}

// ── Six-Seven ─────────────────────────────────────────────────────────────
// Détecte "67" isolé (pas 167, 670, etc.)
async function handleSixSeven(message) {
  if (!/(?<![0-9])67(?![0-9])/.test(message.content)) return;
  if (!canTrigger(message.author.id, 'sixseven')) return;
  const r = ['SIX — SEVEN 🌈🦄', '6️⃣7️⃣ SIX SEVEEEEEN', '🌈 Six Seven detected 🌈', '6️⃣7️⃣'];
  await message.reply(r[Math.floor(Math.random() * r.length)]);
}



// ── Tracking stats quotidiennes ───────────────────────────────────────────
async function trackDailyStats(guildId, userId) {
  try {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    await DailyStats.updateOne(
      { guildId, date: today },
      {
        $inc: { messageCount: 1 },
        $addToSet: { uniqueUsers: userId },
      },
      { upsert: true },
    );
  } catch (_) {}
}

// ── Salon Média — photo/vidéo uniquement + thread auto ────────────────────
async function handleMediaChannel(message) {
  const config = await Config.findOne({ guildId: message.guild.id });
  if (!config?.mediaChannelId || message.channel.id !== config.mediaChannelId) return false;

  const hasMedia = message.attachments.size > 0 ||
    message.embeds.some(e => e.image || e.video) ||
    /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv)(\?|$)/i.test(message.content);

  if (!hasMedia) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `<@${message.author.id}> ❌ Ce salon est réservé aux **photos et vidéos** uniquement. Commente sous le média dans le fil de discussion ! 🧵`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 6000);
    return true;
  }

  // Média valide → créer un thread automatiquement
  try {
    const pseudo = message.member?.displayName || message.author.username;
    const threadName = `💬 ${pseudo}`;
    const thread = await message.startThread({
      name: threadName.slice(0, 100),
      autoArchiveDuration: 1440, // 24h
      reason: 'Thread auto salon média',
    });
    await thread.send(`💬 Commente le média de **${pseudo}** ici !`);
  } catch (_) {}

  return false; // on continue pour donner l'XP
}

module.exports = { handleMessage };
