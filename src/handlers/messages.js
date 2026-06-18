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

// Insultes premier coup — 1 seul message = reply feur + trash direct
// Format : "feur [emoji] | [insult]"
const FEUR_COMBOS = {
  // quoi → feur
  'feur': [
    'feur 🗿 | WALLAH T\'AS MARCHÉ COMME UN GROS CAILLOU 💀💀 T\'ES FINI AVANT D\'AVOIR COMMENCÉ',
    'feur 😐 | BRO TON QI C\'EST UNE VALEUR NÉGATIVE LÀ 🧠📉 JE SUIS CHOQUÉ PAR TON NIVEAU',
    'FEUR 🗿 | MDR T\'ES TELLEMENT BOLOSSE QUE MÊME TOI TU TE DÉGOÛTES DANS LE MIROIR 😭😭',
    'feur 😐 | POV : T\'ES LE DERNIER DE LA CLASSE ET T\'AS MÊME PAS HONTE FR FR 🤡💀',
    'feur 🗿 | RATIO 📊 + T\'AS MARCHÉ 🚶 + T\'AS PAS DE CERVEAU 🧠❌ = TOI 💀',
    'FEUR 🗿 | T\'ES TELLEMENT NAZE QUE MÊME UNE HUÎTRE T\'AURAIT PAS MARCHÉ WALLAH 🦪💀',
    'feur 😐 | 3 MILLIARDS D\'HUMAINS SUR TERRE ET C\'EST TOI LE MOINS INTELLIGENT JE SUIS MORT 💀',
    'feur 🗿 | ON PEUT PAS TOUS ÊTRE INTELLIGENTS MAIS TOI T\'EXAGÈRES VRAIMENT LÀ 😭💀',
    'FEUR 🗿 | J\'AI VU DES PIERRES PLUS MALIGNES QUE TOI C\'EST PAS UNE BLAGUE 🪨💀',
    'feur 😐 | TON CERVEAU C\'EST DU BEURRE FONDU FR FR 🧠🫠 RETOURNE À L\'ÉCOLE',
    'feur 🗿 | NAWAK ABSOLU 💀 T\'AS ÉTÉ FINI À LA PISSE OU T\'ES NÉ COMME ÇA',
    'FEUR 🗿 | SKILL ISSUE + QI ROOM TEMPERATURE + BOLOSSE CERTIFIÉ 📉🏆 C\'EST TOI',
    'feur 😐 | BRO T\'AS MARCHÉ SUR TON PROPRE RAKE LÀ 😭 C\'EST PATHÉTIQUE',
    'feur 🗿 | LE PLUS TRISTE C\'EST QUE T\'ES MÊME PAS CONSCIENT DE TON NIVEAU 💀😭',
    'FEUR 🗿 | J\'AURAIS HONTE À TA PLACE FRANCHEMENT MAIS T\'AS MÊME PAS CETTE CAPACITÉ 🤡💀',
    'feur 😐 | GG T\'AS SPEEDRUN "ÊTRE LA HONTE DU SERVEUR" EN TEMPS RECORD 🏆💀',
    'feur 🗿 | INCROYABLE LE TALENT QU\'IL FAUT POUR ÊTRE AUSSI NUL RESPECT INVERSÉ 💀📊',
    'FEUR 🗿 | BREF T\'EXISTES PAS MENTALEMENT LÀ C\'EST L\'ABSENCE DE NEURONES 🧠❌😭',
    'feur 😐 | C\'EST TRISTE MAIS T\'ES VRAIMENT LE BOLOSSE DE RÉFÉRENCE DU SERV 🏅💀',
    'feur 🗿 | WLH J\'AI DES CHAUSSETTES PLUS INTELLIGENTES QUE TOI C\'EST VRAI 🧦💀',
  ],
  // nan → cy
  'cy': [
    'cy 🏙️ | T\'AS DIT NAAAN COMME UN VRAI BOLOSSE DE NAISSANCE 😭💀 RATIO TOTAL',
    'cy 🏙️ | BRO NAWAK TON VOCABULAIRE EST AUSSI VIDE QUE TON CRÂNE 💀😭',
    'cy 🏙️ | WALLAH T\'ES TELLEMENT PRÉVISIBLE C\'EST TRISTE À VOIR 😐💀',
  ],
  // hein → eux
  'eux': [
    'eux 😈 | T\'AS DIT HEIN COMME UN SOURD MENTAL 😭💀 MÊME PAS CAPABLE D\'ÉCOUTER',
    'eux... 😈 | QI DE LARVE DÉTECTÉ 🧠❌ T\'AS DIT HEIN COMME UN GOSSE DE 3 ANS FR FR',
    'eux 😈 | NAWAK MÊME TES OREILLES FONCTIONNENT PAS 💀😭 C\'EST COMPLET',
  ],
  // bah → ladaire
  'ladaire': [
    'ladaire 🦁 | T\'AS DIT BAH COMME UN VIEILLARD PERDU 😭💀 T\'ES FINI AVANT L\'HEURE',
    'ladaire... 🦁 | BRO MÊME TES MOTS SONT NULS C\'EST UN RECORD 💀😭 WLH',
    'ladaire 🦁 | WALLAH T\'AS DIT BAH COMME SI T\'AVAIS JAMAIS APPRIS À PARLER 💀',
  ],
  // ah → uri
  'uri': [
    'uri 🎨 | T\'AS DIT AH COMME UN LÉGUME SURPRIS 😭💀 SUPPRIME TON COMPTE',
    'uriez ? 🤔 | NAWAK NAWAK NAWAK 💀 MÊME T\'ES EXCLAMATIONS SONT NULLES',
    'uri 🎨 | BRO T\'AS DIT AH ET C\'EST TA MEILLEURE CONTRIBUTION CE SOIR 💀😭',
  ],
  // bon → bon
  'bon_candy': [
    'bon 🍬 | T\'AS DIT BON COMME UN VRAI TARO DE COMPET\' 😭💀 RATIO + FINI',
    'bon... 🍬 | WALLAH MÊME TES MOTS DE REMPLISSAGE SONT HONTEUX 💀😭',
    'bon 🍬 | BRO "BON" C\'EST TOUT CE QUE T\'AS COMME INTELLIGENCE VERBALE 🧠❌💀',
  ],
  // re → nard
  'nard': [
    'nard 🦊 | T\'AS DIT RE COMME SI T\'AVAIS QUELQUE CHOSE D\'INTELLIGENT À AJOUTER 😭💀',
    'nard... 🦊 | WALLAH NAWAK LE NIVEAU NAWAK T\'ES UN CAS CLINIQUE CERTIFIÉ 💀',
    'nard 🦊 | BRO REVIENS QUAND T\'AURAS UN CERVEAU FONCTIONNEL 🧠❌😭💀',
  ],
  // comment → tateur
  'tateur': [
    'tateur 🎙️ | T\'AS DIT COMMENT COMME UN BOLOSSE QUI COMPREND JAMAIS RIEN 😭💀',
    'tateur... 😐 | NAWAK TON NIVEAU DE COMPRÉHENSION EST SOUS LE SOL LÀ 📉💀',
    'tateur 🎙️ | WLH MÊME TES QUESTIONS SONT NULLES C\'EST UN DON CHEZ TOI 💀😭',
  ],
  // non → bre
  'bre': [
    'bre 🔢 | T\'AS DIT NON COMME UN ENFANT CAPRICIEUX 😭💀 PATHÉTIQUE FR FR',
    'bre... 😐 | RATIO + T\'ES EN OPPOSITION + T\'AS PAS DE CERVEAU 📉💀',
    'bre 🔢 | WALLAH MÊME TON REFUS EST NUL C\'EST FORT 💀😭',
  ],
  // oui → stiti
  'stiti': [
    'stiti 🐒 | T\'AS DIT OUI COMME UN OUISTITI LOBOTOMISÉ 😭💀 WLH',
    'stiti... 😐 | BRO MÊME TON ACCORD EST HONTEUX C\'EST UN TALENT 💀😭',
    'stiti 🐒 | NAWAK T\'ES TELLEMENT D\'ACCORD AVEC TA PROPRE NULLITÉ 💀',
  ],
  // ok → api
  'api': [
    'api 🦒 | T\'AS DIT OK COMME UNE GIRAFE SANS COU MENTAL 😭💀 T\'ES FINI',
    'api... 🦒 | WALLAH MÊME TON ACCORD EST UNE HONTE NATIONALE 💀😭',
    'api 🦒 | BRO "OK" C\'EST TON NIVEAU MAXIMUM D\'INTELLIGENCE ET C\'EST TRISTE 🧠❌💀',
  ],
};

// Streak msgs — toujours 1 seul message, encore plus violent au fur et à mesure
const FEUR_STREAK_COMBOS = {
  'feur': [
    'feur 🗿 | 2 FOIS DE SUITE ??? WALLAH T\'APPRENDS JAMAIS 💀💀 T\'ES UN CAS MÉDICAL CERTIFIÉ BRO',
    'FEUR 💀 | 3 FOIS ??? <@{user}> TU MÉRITES UN PRIX POUR ÊTRe AUSSI CONSTANT DANS LA NULLITÉ 😭😭 RESPECT INVERSÉ',
    'feur 🐒 | <@{user}> 4 FOIS DE SUITE JE SUIS INCAPABLE DE RESSENTIR DE LA PITIÉ LÀ TELLEMENT T\'ES LOIN 💀🐒 LE RÔLE SINGE C\'EST TON DESTIN',
  ],
  'default': [
    '2 FOIS DE SUITE ??? WALLAH T\'APPRENDS JAMAIS 💀💀 T\'ES UN CAS MÉDICAL',
    'IL REMET ÇA 😭😭 <@{user}> T\'ES TELLEMENT CONSTANT DANS LA LOSE C\'EST PRESQUE IMPRESSIONNANT 💀',
    '<@{user}> 3 FOIS 🐒 T\'ES DÉFINITIVEMENT FINI À LA PISSE POUR L\'ÉTERNITÉ 💀',
  ],

};

// Retourne le texte final à envoyer (feur reply + insult en 1 message)
// triggerKey = clé dans FEUR_COMBOS (ex: 'feur', 'cy', ...)
function buildFeurReply(uid, triggerKey) {
  const now  = Date.now();
  const data = FEUR_TRACKER.get(uid) || { count: 0, botRepliedAt: 0 };

  if (now - data.botRepliedAt > FEUR_WINDOW_MS) data.count = 0;
  data.count++;
  FEUR_TRACKER.set(uid, data);

  let msg;

  if (data.count >= 2) {
    // Streak : on prend le bon tableau selon triggerKey ou fallback
    const streakPool = FEUR_STREAK_COMBOS[triggerKey] || FEUR_STREAK_COMBOS['default'];
    const idx = Math.min(data.count - 2, streakPool.length - 1);
    msg = streakPool[idx].replace('{user}', `<@${uid}>`);
  } else {
    // Premier coup : combo feur + insult en 1 seul message
    const comboPool = FEUR_COMBOS[triggerKey] || FEUR_COMBOS['feur'];
    msg = comboPool[Math.floor(Math.random() * comboPool.length)];
  }

  return { msg, count: data.count, data };
}

async function handleFeurStreak(message, triggerKey, replyText, streakCount, trackerData) {
  // Envoie le message (déjà construit) et met à jour le timestamp
  await message.reply(replyText);
  trackerData.botRepliedAt = Date.now();
  FEUR_TRACKER.set(message.author.id, trackerData);

  // Rôle singe au bout de 3 streaks
  if (streakCount === 3) {
    const uid = message.author.id;
    const gid = message.guild.id;
    try {
      const cfg = await Config.findOne({ guildId: gid });
      if (cfg?.singeRoleId) {
        const member = message.member;
        if (member && !member.roles.cache.has(cfg.singeRoleId)) {
          await member.roles.add(cfg.singeRoleId);
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

  // ── Commandes préfixe (sans slash) ────────────────────────────────────
  // rk / xp / niveau → affiche le profil XP sans avoir à taper /
  const prefixCmds = ['rk', 'xp', 'niveau', 'level', 'rank'];
  const contentLower = message.content.trim().toLowerCase();
  const firstWord = contentLower.split(' ')[0];

  if (prefixCmds.includes(firstWord)) {
    const config = await Config.findOne({ guildId: gid });

    // Vérifie que c'est bien dans le bon salon (si configuré)
    if (config?.rankChannelId && message.channel.id !== config.rankChannelId) {
      // Mauvais salon — on ignore silencieusement, on continue le flow normal
    } else {
      try {
        const { getOrCreate, xpProgress, getUserRank } = require('../systems/xp');
        const User = require('../db/models/User');

        // Mention ou nom dans le message ?
        const mentionId = message.mentions.users.first()?.id;
        const targetId  = mentionId || uid;
        const member    = await message.guild.members.fetch(targetId).catch(() => null);
        if (!member) return;

        const userData = await getOrCreate(targetId, gid);
        const [weekRank, totalRank] = await Promise.all([
          getUserRank(targetId, gid, 'weekXp'),
          getUserRank(targetId, gid, 'totalXp'),
        ]);

        const { level, current, needed } = xpProgress(userData.totalXp);
        const pct  = needed > 0 ? Math.round((current / needed) * 100) : 100;
        const fill = Math.round((pct / 100) * 14);
        const bar  = '`' + '█'.repeat(fill) + '░'.repeat(14 - fill) + '`';

        const embed = require('discord.js').EmbedBuilder
          ? new (require('discord.js').EmbedBuilder)()
              .setColor(0xFFD700)
              .setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL({ size: 64 }) })
              .addFields(
                { name: '⭐ Niveau',         value: `**${level}**`,                                  inline: true },
                { name: '📈 XP hebdo',       value: `**${userData.weekXp?.toLocaleString('fr-FR') || 0}** *(#${weekRank})*`,  inline: true },
                { name: '🏆 XP total',       value: `**${userData.totalXp?.toLocaleString('fr-FR') || 0}** *(#${totalRank})*`, inline: true },
                { name: `Progression vers niv ${level + 1}`, value: `${bar} ${pct}%`, inline: false },
              )
              .setTimestamp()
          : null;

        if (embed) await message.reply({ embeds: [embed] });
      } catch (_) {}
      return; // ne pas continuer vers l'XP classique pour ce message
    }
  }

  // ── 7. XP ────────────────────────────────────────────────────────────
  const config     = await Config.findOne({ guildId: gid });
  if (config?.xpExcludedChannels?.includes(message.channel.id)) return;

  const user       = await getOrCreate(uid, gid);
  const cooldownMs = (config?.xpCooldown || 60) * 1000;
  if (user.lastMessage && Date.now() - user.lastMessage.getTime() < cooldownMs) return;

  // ── Multiplicateur par salon ──────────────────────────────────────────
  let baseXp = config?.xpPerMessage || XP.PER_MESSAGE();
  const channelMulti = config?.channelMultipliers?.find(m => m.channelId === message.channel.id);
  if (channelMulti) baseXp = Math.round(baseXp * channelMulti.multiplier);

  // ── Rôle couleur vert = x2 XP ────────────────────────────────────────
  // Si le membre a le rôle couleur dont l'emoji est 💚, il gagne le double
  const colorRoles  = config?.colorRoleIds || [];
  const greenRole   = colorRoles.find(cr => cr.emoji === '💚' || cr.name?.toLowerCase().includes('vert'));
  const member      = message.guild.members.cache.get(uid);
  if (greenRole && member?.roles.cache.has(greenRole.roleId)) {
    baseXp = baseXp * 2;
  }

  // ── Malus Singe évolué ────────────────────────────────────────────────
  if (user.isMonkey) {
    const faults = user.monkeyFaults || 0;
    if (faults >= 5) {
      // Malus dur : -50% + retire 100 XP accumulés
      baseXp = Math.round(baseXp * 0.5);
      user.weekXp  = Math.max(0, (user.weekXp  || 0) - 100);
      user.totalXp = Math.max(0, (user.totalXp || 0) - 100);
      user.xp      = Math.max(0, (user.xp      || 0) - 100);
      await user.save();
    } else {
      // Malus doux : -50% XP gagné
      baseXp = Math.round(baseXp * 0.5);
    }
  }

  const xpResult = await addXP(uid, gid, baseXp, message);
  user.lastMessage   = new Date();
  user.dailyMessages = (user.dailyMessages || 0) + 1;
  user.dailyXp       = (user.dailyXp       || 0) + baseXp;

  // ── Tracker messages salons jeux (pour missions quotidiennes) ─────────
  const gameChannels = (config?.channelMultipliers || []).map(m => m.channelId);
  if (gameChannels.includes(message.channel.id)) {
    user.dailyMessagesGame = (user.dailyMessagesGame || 0) + 1;
  }

  // ── Vérifier missions quotidiennes ────────────────────────────────────
  try {
    const { checkDailyMissions } = require('../systems/dailymissions');
    await checkDailyMissions(user, message.guild, message.client);
  } catch (_) {}
  await user.save();

  // ── Mise à jour live board (throttlée dans liveboard.js) ──────────────
  try {
    if (config?.liveBoardChannelId && config?.liveBoardMessageId) {
      const { updateLiveBoard } = require('../systems/xp/liveboard');
      await updateLiveBoard(message.guild, config).catch(() => {});
    }
  } catch {}

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
// Mapping trigger → clé FEUR_COMBOS (1 seul message = reply + trash)
const BOTUS_TRIGGERS = [
  { regex: /quoi[?!\s]*$/i,                key: 'feur' },
  { regex: /(?<![a-z])comment[?!\s]*$/i,   key: 'tateur' },
  { regex: /(?<![a-z])non[?!\s]*$/i,       key: 'bre' },
  { regex: /(?<![a-z])oui[?!\s]*$/i,       key: 'stiti' },
  { regex: /(?<![a-z])ok[?!\s]*$/i,        key: 'api' },
  { regex: /(?<![a-z])nan[?!\s]*$/i,       key: 'cy' },
  { regex: /(?<![a-z])hein[?!\s]*$/i,      key: 'eux' },
  { regex: /(?<![a-z])bah[?!\s]*$/i,       key: 'ladaire' },
  { regex: /(?<![a-z])ah[?!\s]*$/i,        key: 'uri' },
  { regex: /(?<![a-z])bon[?!\s]*$/i,       key: 'bon_candy' },
  { regex: /(?<![a-z])re[?!\s]*$/i,        key: 'nard' },
];

async function handleFeur(message) {
  const text = message.content.trim();
  let triggerKey = null;
  for (const t of BOTUS_TRIGGERS) {
    if (t.regex.test(text)) { triggerKey = t.key; break; }
  }
  if (!triggerKey) return;

  // Vérifier si restreint à un salon
  try {
    const cfg = await Config.findOne({ guildId: message.guild.id });
    if (cfg?.feurChannelId && message.channel.id !== cfg.feurChannelId) return;
  } catch {}

  if (!canTrigger(message.author.id, 'feur')) return;

  // Construire + envoyer UN SEUL message (feur + trash fusionnés)
  const { msg, count, data } = buildFeurReply(message.author.id, triggerKey);
  await handleFeurStreak(message, triggerKey, msg, count, data);
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
