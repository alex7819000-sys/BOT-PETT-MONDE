// src/systems/aiChat.js — Chat IA via l'API Gemini (gratuite). Le bot répond quand
// on le mentionne (@bot) ou qu'on dit son nom déclencheur dans un message.
// Garde en mémoire (en RAM, pas en base) le fil récent de chaque salon pour des
// réponses qui tiennent compte du contexte — remise à zéro si le bot redémarre,
// ce qui est très bien pour ce genre de chat casual.
'use strict';

const axios = require('axios');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_HISTORY_TURNS = 10; // ~10 échanges (20 messages) gardés par salon
const MAX_REPLY_CHARS = 1800; // marge sous la limite Discord de 2000
const RPM_LIMIT = 12; // marge de sécurité sous la vraie limite Gemini (15/min) — évite les erreurs 429 si plusieurs membres spamment en même temps

// channelId → [{ role: 'user'|'model', parts: [{ text }] }]
const memory = new Map();
// Horodatages des derniers appels à l'API (tous salons confondus) — pour respecter le 15/min de Gemini
const recentCalls = [];

function canCallNow() {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 60_000) recentCalls.shift();
  if (recentCalls.length >= RPM_LIMIT) return false;
  recentCalls.push(now);
  return true;
}

function getHistory(channelId) {
  if (!memory.has(channelId)) memory.set(channelId, []);
  return memory.get(channelId);
}

function pushToHistory(channelId, role, text) {
  const hist = getHistory(channelId);
  hist.push({ role, parts: [{ text }] });
  while (hist.length > MAX_HISTORY_TURNS * 2) hist.shift();
}

// ── Le message mentionne-t-il le bot, ou dit-il son nom déclencheur ? ──────
function isTriggered(message, client, triggerName) {
  if (message.mentions.has(client.user.id)) return true;
  if (!triggerName) return false;
  const regex = new RegExp(`\\b${triggerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(message.content);
}

// ── Vérifie/incrémente le quota journalier — marge de sécurité sous la limite Gemini ──
async function checkAndConsumeQuota(guildId, cfg) {
  const today = new Date().toISOString().slice(0, 10);
  if (cfg.aiChatUsageDate !== today) {
    await Config.updateOne({ guildId }, { aiChatUsageDate: today, aiChatUsageToday: 1 });
    return true;
  }
  if ((cfg.aiChatUsageToday || 0) >= (cfg.aiChatDailyLimit || 200)) return false;
  await Config.updateOne({ guildId }, { $inc: { aiChatUsageToday: 1 } });
  return true;
}

function buildSystemInstruction(guild) {
  return (
    `Tu es le bot officiel du serveur Discord "${guild.name}". Tu discutes avec les membres ` +
    `de façon familière et fun, comme un membre du serveur — pas comme un robot d'assistance. ` +
    `Utilise un langage décontracté, quelques emojis si ça vient naturellement, et reste bref ` +
    `(2-4 phrases maximum, on est sur Discord, pas dans un roman). Tu peux avoir de l'humour et ` +
    `un peu de répondant, sans jamais être méchant ou insultant envers un membre en particulier. ` +
    `Ne prétends jamais être humain si on te le demande directement — assume que t'es une IA, ` +
    `mais avec ta propre personnalité sur ce serveur.`
  );
}

// ── Erreur "temporaire" côté Google (surcharge, timeout) → vaut le coup de réessayer.
// Une 404 (mauvais modèle) ou 400 (requête invalide) ne changera pas au 2e essai.
function isRetryable(err) {
  const status = err?.response?.status;
  if (status === 503 || status === 429) return true; // surcharge / rate limit Google
  if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) return true; // timeout réseau
  return false;
}

async function callGemini(channelId, guild, attempt = 1) {
  const MAX_ATTEMPTS = 5;
  try {
    return await axios.post(
      `${API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: getHistory(channelId),
        systemInstruction: { parts: [{ text: buildSystemInstruction(guild) }] },
        generationConfig: { maxOutputTokens: 300, temperature: 0.9 },
      },
      { timeout: 25_000 }
    );
  } catch (err) {
    if (attempt < MAX_ATTEMPTS && isRetryable(err)) {
      logger.warn('AIChat', `Tentative ${attempt} échouée (${err?.response?.status || err.message}), retry dans ${attempt}s...`);
      await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s, 8s de pause croissante avant de réessayer
      return callGemini(channelId, guild, attempt + 1);
    }
    throw err;
  }
}

async function handleAIChat(message, client) {
  if (message.author.bot || !message.guild) return false;
  if (!process.env.GEMINI_API_KEY) return false;

  const cfg = await Config.findOne({ guildId: message.guild.id }).lean().catch(() => null);
  if (!cfg?.aiChatTriggerName && !message.mentions.has(client.user.id)) return false;
  if (cfg?.aiChatChannelId && message.channel.id !== cfg.aiChatChannelId) return false; // hors du salon défini
  if (!isTriggered(message, client, cfg?.aiChatTriggerName)) return false;

  if (!canCallNow()) {
    await message.reply('😅 Doucement, on me parle un peu trop vite là — laisse-moi quelques secondes et réessaie.').catch(() => {});
    return true;
  }

  const allowed = await checkAndConsumeQuota(message.guild.id, cfg || {});
  if (!allowed) {
    await message.reply('😴 J\'ai atteint ma limite de discussions pour aujourd\'hui (quota gratuit) — reviens demain !').catch(() => {});
    return true;
  }

  await message.channel.sendTyping().catch(() => {});
  // Discord arrête l'indicateur "en train d'écrire" après ~10s — on le relance
  // en continu tant que les tentatives (potentiellement plusieurs, avec pauses) durent.
  const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 8_000);

  const channelId = message.channel.id;
  const userText = message.content.replace(/<@!?\d+>/g, '').trim() || 'Salut !';
  pushToHistory(channelId, 'user', `${message.member?.displayName || message.author.username} dit : ${userText}`);

  try {
    const response = await callGemini(channelId, message.guild);

    let reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) {
      logger.warn('AIChat', 'Réponse Gemini vide', JSON.stringify(response.data).slice(0, 300));
      return true;
    }
    if (reply.length > MAX_REPLY_CHARS) reply = reply.slice(0, MAX_REPLY_CHARS) + '…';

    pushToHistory(channelId, 'model', reply);
    await message.reply(reply).catch(() => {});
  } catch (err) {
    logger.error('AIChat', 'Erreur appel Gemini (après retries)', err?.response?.data || err.message);
    const msg = isRetryable(err)
      ? '😴 Les serveurs de Google sont surchargés là — j\'ai réessayé plusieurs fois sans succès. Retente dans une minute.'
      : '😵 J\'ai eu un souci pour répondre, réessaie dans un instant.';
    await message.reply(msg).catch(() => {});
  } finally {
    clearInterval(typingInterval);
  }

  return true;
}

module.exports = { handleAIChat };
