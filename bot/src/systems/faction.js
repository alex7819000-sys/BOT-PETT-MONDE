// src/systems/faction.js — Système de factions custom + chien/chat par défaut
// - Premier mot-clé écrit dans le salon = faction assignée pour la semaine
// - Cooldown 5s par membre pour les points
// - Image postée à chaque trigger
// - 4 slots custom max + chien/chat indestructibles
// - Classement auto quotidien + reset hebdo dimanche
// - Factions inactives 7 jours supprimées auto
'use strict';

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Config  = require('../db/models/Config');
const User    = require('../db/models/User');
const Faction = require('../db/models/Faction');
const { ANIMAL_APIS, COLORS } = require('../config/constants');

const MAX_CUSTOM_FACTIONS = 4;
const COOLDOWN_MS         = 5_000;   // 5s par membre
const INACTIVITY_DAYS     = 7;
const XP_COST_CREATE      = 500;

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

// Cache des factions par guild pour éviter une requête DB à chaque message
const factionCache = new Map(); // guildId → { factions, builtAt }
const CACHE_TTL = 30_000; // 30s

async function getFactions(guildId) {
  const cached = factionCache.get(guildId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL) return cached.factions;
  const factions = await Faction.find({ guildId }).lean().catch(() => []);
  factionCache.set(guildId, { factions, builtAt: Date.now() });
  return factions;
}

function invalidateCache(guildId) {
  factionCache.delete(guildId);
}

// ── Regex élongée (wooooof, miaaaou, sigmaaaa…) ───────────────────────────
function elongated(word) {
  return word.split('').map((c, i, arr) => {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return i === arr.length - 1 ? `(?:${esc}+)?` : `${esc}+`;
  }).join('');
}
function buildRegex(keyword) {
  return new RegExp(`\\b${elongated(keyword)}\\b`, 'i');
}

// ── Initialise chien + chat par défaut si pas encore en DB ────────────────
async function ensureDefaults(guildId) {
  const defaults = [
    { name: 'Chien', keyword: 'chien', emoji: '🐶', isDefault: true,
      keywords: ['ouaf','ouah','woaf','waf','wouaf','woof','chien'] },
    { name: 'Chat',  keyword: 'chat',  emoji: '🐱', isDefault: true,
      keywords: ['miaou','miaow','miaw','miau','meow','chat'] },
  ];
  for (const d of defaults) {
    const exists = await Faction.findOne({ guildId, keyword: d.keyword }).lean();
    if (!exists) {
      await Faction.create({
        guildId, name: d.name, keyword: d.keyword,
        emoji: d.emoji, isDefault: true, imageUrl: null,
      });
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
  const factions = await getFactions(message.guild.id);
  if (!factions.length) return false;

  const text = message.content.toLowerCase();

  // Trouver quelle faction est déclenchée
  let triggered = null;
  for (const f of factions) {
    // Pour chien/chat on teste plusieurs variantes
    const keywordsToTest = f.isDefault
      ? (f.keyword === 'chien'
          ? ['ouaf','ouah','woaf','waf','wouaf','woof','chien']
          : ['miaou','miaow','miaw','miau','meow','chat'])
      : [f.keyword];
    for (const kw of keywordsToTest) {
      if (buildRegex(kw).test(text)) { triggered = f; break; }
    }
    if (triggered) break;
  }
  if (!triggered) return false;

  const userId  = message.author.id;
  const guildId = message.guild.id;

  // Assigner la faction au membre si c'est son premier trigger cette semaine
  const user = await User.findOneAndUpdate(
    { userId, guildId },
    { $setOnInsert: { userId, guildId } },
    { upsert: true, new: true }
  ).catch(() => null);

  // Si le membre est déjà dans une AUTRE faction cette semaine → ses points ne comptent pas
  // mais le bot poste quand même l'image (fun)
  const memberFaction = user?.team || null;
  let pointsCount = false;

  if (!memberFaction) {
    // Première fois → assigner
    await User.updateOne({ userId, guildId }, { team: triggered.keyword });
    pointsCount = true;
  } else if (memberFaction === triggered.keyword) {
    pointsCount = true;
  }
  // sinon : membre d'une autre faction, pas de points

  if (pointsCount && !onCooldown(userId)) {
    await Faction.updateOne(
      { guildId, keyword: triggered.keyword },
      { $inc: { points: 1 }, lastActivity: new Date() }
    );
    invalidateCache(guildId);
  }

  // Poster l'image
  await postFactionImage(message, triggered, pointsCount);
  return true;
}

async function postFactionImage(message, faction, pointsCount) {
  try {
    let imageUrl = faction.imageUrl;

    // Pour chien/chat par défaut → API aléatoire
    if (faction.isDefault && !imageUrl) {
      const isDog = faction.keyword === 'chien';
      const result = await (isDog ? ANIMAL_APIS.dog() : ANIMAL_APIS.cat());
      imageUrl = result?.image || null;
    }

    // Score frais depuis la DB
    const fresh = await Faction.findOne({ guildId: message.guild.id, keyword: faction.keyword }).lean().catch(() => faction);
    const score = fresh?.points ?? faction.points ?? 0;

    const color = faction.keyword === 'chien' ? 0x8B4513
                : faction.keyword === 'chat'  ? 0xFF73FA
                : 0xFFD700;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${faction.emoji} ${faction.name.toUpperCase()} !`)
      .setDescription(
        `**${message.member?.displayName || message.author.username}** crie pour la faction **${faction.name}** !\n\n` +
        `📊 Score actuel : **${score} points**` +
        (pointsCount ? '' : '\n\n*⚠️ Tu es dans une autre faction — 0 point pour toi !*')
      )
      .setFooter({ text: `Écris "${faction.keyword}" pour rejoindre la faction !` });

    if (imageUrl) embed.setImage(imageUrl);

    await message.channel.send({ embeds: [embed] });
  } catch (err) {
    // Fallback silencieux — pas de réaction parasite
    console.error('[Faction] postFactionImage error:', err?.message);
  }
}

// ── Classement quotidien ──────────────────────────────────────────────────
async function postDailyLeaderboard(guild, channelId) {
  const factions = await Faction.find({ guildId: guild.id }).sort({ points: -1 }).lean();
  if (!factions.length) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const medals = ['🥇','🥈','🥉'];
  const lines = factions.map((f, i) =>
    `${medals[i] || `**${i+1}.**`} ${f.emoji} **${f.name}** — ${f.points} pts${f.totalWins ? ` *(${f.totalWins} victoire${f.totalWins > 1 ? 's' : ''})*` : ''}`
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('⚔️ Classement des Factions')
    .setDescription(lines.join('\n') + '\n\n💡 *Écris le mot-clé de ta faction pour lui donner des points !*')
    .setFooter({ text: 'Reset dimanche minuit • Crée ta faction : /faction créer' })
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

  // Reset points + team des membres
  await Faction.updateMany({ guildId: guild.id }, { points: 0 });
  await User.updateMany({ guildId: guild.id }, { team: null });
  invalidateCache(guild.id);
}

// ── Nettoyage factions inactives (custom seulement) ───────────────────────
async function cleanInactive(guildId) {
  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  await Faction.deleteMany({
    guildId, isDefault: false,
    lastActivity: { $lt: cutoff },
  });
  invalidateCache(guildId);
}

// ── Créer une faction custom ──────────────────────────────────────────────
async function createFaction({ guildId, userId, name, keyword, imageUrl, emoji }) {
  // Vérif slots
  const customCount = await Faction.countDocuments({ guildId, isDefault: false });
  if (customCount >= MAX_CUSTOM_FACTIONS) {
    return { ok: false, reason: `Le maximum de ${MAX_CUSTOM_FACTIONS} factions custom est atteint. Une faction doit être supprimée d'abord.` };
  }

  // Vérif mot-clé unique + min 3 lettres
  const kw = keyword.toLowerCase().trim();
  if (kw.length < 3) return { ok: false, reason: 'Le mot-clé doit faire au moins 3 lettres.' };
  const exists = await Faction.findOne({ guildId, keyword: kw }).lean();
  if (exists) return { ok: false, reason: `Le mot-clé **${kw}** est déjà utilisé par la faction **${exists.name}**.` };

  // Vérif XP
  const user = await User.findOne({ userId, guildId }).lean();
  if (!user || user.xp < XP_COST_CREATE) {
    return { ok: false, reason: `Il te faut **${XP_COST_CREATE} XP** pour créer une faction. Tu en as ${user?.xp ?? 0}.` };
  }

  // Déduire XP
  await User.updateOne({ userId, guildId }, { $inc: { xp: -XP_COST_CREATE } });

  // Créer
  await Faction.create({
    guildId, name: name.trim(), keyword: kw,
    imageUrl: imageUrl || null,
    emoji: emoji || '⚔️',
    isDefault: false, createdBy: userId,
  });
  invalidateCache(guildId);

  return { ok: true };
}

// ── Supprimer une faction (admin ou créateur) ─────────────────────────────
async function deleteFaction({ guildId, userId, keyword, isAdmin }) {
  const f = await Faction.findOne({ guildId, keyword: keyword.toLowerCase() }).lean();
  if (!f) return { ok: false, reason: 'Faction introuvable.' };
  if (f.isDefault) return { ok: false, reason: 'Les factions Chien et Chat ne peuvent pas être supprimées.' };
  if (!isAdmin && f.createdBy !== userId) return { ok: false, reason: 'Seul le créateur ou un admin peut supprimer cette faction.' };

  await Faction.deleteOne({ guildId, keyword: keyword.toLowerCase() });
  invalidateCache(guildId);
  return { ok: true };
}

// ── Liste des factions ────────────────────────────────────────────────────
async function listFactions(guildId) {
  return Faction.find({ guildId }).sort({ isDefault: -1, points: -1 }).lean();
}

module.exports = {
  handleMessage,
  postDailyLeaderboard,
  weeklyReset,
  cleanInactive,
  createFaction,
  deleteFaction,
  listFactions,
  ensureDefaults,
  MAX_CUSTOM_FACTIONS,
  XP_COST_CREATE,
};
