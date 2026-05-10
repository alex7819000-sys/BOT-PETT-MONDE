// src/animalDetector.js — Détection de mots et réponse avec photo d'animal

const { EmbedBuilder } = require("discord.js");

// ── Mots déclencheurs ─────────────────────────────────────────────────────
const TRIGGERS = {
  chien: ["woaf", "woof", "wouf", "ouaf", "chien", "doggo", "🐶", "🐕"],
  chat:  ["miaou", "meow", "miao", "miaw", "chat", "kitty", "🐱", "🐈"],
  renard: ["renard", "fox", "🦊"],
  panda: ["panda", "🐼"],
  koala: ["koala", "🐨"],
  oiseau: ["oiseau", "piaf", "tweet", "🐦", "🦜"],
  lapin: ["lapin", "rabbit", "bunny", "🐰", "🐇"],
};

// ── APIs pour chaque animal ───────────────────────────────────────────────
async function fetchAnimalImage(animal) {
  try {
    switch (animal) {
      case "chien": {
        const res  = await fetch("https://dog.ceo/api/breeds/image/random");
        const data = await res.json();
        return { url: data.message, name: "🐶 Woaf woaf !" };
      }
      case "chat": {
        // API aléatoire chat
        const res  = await fetch("https://api.thecatapi.com/v1/images/search");
        const data = await res.json();
        return { url: data[0]?.url, name: "🐱 Miaou !" };
      }
      case "renard": {
        const res  = await fetch("https://randomfox.ca/floof/");
        const data = await res.json();
        return { url: data.image, name: "🦊 Goupil !" };
      }
      case "panda": {
        const res  = await fetch("https://some-random-api.com/animal/panda");
        const data = await res.json();
        return { url: data.image, name: "🐼 Panda !" };
      }
      case "koala": {
        const res  = await fetch("https://some-random-api.com/animal/koala");
        const data = await res.json();
        return { url: data.image, name: "🐨 Koala !" };
      }
      case "oiseau": {
        const res  = await fetch("https://some-random-api.com/animal/bird");
        const data = await res.json();
        return { url: data.image, name: "🐦 Piaf !" };
      }
      case "lapin": {
        const res  = await fetch("https://some-random-api.com/animal/rabbit");
        const data = await res.json();
        return { url: data.image, name: "🐰 Lapin !" };
      }
      default:
        return null;
    }
  } catch (err) {
    console.error(`[ANIMAL] Erreur fetch ${animal}:`, err.message);
    return null;
  }
}

// ── Détecter le mot dans le message ──────────────────────────────────────
function detectAnimal(content) {
  const lower = content.toLowerCase();
  for (const [animal, words] of Object.entries(TRIGGERS)) {
    for (const word of words) {
      // Vérifier que le mot est présent (séparé par espace ou seul)
      if (lower.includes(word.toLowerCase())) {
        return animal;
      }
    }
  }
  return null;
}

// ── Handler principal ─────────────────────────────────────────────────────
async function handleAnimalDetection(message) {
  const animal = detectAnimal(message.content);
  if (!animal) return false;

  // Cooldown par salon (pas plus d'une image toutes les 10s par salon)
  const now = Date.now();
  const key  = message.channelId;
  if ((now - (handleAnimalDetection._cooldowns?.get(key) || 0)) < 10000) return false;
  handleAnimalDetection._cooldowns = handleAnimalDetection._cooldowns || new Map();
  handleAnimalDetection._cooldowns.set(key, now);

  const result = await fetchAnimalImage(animal);
  if (!result || !result.url) return false;

  const embed = new EmbedBuilder()
    .setColor(0xFFB347)
    .setTitle(result.name)
    .setImage(result.url)
    .setFooter({ text: `Demandé par ${message.author.displayName}` });

  await message.channel.send({ embeds: [embed] }).catch(() => {});
  return true;
}

module.exports = { handleAnimalDetection };
