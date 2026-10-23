// dashboard/lib/discordApi.js — Tous les appels à l'API REST Discord utilisés par le dashboard
'use strict';
const axios = require('axios');

const API = 'https://discord.com/api/v10';
const ADMINISTRATOR = 0x8n;

function botClient() {
  return axios.create({
    baseURL: API,
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    timeout: 10000,
  });
}

// ─────────────────────────────────────────────
// Cache mémoire simple (évite de spam l'API Discord à chaque clic)
// ─────────────────────────────────────────────
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}
function invalidate(prefix) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

// ─────────────────────────────────────────────
// Appels avec le TOKEN DU BOT
// ─────────────────────────────────────────────
async function getBotGuilds() {
  return cached('bot:guilds', 60_000, async () => {
    const { data } = await botClient().get('/users/@me/guilds');
    return data;
  });
}

async function getGuild(guildId) {
  return cached(`guild:${guildId}`, 15_000, async () => {
    const { data } = await botClient().get(`/guilds/${guildId}?with_counts=true`);
    return data;
  });
}

async function getGuildChannels(guildId) {
  return cached(`channels:${guildId}`, 15_000, async () => {
    const { data } = await botClient().get(`/guilds/${guildId}/channels`);
    return data;
  });
}

async function getGuildRoles(guildId) {
  return cached(`roles:${guildId}`, 15_000, async () => {
    const { data } = await botClient().get(`/guilds/${guildId}/roles`);
    return data;
  });
}

async function getGuildEmojis(guildId) {
  return cached(`emojis:${guildId}`, 30_000, async () => {
    const { data } = await botClient().get(`/guilds/${guildId}/emojis`);
    return data;
  });
}

async function getGuildMember(guildId, userId) {
  try {
    const { data } = await botClient().get(`/guilds/${guildId}/members/${userId}`);
    return data;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Appels avec le TOKEN UTILISATEUR (OAuth2)
// ─────────────────────────────────────────────
async function getUser(accessToken) {
  const { data } = await axios.get(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function getUserGuilds(accessToken) {
  const { data } = await axios.get(`${API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

async function exchangeCode(code) {
  const params = new URLSearchParams({
    client_id: process.env.DASHBOARD_CLIENT_ID,
    client_secret: process.env.DASHBOARD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.DASHBOARD_REDIRECT_URI,
  });
  const { data } = await axios.post(`${API}/oauth2/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data; // { access_token, refresh_token, expires_in, ... }
}

// ─────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────
function isGuildAdmin(guildSummary) {
  if (!guildSummary) return false;
  if (guildSummary.owner) return true;
  try {
    return (BigInt(guildSummary.permissions) & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

// Types de salons Discord
const CHANNEL_TYPES = {
  GUILD_TEXT: 0,
  GUILD_VOICE: 2,
  GUILD_CATEGORY: 4,
  GUILD_NEWS: 5,
  GUILD_STAGE_VOICE: 13,
  GUILD_FORUM: 15,
};

function iconUrl(guild) {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}
function avatarUrl(user) {
  if (!user.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
}

module.exports = {
  getBotGuilds, getGuild, getGuildChannels, getGuildRoles, getGuildEmojis, getGuildMember, sendMessage,
  getUser, getUserGuilds, exchangeCode,
  isGuildAdmin, invalidate, CHANNEL_TYPES, iconUrl, avatarUrl,
};

// ─────────────────────────────────────────────
// Envoi de messages (pour les tests dashboard)
// ─────────────────────────────────────────────
async function sendMessage(channelId, payload) {
  // payload = { content?, embeds?, files? }
  const { data } = await botClient().post(`/channels/${channelId}/messages`, payload);
  return data;
}

