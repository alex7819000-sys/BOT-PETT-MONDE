// src/systems/faction.js — Bataille Chien vs Chat, en toute liberté :
// - N'importe qui écrit "chien" ou "chat" (+ variantes/onomatopées) → point compté direct
// - Pas de clan à rejoindre, pas de rôle attribué, pas de restriction
// - Cooldown 5s par membre pour éviter le spam de points
// - Image postée à chaque trigger
// - Classement auto quotidien + reset hebdo dimanche
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config  = require('../db/models/Config');
const User    = require('../db/models/User');
const Faction = require('../db/models/Faction');
const { ANIMAL_APIS, COLORS } = require('../config/constants');
const logger  = require('../utils/logger');

const COOLDOWN_MS = 5_000; // 5s par membre

// ── Cooldowns en mémoire ───────────────────────────────────────────────────
const cooldowns = new Map(); // userId → timestamp dernier point
function onCooldown(userId) {
  const now  = Date.now();
  const last = cooldowns.get(userId);
  if (last && now - last < COOLDOWN_MS) return true;
  cooldowns.set(userId, now);
  // nettoyage mémoire
  if (cooldowns.size > 2000) {
    for (const [id, t] of cooldowns) if (now - t > COOLDOWN_MS * 10) cooldowns.delete(id);
  }
  return false;
}

// ── Regex élongée (wooooof, miaaaou…) ──────────────────────────────────────
function elongated(word) {
  return word.split('').map((c, i, arr) => {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return i === arr.length - 1 ? `(?:${esc}+)?` : `${esc}+`;
  }).join('');
}
function buildRegex(keyword) {
  return new RegExp(`\\b${elongated(keyword)}\\b`, 'i');
}

const KEYWORDS = {
  chien: ['ouaf', 'ouah', 'woaf', 'waf', 'wouaf', 'woof', 'chien'],
  chat:  ['miaou', 'miaow', 'miaw', 'miau', 'meow', 'chat'],
};
const NAMES = { chien: 'Chien', chat: 'Chat' };
const EMOJIS = { chien: '🐶', chat: '🐱' };

// ── Initialise chien + chat par défaut si pas encore en DB ────────────────
async function ensureDefaults(guildId) {
  for (const keyword of ['chien', 'chat']) {
    const exists = await Faction.findOne({ guildId, keyword }).lean();
    if (!exists) {
      await Faction.create({ guildId, name: NAMES[keyword], keyword, emoji: EMOJIS[keyword], isDefault: true });
    }
  }
}

// ── Handler principal : appelé sur chaque message dans le salon bataille ──
async function handleMessage(message) {
  if (!message.guild || message.author.bot || !message.content) return false;

  const config = await Config.findOne({ guildId: message.guild.id }).lean().catch(() => null);
  if (!config?.animalTriggerChannelId) return false;
  if (message.channel.id !== config.animalTriggerChannelId) return false;

  await ensureDefaults(message.guild.id);

  const text = message.content.toLowerCase();

  // Trouver si "chien" ou "chat" (ou variantes) est présent
  let triggeredKeyword = null;
  for (const [keyword, variants] of Object.entries(KEYWORDS)) {
    for (const v of variants) {
      if (buildRegex(v).test(text)) { triggeredKeyword = keyword; break; }
    }
    if (triggeredKeyword) break;
  }
  if (!triggeredKeyword) return false;

  const userId  = message.author.id;
  const guildId = message.guild.id;

  // Libre pour tout le monde : ça compte à chaque fois (juste anti-spam via cooldown)
  if (!onCooldown(userId)) {
    // Multiplicateur "happy hour" actif ? (voir cron startFactionMultiplierEvents)
    const multiplier = (config.factionMultiplierUntil && new Date(config.factionMultiplierUntil) > new Date())
      ? (config.factionMultiplierValue || 1)
      : 1;

    await Faction.updateOne(
      { guildId, keyword: triggeredKeyword },
      { $inc: { points: multiplier }, lastActivity: new Date() }
    );

    // Compteur perso (pour le classement des membres)
    const countField = triggeredKeyword === 'chien' ? 'battleChienCount' : 'battleChatCount';
    await User.updateOne({ userId, guildId }, { $inc: { [countField]: 1 } }, { upsert: true });
  }

  // Poster l'image
  const faction = { name: NAMES[triggeredKeyword], keyword: triggeredKeyword, emoji: EMOJIS[triggeredKeyword] };
  await postFactionImage(message, faction, config);
  return true;
}

async function postFactionImage(message, faction, config) {
  try {
    const isDog = faction.keyword === 'chien';
    const result = await (isDog ? ANIMAL_APIS.dog() : ANIMAL_APIS.cat());
    const imageUrl = result?.image || null;

    const color = faction.keyword === 'chien' ? 0x8B4513 : 0xFF73FA;

    // Barre de pourcentage Chien vs Chat — le duel principal, toujours affiché
    const [chien, chat] = await Promise.all([
      Faction.findOne({ guildId: message.guild.id, keyword: 'chien' }).lean().catch(() => null),
      Faction.findOne({ guildId: message.guild.id, keyword: 'chat' }).lean().catch(() => null),
    ]);
    const chienPts = chien?.points ?? 0;
    const chatPts  = chat?.points ?? 0;
    const total    = chienPts + chatPts;
    const chienPct = total > 0 ? Math.round((chienPts / total) * 100) : 50;
    const chatPct  = total > 0 ? 100 - chienPct : 50;
    const bar = (pct) => '▓'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    const duel = `🐶 ${bar(chienPct)} ${chienPct}%\n🐱 ${bar(chatPct)} ${chatPct}%`;

    // Multiplicateur "happy hour" actif ?
    const multiplierActive = config?.factionMultiplierUntil && new Date(config.factionMultiplierUntil) > new Date();
    const multiplierLine = multiplierActive ? `\n\n🔥 **BONUS ×${config.factionMultiplierValue} ACTIF !**` : '';

    const score = faction.keyword === 'chien' ? chienPts : chatPts;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${faction.emoji} ${faction.name.toUpperCase()} !${multiplierActive ? ' 🔥' : ''}`)
      .setDescription(
        `**${message.member?.displayName || message.author.username}** crie pour la faction **${faction.name}** !\n\n` +
        `${duel}\n\n` +
        `📊 Score ${faction.name} : **${score} points**` +
        multiplierLine
      );

    if (imageUrl) embed.setImage(imageUrl);

    await message.channel.send({ embeds: [embed] });
  } catch (err) {
    // Fallback silencieux — pas de réaction parasite
    console.error('[Faction] postFactionImage error:', err?.message);
  }
}

// ── Multiplicateur "happy hour" aléatoire — de temps en temps, un bonus de points
// s'active sur la bataille pour quelques dizaines de minutes. Appelé par un cron
// toutes les heures avec une chance modeste de se déclencher (voir index.js).
async function maybeTriggerMultiplierEvent(client) {
  const CHANCE = 0.15;      // ~15% de chance par heure → en moyenne 2-3 fois par jour
  const VALUES = [2, 3, 5]; // paliers de multiplicateur possibles
  const DURATION_MIN = [20, 30, 45, 60];

  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id }).lean();
      if (!cfg?.animalTriggerChannelId) continue;

      // Déjà un bonus actif → on ne superpose pas un 2e événement
      if (cfg.factionMultiplierUntil && new Date(cfg.factionMultiplierUntil) > new Date()) continue;

      if (Math.random() > CHANCE) continue;

      const value    = VALUES[Math.floor(Math.random() * VALUES.length)];
      const minutes  = DURATION_MIN[Math.floor(Math.random() * DURATION_MIN.length)];
      const until    = new Date(Date.now() + minutes * 60 * 1000);

      await Config.updateOne({ guildId: guild.id }, { factionMultiplierValue: value, factionMultiplierUntil: until });

      const channel = guild.channels.cache.get(cfg.animalTriggerChannelId);
      if (channel) {
        const ping = cfg.bataillePingRoleId ? `<@&${cfg.bataillePingRoleId}> ` : '';
        await channel.send({
          content: ping || undefined,
          embeds: [new EmbedBuilder()
            .setColor(0xFF4500)
            .setTitle('🔥 BONUS SURPRISE !')
            .setDescription(
              `Pendant les **${minutes} prochaines minutes**, chaque "chien" ou "chat" écrit rapporte **×${value} points** !\n\n` +
              `Fonce en profiter avant que ça s'arrête ⏳`
            )]
        }).catch(() => {});
      }
      logger.info('Faction', `Bonus ×${value} (${minutes}min) déclenché sur ${guild.name}`);
    } catch (err) {
      logger.error('Faction', `Erreur déclenchement bonus (${guild.id})`, err);
    }
  }
}

// ── Classement quotidien (score chien/chat + top membres) ─────────────────
async function postDailyLeaderboard(guild, channelId) {
  const factions = await Faction.find({ guildId: guild.id }).sort({ points: -1 }).lean();
  if (!factions.length) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const medals = ['🥇', '🥈', '🥉'];
  const lines = factions.map((f, i) =>
    `${medals[i] || `**${i + 1}.**`} ${f.emoji} **${f.name}** — ${f.points} pts${f.totalWins ? ` *(${f.totalWins} victoire${f.totalWins > 1 ? 's' : ''})*` : ''}`
  );

  // Top membres (tous mots confondus)
  const topMembers = await User.find({ guildId: guild.id, $or: [{ battleChienCount: { $gt: 0 } }, { battleChatCount: { $gt: 0 } }] })
    .lean();
  const topSorted = topMembers
    .map(u => ({ ...u, total: (u.battleChienCount || 0) + (u.battleChatCount || 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const topLines = topSorted.length
    ? topSorted.map((u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.userId}> — 🐶 ${u.battleChienCount || 0} · 🐱 ${u.battleChatCount || 0}`).join('\n')
    : 'Aucun participant pour l\'instant.';

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('⚔️ Classement Bataille — Chien vs Chat')
    .setDescription(lines.join('\n') + '\n\n👑 **Top membres**\n' + topLines + '\n\n💡 *Écris "chien" ou "chat" pour faire gagner des points à ton camp !*')
    .setFooter({ text: 'Reset dimanche minuit' })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ── Reset hebdo (dimanche) ────────────────────────────────────────────────
async function weeklyReset(guild) {
  // Trouver le gagnant
  const winner = await Faction.findOne({ guildId: guild.id }).sort({ points: -1 }).lean();

  if (winner && winner.points > 0) {
    await Faction.updateOne(
      { guildId: guild.id, keyword: winner.keyword },
      { $inc: { totalWins: 1 } }
    );

    // Annoncer le gagnant
    const config = await Config.findOne({ guildId: guild.id }).lean();
    const channelId = config?.animalTriggerChannelId || config?.announceChannelId;
    if (channelId) {
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle('👑 Faction victorieuse de la semaine !')
          .setDescription(`${winner.emoji} **${winner.name}** remporte la semaine avec **${winner.points} points** !`)
          .setFooter({ text: 'Nouveau round — les compteurs sont remis à zéro !' })
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  // Reset points de la semaine (les compteurs perso battleChienCount/battleChatCount restent en cumul total)
  await Faction.updateMany({ guildId: guild.id }, { points: 0 });
}

module.exports = {
  handleMessage,
  postDailyLeaderboard,
  weeklyReset,
  ensureDefaults,
  maybeTriggerMultiplierEvent,
};
