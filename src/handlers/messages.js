// src/handlers/messages.js — Gestion des messages (XP, détections)
'use strict';
const { addXP, getOrCreate }   = require('../systems/xp');
const { handleWarTrigger }     = require('../systems/guerre');
const { checkMonkeyRule }      = require('../systems/singe');
const { detectBump }           = require('../systems/bump');
const { handleCounting }       = require('../systems/counting');
const Config     = require('../db/models/Config');
const DailyStats = require('../db/models/DailyStats');
const logger     = require('../utils/logger');
const { XP, TRIGGERS, TRIGGERS_MENTION, ANIMAL_APIS } = require('../config/constants');

// ── Cooldown animaux ──────────────────────────────────────────────────────
const ANIMAL_COOLDOWN = new Map();
const ANIMAL_CD_MS    = 15_000;

// ── Easter eggs : compteur séparé par feature + par user ─────────────────
const EASTER_TRACKERS = { feur: new Map(), sixseven: new Map() };
const EASTER_MAX      = 3;
const EASTER_CD_MS    = 5_000;

function canTrigger(userId, feature) {
  const tracker = EASTER_TRACKERS[feature];
  const now     = Date.now();
  const data    = tracker.get(userId) || { count: 0, cooldownUntil: 0 };
  if (data.cooldownUntil > now) return false;
  if (data.cooldownUntil > 0 && data.cooldownUntil <= now) { data.count = 0; data.cooldownUntil = 0; }
  data.count++;
  if (data.count >= EASTER_MAX) { data.cooldownUntil = now + EASTER_CD_MS; data.count = 0; }
  tracker.set(userId, data);
  return true;
}

// ── Handler principal ─────────────────────────────────────────────────────
async function handleMessage(message, client) {
  if (message.author.bot || !message.guild) return;

  const uid = message.author.id;
  const gid = message.guild.id;

  // ── 1. Counting — priorité absolue ───────────────────────────────────
  if (await handleCounting(message)) return;

  // ── 2. Média — priorité haute (avant tous les easter eggs) ───────────
  //    Si c'est le salon média : on vérifie, on supprime si pas de média,
  //    on crée le thread si c'est bon, puis on continue (XP quand même)
  const mediaHandled = await handleMediaChannel(message);
  if (mediaHandled === 'deleted') return; // message supprimé → on arrête tout

  // ── 3. Détections fun (uniquement hors salon média) ──────────────────
  if (!mediaHandled) {
    await handleAnimalTrigger(message);
    await handleFeur(message);
    await handleSixSeven(message);
    await handleWarTrigger(message);
  }

  // ── 4. Bump ───────────────────────────────────────────────────────────
  await detectBump(message);

  // ── 5. Règle du singe ─────────────────────────────────────────────────
  await checkMonkeyRule(message, client);

  // ── 6. Stats quotidiennes (fire & forget) ─────────────────────────────
  trackDailyStats(gid, uid);

  // ── 7. XP ────────────────────────────────────────────────────────────
  const config     = await Config.findOne({ guildId: gid });
  if (config?.xpExcludedChannels?.includes(message.channel.id)) return;

  const user       = await getOrCreate(uid, gid);
  const cooldownMs = (config?.xpCooldown || 60) * 1000;
  if (user.lastMessage && Date.now() - user.lastMessage.getTime() < cooldownMs) return;

  await addXP(uid, gid, config?.xpPerMessage || XP.PER_MESSAGE());
  user.lastMessage = new Date();
  await user.save();
}

// ── Salon Média ───────────────────────────────────────────────────────────
// Retourne :
//   'deleted'  → message supprimé (texte pur), stopper l'exécution
//   true       → média valide, thread créé, continuer (XP)
//   false      → pas le salon média, continuer normalement
async function handleMediaChannel(message) {
  const config = await Config.findOne({ guildId: message.guild.id });
  if (!config?.mediaChannelId || message.channel.id !== config.mediaChannelId) return false;

  const content = message.content.trim();

  const hasMedia =
    // Fichiers joints (images, vidéos, GIFs)
    message.attachments.size > 0 ||
    // Embeds Discord déjà chargés (images, vidéos)
    message.embeds.some(e => e.image || e.video || e.thumbnail) ||
    // URL directe vers image/vidéo
    /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv|gifv)(\?.*)?$/i.test(content) ||
    // Lien vers plateforme média connue (YouTube, TikTok, Twitter, Instagram, Twitch, etc.)
    /https?:\/\/(www\.)?(youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com|instagram\.com|imgur\.com|tenor\.com|giphy\.com|clips\.twitch\.tv|streamable\.com|medal\.tv|vimeo\.com)/i.test(content) ||
    // Message qui n'est QU'une URL (lien inconnu mais potentiellement média)
    /^https?:\/\/\S+$/.test(content);

  if (!hasMedia) {
    // Supprimer + avertir 6 secondes
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `<@${message.author.id}> ❌ Ce salon est réservé aux **photos, vidéos et liens** uniquement.\nCommente sous un média via le fil de discussion 🧵`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 6000);
    return 'deleted';
  }

  // ── Média valide → thread automatique ────────────────────────────────
  try {
    const pseudo     = message.member?.displayName || message.author.username;
    // Nom du thread : titre du contenu si disponible, sinon pseudo
    const threadName = `💬 ${pseudo}`.slice(0, 100);
    const thread     = await message.startThread({
      name: threadName,
      autoArchiveDuration: 1440,
      reason: 'Thread auto salon média',
    });
    await thread.send(`💬 Commente le média de **${pseudo}** ici !`);
  } catch (_) {}

  return true; // continuer pour l'XP
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
async function handleFeur(message) {
  if (!/quoi\s*\?+\s*$/i.test(message.content.trim())) return;
  if (!canTrigger(message.author.id, 'feur')) return;
  await message.reply('feur 🗿');
}

// ── Six-Seven ─────────────────────────────────────────────────────────────
async function handleSixSeven(message) {
  if (!/(?<![0-9])67(?![0-9])/.test(message.content)) return;
  if (!canTrigger(message.author.id, 'sixseven')) return;
  const r = ['SIX — SEVEN 🌈🦄', '6️⃣7️⃣ SIX SEVEEEEEN', '🌈 Six Seven detected 🌈', '6️⃣7️⃣'];
  await message.reply(r[Math.floor(Math.random() * r.length)]);
}

// ── Stats quotidiennes ─────────────────────────────────────────────────────
async function trackDailyStats(guildId, userId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await DailyStats.updateOne(
      { guildId, date: today },
      { $inc: { messageCount: 1 }, $addToSet: { uniqueUsers: userId } },
      { upsert: true },
    );
  } catch (_) {}
}


// ── Mention d'animal en fin de phrase ─────────────────────────────────────
// 3 triggers libres, puis 10s de cooldown par user
const MENTION_TRACKER = new Map(); // userId -> { count, cooldownUntil }
const MENTION_MAX     = 3;
const MENTION_CD_MS   = 10_000;

async function handleAnimalMention(message) {
  const config = await Config.findOne({ guildId: message.guild.id });
  if (!config?.animalMentionEnabled) return;

  const content = message.content.trim();
  if (content.split(/\s+/).length < 3) return;

  let matched = null;
  for (const [type, regex] of Object.entries(TRIGGERS_MENTION)) {
    if (regex.test(content)) { matched = type; break; }
  }
  if (!matched) return;

  const uid  = message.author.id;
  const now  = Date.now();
  const data = MENTION_TRACKER.get(uid) || { count: 0, cooldownUntil: 0 };

  // En cooldown → notifier temps restant
  if (data.cooldownUntil > now) {
    const remaining = Math.ceil((data.cooldownUntil - now) / 1000);
    const warn = await message.reply({
      content: `⏱️ Doucement ! Tu pourras spawner un animal dans **${remaining}s**.`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 4000);
    return;
  }

  // Reset si cooldown expiré
  if (data.cooldownUntil > 0 && data.cooldownUntil <= now) {
    data.count = 0;
    data.cooldownUntil = 0;
  }

  // Incrémenter — au 3ème déclencher le cooldown
  data.count++;
  if (data.count >= MENTION_MAX) {
    data.cooldownUntil = now + MENTION_CD_MS;
    data.count = 0;
  }
  MENTION_TRACKER.set(uid, data);

  try {
    const fetcher = ANIMAL_APIS[matched] || ANIMAL_APIS['dog'];
    const result  = await fetcher();
    if (!result?.image) return;
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x4CAF50)
      .setTitle(`${result.emoji} Ah un ${result.name} !`)
      .setImage(result.image)
      .setFooter({ text: `${message.member?.displayName || message.author.username} a mentionné un ${result.name.toLowerCase()} 👀` });
    await message.reply({ embeds: [embed] });
  } catch (err) {
    logger.error('AnimalMention', 'Failed', err);
  }
}

module.exports = { handleMessage };
