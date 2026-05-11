// src/animeSmash.js — Smash or Pass Anime avec API Jikan (gratuite, sans clé)

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const ANIME_DB_FILE = path.join(__dirname, "../data/animeSmash.json");

function loadAnimeDB() {
  if (!fs.existsSync(ANIME_DB_FILE)) return { votes: {}, history: [], lastPosted: null };
  return JSON.parse(fs.readFileSync(ANIME_DB_FILE, "utf-8"));
}

function saveAnimeDB(db) {
  fs.mkdirSync(path.dirname(ANIME_DB_FILE), { recursive: true });
  fs.writeFileSync(ANIME_DB_FILE, JSON.stringify(db, null, 2));
}

// ── Récupérer un personnage anime aléatoire via Jikan API ─────────────────
async function fetchRandomAnimeCharacter() {
  try {
    // Page aléatoire entre 1 et 50 pour varier
    const page = Math.floor(Math.random() * 50) + 1;
    const res  = await fetch(`https://api.jikan.moe/v4/characters?page=${page}&limit=25&order_by=favorites&sort=desc`);
    const data = await res.json();

    if (!data.data || data.data.length === 0) throw new Error("Pas de personnage");

    // Filtrer ceux qui ont une image
    const withImage = data.data.filter(c =>
      c.images?.jpg?.image_url &&
      !c.images.jpg.image_url.includes("questionmark")
    );

    if (withImage.length === 0) throw new Error("Pas d'image");

    const char = withImage[Math.floor(Math.random() * withImage.length)];

    return {
      id:       char.mal_id,
      name:     char.name,
      image:    char.images.jpg.image_url,
      animes:   char.anime?.slice(0, 2).map(a => a.anime?.title).filter(Boolean).join(", ") || "Anime inconnu",
      url:      char.url,
      favorites: char.favorites || 0,
    };
  } catch (err) {
    console.error("[ANIME] Erreur fetch:", err.message);
    return null;
  }
}

// ── Poster un personnage dans le salon ────────────────────────────────────
async function postAnimeCharacter(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return console.error("[ANIME] Salon introuvable:", channelId);

  const char = await fetchRandomAnimeCharacter();
  if (!char) return console.error("[ANIME] Impossible de récupérer un personnage");

  const db = loadAnimeDB();

  // Utiliser un ID court pour éviter la limite Discord des 100 caractères
  const shortId = String(char.id).slice(-8);
  db.votes[shortId] = db.votes[shortId] || { smash: [], pass: [] };
  const votes = db.votes[shortId];

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle(`🎌 ${char.name}`)
    .setDescription(
      `**Anime :** ${char.animes}\n` +
      `**Favoris :** ⭐ ${char.favorites.toLocaleString("fr-FR")}\n\n` +
      `💚 **${votes.smash.length}** Smash   |   💔 **${votes.pass.length}** Pass`
    )
    .setImage(char.image)
    .setURL(char.url)
    .setFooter({ text: "Smash ou Pass ? Vote maintenant ! 👇" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`anime_smash_${shortId}`)
      .setLabel(`💚 Smash (${votes.smash.length})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`anime_pass_${shortId}`)
      .setLabel(`💔 Pass (${votes.pass.length})`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`anime_stats_${shortId}`)
      .setLabel("📊 Stats")
      .setStyle(ButtonStyle.Secondary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });

  db.history.unshift({ charId: shortId, name: char.name, image: char.image, animes: char.animes, messageId: msg.id, channelId, timestamp: Date.now() });
  db.history = db.history.slice(0, 50); // Garder les 50 derniers
  db.lastPosted = Date.now();
  saveAnimeDB(db);

  console.log(`[ANIME] ✅ Posté : ${char.name}`);
}

// ── Gérer les votes ───────────────────────────────────────────────────────
async function handleAnimeVote(interaction) {
  const parts  = interaction.customId.split("_");
  const action = parts[1]; // smash, pass, stats
  const charId = parts[2]; // Garder en string pour éviter les problèmes de nombre trop grand

  const db    = loadAnimeDB();
  const votes = db.votes[charId] || { smash: [], pass: [] };
  const userId = interaction.user.id;

  if (action === "stats") {
    const total = votes.smash.length + votes.pass.length;
    const smashPct = total ? Math.round((votes.smash.length / total) * 100) : 0;
    const passPct  = total ? 100 - smashPct : 0;

    const bar = `${"🟩".repeat(Math.round(smashPct / 10))}${"🟥".repeat(10 - Math.round(smashPct / 10))}`;

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📊 Résultats du vote")
        .setDescription(
          `${bar}\n\n` +
          `💚 **Smash :** ${votes.smash.length} votes (${smashPct}%)\n` +
          `💔 **Pass :** ${votes.pass.length} votes (${passPct}%)\n` +
          `👥 **Total :** ${total} votants`
        )
      ],
      ephemeral: true
    });
  }

  // Vérifier si déjà voté
  const alreadySmash = votes.smash.includes(userId);
  const alreadyPass  = votes.pass.includes(userId);

  if (action === "smash") {
    if (alreadySmash) {
      // Annuler son smash
      votes.smash = votes.smash.filter(id => id !== userId);
    } else {
      votes.smash.push(userId);
      votes.pass = votes.pass.filter(id => id !== userId); // Retirer du pass si besoin
    }
  } else if (action === "pass") {
    if (alreadyPass) {
      votes.pass = votes.pass.filter(id => id !== userId);
    } else {
      votes.pass.push(userId);
      votes.smash = votes.smash.filter(id => id !== userId);
    }
  }

  db.votes[charId] = votes;
  saveAnimeDB(db);

  const total = votes.smash.length + votes.pass.length;
  const smashPct = total ? Math.round((votes.smash.length / total) * 100) : 0;

  const newRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`anime_smash_${charId}`)
      .setLabel(`💚 Smash (${votes.smash.length})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`anime_pass_${charId}`)
      .setLabel(`💔 Pass (${votes.pass.length})`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`anime_stats_${charId}`)
      .setLabel("📊 Stats")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({ components: [newRow] });
}

// ── Commandes slash anime ─────────────────────────────────────────────────
const animeCommandDef = new SlashCommandBuilder()
  .setName("anime")
  .setDescription("🎌 Smash or Pass Anime")
  .addSubcommand(s => s
    .setName("now")
    .setDescription("🎌 [ADMIN] Poster un personnage maintenant"))
  .addSubcommand(s => s
    .setName("classement")
    .setDescription("🏆 Voir le classement des personnages les plus smashés"))
  .toJSON();

async function handleAnimeCommand(interaction, cfg) {
  const sub = interaction.options.getSubcommand();

  if (sub === "now") {
    if (!cfg.animeChannelId) {
      return interaction.reply({ content: "❌ Configure d'abord le salon avec `/setup anime`", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await postAnimeCharacter(interaction.client, cfg.animeChannelId);
    return interaction.editReply({ content: "✅ Personnage posté !" });
  }

  if (sub === "classement") {
    const db = loadAnimeDB();
    const chars = db.history
      .map(h => {
        const votes = db.votes[h.charId] || { smash: [], pass: [] };
        const total = votes.smash.length + votes.pass.length;
        const pct   = total ? Math.round((votes.smash.length / total) * 100) : 0;
        return { ...h, smash: votes.smash.length, pass: votes.pass.length, total, pct };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 10);

    if (!chars.length) {
      return interaction.reply({ content: "Aucun vote enregistré pour l'instant !", ephemeral: true });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = chars.map((c, i) =>
      `${medals[i] || `\`#${i+1}\``} **${c.name}** — 💚 ${c.pct}% Smash (${c.smash}/${c.total} votes)`
    );

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("🏆 Classement Smash or Pass Anime")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Les personnages les plus smashés du serveur 🔥" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
}

// ── Démarrer le planificateur ─────────────────────────────────────────────
function startAnimeScheduler(client, cfg) {
  if (!cfg.animeChannelId || !cfg.animeIntervalHours) return;

  const intervalMs = cfg.animeIntervalHours * 60 * 60 * 1000;
  console.log(`[ANIME] ✅ Planificateur démarré — personnage toutes les ${cfg.animeIntervalHours}h`);

  // Poster immédiatement puis à intervalles réguliers
  postAnimeCharacter(client, cfg.animeChannelId);
  setInterval(() => postAnimeCharacter(client, cfg.animeChannelId), intervalMs);
}

module.exports = { animeCommandDef, handleAnimeCommand, handleAnimeVote, startAnimeScheduler, postAnimeCharacter };
