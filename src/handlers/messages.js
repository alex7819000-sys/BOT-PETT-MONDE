// src/handlers/messages.js — Gestion des messages (XP, détections)
'use strict';
const { addXP, getOrCreate }   = require('../systems/xp');
const { handleWarTrigger }     = require('../systems/guerre');
const { checkMonkeyRule }      = require('../systems/singe');
const { detectBump }           = require('../systems/bump');
const { handleCounting }       = require('../systems/counting');
const { handlePendingImage }    = require('../systems/secret');
const { handleDMBlast }         = require('../systems/dmblast');
const { handlePendingImage: handleConfessionImage } = require('../systems/confession');
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

// ── Tracker feur : insultes + rôle singe ─────────────────────────────────
const FEUR_TRACKER = new Map(); // userId → { count, botRepliedAt }
const FEUR_WINDOW_MS = 2 * 60 * 1000; // 2 min après la réponse du bot

const FEUR_INSULTS = [
  // classiques ragebait
  "T'AS MARCHÉ OUF 💀 RETOURNE AU CM2",
  "LOL T'ES FINI À LA PISSE FR FR 😭😭",
  "BAKHHHH T'ES TROP OUFFF 💀💀💀 DANS LE MAUVAIS SENS",
  "NOM DE DIEU T'AS VRAIMENT MARCHÉ 😭😭",
  "T'ES UN CAS CHELOU TOI WALAH 💀",
  "ARRACHE TA TÊTE ET RAMÈNE LA À LA DÉCHETTERIE 🗑️",
  "BREF T'AS PAS LA LUMIÈRE À TOUS LES ÉTAGES HEP 💡",
  "T'ES FINI BRO VRAIMENT FINI 💀💀",
  "MÊME UN GOSSE DE 8 ANS SE SERAIT PAS FAIT AVOIR MDR",
  "ALLER FERME LÀ T'ES UNE HONTE 🤐",
  // verlan / cités
  "T'ES OUF OU QUOI ? DANS LE MAUVAIS SENS DU TERME 💀",
  "C'EST CHAUD LE NIVEAU LÀ VRAIMENT CHAUD 🔥😭",
  "T'ES UN VRAI BOLOSSE FR 💀💀💀",
  "WLH T'AS MARCHÉ C'EST TRISTE À VOIR",
  "BRO T'ES DANS LE ROUGE LÀ 📉💀",
  // brainrot / internet
  "SKILL ISSUE NIVEAU STRATOSPHÉRIQUE 📊💀",
  "QI NÉGATIF DÉTECTÉ 🧠❌",
  "T'ES LE RAGEUX DE TOI-MÊME MDR 😭😭",
  "GG T'AS SPEEDRUN LE TITLE DE PLUS NUL DU SERV 🏆💀",
  "C'EST UNE BLAGUE TOI HEIN ?? HEIN ???  😭",
  "RATIO + T'AS MARCHÉ + T'ES FINI 📉",
  "POV : T'AS ENCORE MARCHÉ 🤡",
  "NAWAK LE NIVEAU NAWAK 💀",
  "FRANCHEMENT SUPPRIME TON COMPTE 🗑️",
  "T'AS ÉTÉ FINI À LA PISSE OU QUOI 😭😭😭",
];

const FEUR_STREAK_MSGS = [
  "2 FOIS DE SUITE ??? BRO T'APPRENDS JAMAIS WLH 💀💀 C'EST TRISTE À VOIR",
  "IL REMET ÇA 😭😭 T'ES UN CAS CLINIQUE CERTIFIÉ <@{user}> RATIO + BOLOSSE",
  "3 FOIS DE SUITE 🐒 <@{user}> T'AS MÉRITÉ LE RÔLE SINGE JE PEUX MÊME PAS ÊTRE EN COLÈRE LÀ C'EST DE LA PITIÉ 💀",
];

async function handleFeurStreak(message) {
  const uid  = message.author.id;
  const gid  = message.guild.id;
  const now  = Date.now();
  const data = FEUR_TRACKER.get(uid) || { count: 0, botRepliedAt: 0 };

  // Reset si l'user re-dit quoi APRES 2 min depuis la dernière réponse du bot
  // = conversation normale, on ignore
  if (now - data.botRepliedAt > FEUR_WINDOW_MS) data.count = 0;

  data.count++;
  // botRepliedAt sera mis à jour APRÈS l'envoi du message bot (ci-dessous)
  FEUR_TRACKER.set(uid, data);

  // Insulte de base aléatoire
  const insult = FEUR_INSULTS[Math.floor(Math.random() * FEUR_INSULTS.length)];
  let msg = insult;

  // Streak 2+
  if (data.count === 2) msg = FEUR_STREAK_MSGS[0];
  if (data.count === 3) msg = FEUR_STREAK_MSGS[1].replace('{user}', `<@${uid}>`);
  if (data.count >= 4)  msg = FEUR_STREAK_MSGS[2].replace('{user}', `<@${uid}>`);

  await message.reply(msg);
  // Mettre à jour le timestamp APRÈS la réponse du bot
  data.botRepliedAt = Date.now();
  FEUR_TRACKER.set(uid, data);

  // Rôle singe au bout de 3
  if (data.count === 3) {
    try {
      const cfg    = await Config.findOne({ guildId: gid });
      if (cfg?.singeRoleId) {
        const member = message.member;
        if (member && !member.roles.cache.has(cfg.singeRoleId)) {
          await member.roles.add(cfg.singeRoleId);
          // Annonce dans le salon annonce avec ping rôle annonce
          const announceCh = cfg.announceChannelId
            ? message.guild.channels.cache.get(cfg.announceChannelId)
            : null;
          const pingRole = cfg.announceRoleId ? `<@&${cfg.announceRoleId}>` : '';
          const annMsg = `${pingRole}\n🐒 **${message.member?.displayName || message.author.username}** vient de décrocher le rôle **Singe du serveur** en se faisant avoir 3 fois de suite au feur 💀\nRatio + bolosse + t'es fini <@${uid}>`;
          if (announceCh) await announceCh.send(annMsg);
          else await message.channel.send(annMsg);
        }
      }
    } catch (_) {}
  }
}

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
  // ── Bump bots — AVANT le filtre author.bot ────────────────────────────
  if (message.author.bot && message.guild) {
    await detectBump(message);
    return; // les bots ne font que ça
  }

  if (!message.guild) return;

  const uid = message.author.id;
  const gid = message.guild.id;

  // ── 0. Secret image en attente — priorité max ──────────────────────
  if (await handleDMBlast(message)) return;
  if (await handlePendingImage(message)) return;
  if (await handleConfessionImage(message)) return;

  // ── 1. Counting — priorité absolue ───────────────────────────────────
  if (await handleCounting(message)) return;

  // ── 2. Média — priorité haute (avant tous les easter eggs) ───────────
  //    Si c'est le salon média : on vérifie, on supprime si pas de média,
  //    on crée le thread si c'est bon, puis on continue (XP quand même)
  const mediaHandled = await handleMediaChannel(message);
  if (mediaHandled === 'deleted') return;
  if (await handleFaceRevealAuto(message)) return; // message supprimé → on arrête tout

  // ── 3. Détections fun (uniquement hors salon média) ──────────────────
  if (!mediaHandled) {
    await handleAnimalTrigger(message);
    await handleSixSeven(message);
    await handleWarTrigger(message);
  }
  // Feur actif dans tous les salons (sauf si feurChannelId restreint)
  await handleFeur(message);

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

  const xpResult = await addXP(uid, gid, config?.xpPerMessage || XP.PER_MESSAGE(), message);
  user.lastMessage = new Date();
  await user.save();

  // ── 8. Progression défis 'messages' ──────────────────────────────────
  try {
    const { updateProgress } = require('../systems/defis');
    await updateProgress(uid, gid, 'messages', 1);
  } catch (_) {}
}

// ── Salon Média ───────────────────────────────────────────────────────────
async function handleMediaChannel(message) {
  // Fils : tout autorisé
  if (message.channel.isThread()) return false;

  const config   = await Config.findOne({ guildId: message.guild.id });
  const mediaIds = config?.mediaChannelIds || [];
  if (!mediaIds.includes(message.channel.id)) return false;

  // Tout le monde peut écrire librement — on crée juste un thread sur les images/vidéos
  const hasAttachment = message.attachments.some(a =>
    a.contentType?.startsWith('image') ||
    a.contentType?.startsWith('video') ||
    /\.(gif|webp|jpg|jpeg|png|mp4|mov|webm|avi|mkv)$/i.test(a.name || '')
  );

  if (hasAttachment) {
    try {
      const pseudo = message.member?.displayName || message.author.username;
      const thread = await message.startThread({
        name: `💬 ${pseudo}`.slice(0, 100),
        autoArchiveDuration: 1440,
        reason: 'Thread auto salon média',
      });
      await thread.send(`💬 Commente le média de **${pseudo}** ici !`);
    } catch (_) {}
  }

  return true; // continuer pour l'XP
}

// ── Détection sons animaux → image ────────────────────────────────────────
// Fonctionne UNIQUEMENT dans le salon configuré via /setup animaltrigger
// Complètement indépendant de la guerre chien vs chat
async function handleAnimalTrigger(message) {
  // Vérifier que la feature est activée et qu'on est dans le bon salon
  const config = await Config.findOne({ guildId: message.guild.id });
  if (!config?.animalTriggerChannelId) return;
  if (message.channel.id !== config.animalTriggerChannelId) return;

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

// ── Système style Botus ──────────────────────────────────────────────────
// Mots en fin de phrase → complétion humoristique
const BOTUS_TRIGGERS = [
  // mot détecté (regex fin de phrase)  → réponses possibles
  { regex: /quoi[?!\s]*$/i,      replies: ['feur 🗿', 'feur 😐', 'FEUR 🗿', 'feur... 🗿'] },
  { regex: /(?<![a-z])comment[?!\s]*$/i,   replies: ['tateur 🎙️', 'tateur... 😐'] },
  { regex: /(?<![a-z])non[?!\s]*$/i,       replies: ['bre 🔢', 'bre... 😐'] },
  { regex: /(?<![a-z])oui[?!\s]*$/i,       replies: ['stiti 🐒', 'stiti... 😐'] },
  { regex: /(?<![a-z])ok[?!\s]*$/i,        replies: ['api 🦒', 'api... 🦒'] },
  { regex: /(?<![a-z])nan[?!\s]*$/i,       replies: ['cy 🏙️', 'terre 🌍'] },
  { regex: /(?<![a-z])hein[?!\s]*$/i,      replies: ['eux 😈', 'eux... 😈'] },
  { regex: /(?<![a-z])bah[?!\s]*$/i,       replies: ['ladaire 🦁', 'ladaire... 🦁'] },
  { regex: /(?<![a-z])ah[?!\s]*$/i,        replies: ['uri 🎨', 'uriez ? 🤔'] },
  { regex: /(?<![a-z])bon[?!\s]*$/i,       replies: ['bon 🍬', 'bon... 🍬'] },
  { regex: /(?<![a-z])re[?!\s]*$/i,        replies: ['nard 🦊', 'nard... 🦊'] },
];

async function handleFeur(message) {
  const text = message.content.trim();
  let matched = null;
  for (const t of BOTUS_TRIGGERS) {
    if (t.regex.test(text)) { matched = t; break; }
  }
  if (!matched) return;
  // Vérifier si restreint à un salon
  try {
    const cfg = await Config.findOne({ guildId: message.guild.id });
    if (cfg?.feurChannelId && message.channel.id !== cfg.feurChannelId) return;
  } catch {}
  if (!canTrigger(message.author.id, 'feur')) return;
  const reply = matched.replies[Math.floor(Math.random() * matched.replies.length)];
  await message.reply(reply);
  // Insulte + streak singe
  await handleFeurStreak(message);
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


// ── Face Reveal auto-capture ──────────────────────────────────────────────
// Dans le salon face-reveal : capture auto les images, crée thread, bloque texte pur
async function handleFaceRevealAuto(message) {
  if (message.channel.isThread()) return false;
  const config = await Config.findOne({ guildId: message.guild.id });
  if (!config?.faceRevealChannelId || message.channel.id !== config.faceRevealChannelId) return false;

  // Écriture libre — on ne supprime rien, on agit uniquement sur les images/vidéos
  const hasImage = message.attachments.some(a =>
    a.contentType?.startsWith('image') || a.contentType?.startsWith('video')
  );
  if (!hasImage) return false;

  const pseudo = message.member?.displayName || message.author.username;

  // Ajouter les réactions Smash/Pass directement sur le message
  try {
    await message.react('✅'); // Smash
    await message.react('❌'); // Pass
  } catch (_) {}

  // Créer un thread pour commenter
  try {
    const thread = await message.startThread({
      name: `💬 ${pseudo} — Face Reveal`.slice(0, 100),
      autoArchiveDuration: 1440,
    });
    await thread.send(`💬 Commente le face reveal de **${pseudo}** ici ! ✅ = Smash  ❌ = Pass`);
  } catch (_) {}

  return false; // on ne bloque pas le reste (XP etc.)
}

module.exports = { handleMessage };
