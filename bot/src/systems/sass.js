// src/systems/sass.js — Le bot devient "casse-couilles" : réagit aux insultes,
// reconnaît le brainrot (six-seven, sigma, gyat...) et clash en retour si on lui répond.
'use strict';

function random(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Cooldown en mémoire : userId → timestamp du dernier déclenchement
const cooldowns = new Map();
const COOLDOWN_MS = 12_000;

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

// ── Détection d'insultes (simple, casual — pas de haine, juste les classiques) ──
const INSULT_PATTERN = /\b(tg|ta\s*gueule|ferme\s*[lt]a\s*gueule|abruti|débile|crétin|idiot|imbécile|connard|connasse|pauvre\s*con|sale\s*con|enfoiré|pd|nul[le]?\s*a\s*chier)\b/i;

const INSULT_RESPONSES = [
  (name) => `ohlalala ${name} a dit une insulte 😭👀 on note tout ici`,
  (name) => `WOAH ${name} surveille ton langage 💀 je précise que je suis un enfant innocent`,
  (name) => `ohlala ohlala ${name} sort les gros mots maintenant 😭 calme-toi cowboy`,
  (name) => `${name} insulte les gens en pleine journée 💀 incroyable`,
  (name) => `aïe aïe aïe ${name} 😭 c'est pas très gentil ça`,
  (name) => `alerte rouge 🚨 ${name} a été vulgaire, je le mets dans mon rapport`,
  (name) => `ohlala ${name} t'as pas eu ton câlin du matin on dirait 😭`,
];

// ── Détection brainrot (les mots que la génération sait reconnaître) ────────
const BRAINROT_TRIGGERS = [
  {
    pattern: /\b(six\s*seven|6\s*7|67)\b/i,
    replies: [
      (name) => `SIX SEVEN 🤚🤚 ${name} a invoqué le mème, respect`,
      (name) => `6 7 💀💀 ${name} fr fr ce mème refuse de mourir`,
      (name) => `${name} a dit six seven 🤚 et maintenant tout le monde dans le call le fait aussi`,
    ],
  },
  {
    pattern: /\bsigma\b/i,
    replies: [
      (name) => `sigma grindset activé 🗿 ${name} en mode lone wolf`,
      (name) => `${name} a dit sigma 🗿 mais a toujours pas fini ses devoirs`,
    ],
  },
  {
    pattern: /\bgyat+\b/i,
    replies: [
      (name) => `GYAT 😭😭 ${name} calme-toi frère`,
      (name) => `${name} a crié gyat dans le vide 💀 personne t'as entendu rassure-toi`,
    ],
  },
  {
    pattern: /\brizz\b/i,
    replies: [
      (name) => `${name} et son rizz légendaire 😭 (rizz = 0 mais bon)`,
      (name) => `rizz detecté 📡 niveau : ${name} tier (donc proche de zéro)`,
    ],
  },
  {
    pattern: /\bskibidi\b/i,
    replies: [
      (name) => `skibidi toilet ${name} 🚽😭 t'as quel âge sérieux`,
      (name) => `${name} a dit skibidi 💀 on est en 2026 wesh`,
    ],
  },
  {
    pattern: /\bohio\b/i,
    replies: [
      (name) => `only in ohio 💀 ${name} tu confirmes`,
      (name) => `${name} ça sent l'ohio ce que tu viens de dire 😭`,
    ],
  },
  {
    pattern: /\bfanum\s*tax\b/i,
    replies: [
      (name) => `${name} qui prélève la fanum tax sur tout le serveur 😭🍔`,
    ],
  },
  {
    pattern: /\bno\s*cap\b/i,
    replies: [
      (name) => `no cap ?? 🧢 ${name} on va vérifier ça`,
      (name) => `${name} dit no cap mais on sait tous que c'est full cap 🧢😭`,
    ],
  },
  {
    pattern: /\bsussy?\s*baka\b|\bsus\b/i,
    replies: [
      (name) => `${name} ça c'est très sus 👀🔴 imposter detected`,
    ],
  },
  {
    pattern: /\bgoated?\b/i,
    replies: [
      (name) => `${name} se dit goated 🐐 sans aucune preuve à l'appui`,
    ],
  },
];

// ── Comebacks quand quelqu'un répond au bot pour le clasher en retour ──────
const COMEBACK_RESPONSES = [
  (name) => `oh ${name} essaie de me clash en retour 😭 mignon, mais non`,
  (name) => `${name} pensait avoir le dernier mot 💀 perdu, j'ai toujours le dernier mot ici`,
  (name) => `attends ${name} tu réponds à un bot maintenant 😭😭 c'est gênant pour toi`,
  (name) => `${name} : *essaie de clapback* — moi : toujours plus rapide, toujours plus drôle 🗿`,
  (name) => `ratio + t'as répondu à un bot + tu vas perdre quand même ${name} 💀`,
  (name) => `${name} a voulu jouer dans la cour des grands 😭 retourne en CP`,
  (name) => `c'est mignon ${name} mais j'ai été programmé pour gagner cette conversation 🤖🗿`,
  (name) => `${name} réessaie, j'ai des millions de réponses en stock et toi t'en as une seule 💀`,
];

async function handleMessage(message, client, config) {
  if (!message.guild || message.author.bot) return false;
  if (config && config.sassEnabled === false) return false;

  const content = message.content;
  if (!content) return false;

  const userId = message.author.id;
  const displayName = message.member?.displayName || message.author.username;

  // ── 1. Quelqu'un répond directement à un message du bot → clapback ──────
  if (message.reference?.messageId) {
    try {
      const refMsg = await message.fetchReference();
      if (refMsg?.author?.id === client.user.id) {
        if (onCooldown(userId)) return false;
        const reply = random(COMEBACK_RESPONSES)(displayName);
        await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});
        return true;
      }
    } catch {
      // message de référence supprimé/inaccessible — on continue normalement
    }
  }

  // ── 2. Insulte détectée ──────────────────────────────────────────────────
  if (INSULT_PATTERN.test(content)) {
    if (onCooldown(userId)) return false;
    const reply = random(INSULT_RESPONSES)(displayName);
    await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});
    return true;
  }

  // ── 3. Brainrot reconnu ───────────────────────────────────────────────────
  for (const trigger of BRAINROT_TRIGGERS) {
    if (!trigger.pattern.test(content)) continue;
    if (onCooldown(userId)) return false;
    const reply = random(trigger.replies)(displayName);
    await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { handleMessage };
