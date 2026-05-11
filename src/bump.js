// src/bump.js — Système Bump Automatique 🚀

const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const fs   = require("fs");
const path = require("path");

const BUMP_FILE = path.join(__dirname, "../data/bump.json");
const DISBOARD_ID = "302050872383242240"; // ID officiel du bot Disboard

function loadBumpDB() {
  if (!fs.existsSync(BUMP_FILE)) return { scores: {}, lastBump: null, lastReminder: null };
  return JSON.parse(fs.readFileSync(BUMP_FILE, "utf-8"));
}
function saveBumpDB(db) {
  fs.mkdirSync(path.dirname(BUMP_FILE), { recursive: true });
  fs.writeFileSync(BUMP_FILE, JSON.stringify(db, null, 2));
}

// ── Détecter quand Disboard confirme un bump ──────────────────────────────
async function handleBumpDetection(message, addXPCallback) {
  // Disboard envoie un embed quand quelqu'un bump
  if (message.author.id !== DISBOARD_ID) return false;
  if (!message.embeds.length) return false;

  const embed = message.embeds[0];
  if (!embed.description?.includes("Bump done") && !embed.description?.includes("bien reçu")) return false;

  // Trouver qui a bump — regarder les messages récents
  const messages = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
  if (!messages) return false;

  // Trouver le dernier /bump utilisé
  const bumpMsg = messages.find(m =>
    m.author.id !== DISBOARD_ID &&
    m.interaction?.commandName === "bump"
  );

  const bumperId = bumpMsg?.author?.id || null;

  const db = loadBumpDB();
  db.lastBump = Date.now();

  if (bumperId) {
    db.scores[bumperId] = (db.scores[bumperId] || 0) + 1;
    saveBumpDB(db);

    // +100 XP bonus
    if (addXPCallback) addXPCallback(bumperId, 100);

    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle("🚀 Serveur Bumped !")
        .setDescription(
          `Merci <@${bumperId}> d'avoir bumped le serveur ! 🙏\n\n` +
          `⚡ **+100 XP bonus** remporté !\n` +
          `🏆 Tu as bumped **${db.scores[bumperId]}** fois !\n\n` +
          `⏰ Prochain bump possible dans **2 heures**`
        )
      ]
    });
  } else {
    saveBumpDB(db);
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setDescription("🚀 Serveur bumped ! Merci à celui qui l'a fait ! **+100 XP** attribués !")
      ]
    });
  }

  // Planifier le prochain rappel dans 2h
  setTimeout(() => sendBumpReminder(message.client, message.channelId), 2 * 60 * 60 * 1000);

  return true;
}

// ── Envoyer un rappel de bump ─────────────────────────────────────────────
async function sendBumpReminder(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const db = loadBumpDB();
  db.lastReminder = Date.now();
  saveBumpDB(db);

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("⏰ Il est temps de bumper !")
      .setDescription(
        `Le serveur peut être bumped à nouveau !\n\n` +
        `👆 Tape \`/bump\` pour nous aider à grandir !\n` +
        `⚡ Récompense : **+100 XP bonus**\n\n` +
        `*Ça prend 2 secondes et ça aide énormément !* 🚀`
      )
    ]
  });
}

// ── Démarrer les rappels automatiques ────────────────────────────────────
function startBumpScheduler(client, cfg) {
  const channelId = cfg.bumpChannelId || cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  if (!channelId) return;

  const db = loadBumpDB();

  // Si le dernier bump date de plus de 2h → envoyer un rappel maintenant
  const now = Date.now();
  const timeSinceLastBump = now - (db.lastBump || 0);
  const twoHours = 2 * 60 * 60 * 1000;

  if (timeSinceLastBump >= twoHours) {
    // Attendre 30 secondes après le démarrage puis envoyer
    setTimeout(() => sendBumpReminder(client, channelId), 30 * 1000);
  } else {
    // Attendre le reste du cooldown
    const remaining = twoHours - timeSinceLastBump;
    setTimeout(() => {
      sendBumpReminder(client, channelId);
      // Puis toutes les 2h
      setInterval(() => sendBumpReminder(client, channelId), twoHours);
    }, remaining);
  }

  // Rappel toutes les 2h de toute façon
  setInterval(() => {
    const db2 = loadBumpDB();
    const elapsed = Date.now() - (db2.lastBump || 0);
    if (elapsed >= twoHours) sendBumpReminder(client, channelId);
  }, twoHours);

  console.log("[BUMP] ✅ Planificateur de rappels démarré !");
}

// ── Commande /bump-stats ──────────────────────────────────────────────────
const bumpCommandDef = new SlashCommandBuilder()
  .setName("bumpstats")
  .setDescription("🚀 Voir le classement des meilleurs bumpeurs")
  .toJSON();

async function handleBumpCommand(interaction) {
  const db     = loadBumpDB();
  const sorted = Object.entries(db.scores).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (!sorted.length) {
    return interaction.reply({ content: "Personne n'a encore bumped ! Tape `/bump` pour être le premier 🚀", ephemeral: true });
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines  = sorted.map(([id, count], i) =>
    `${medals[i] || `\`#${i+1}\``} <@${id}> — **${count}** bump(s)`
  );

  const lastBump = db.lastBump
    ? `<t:${Math.floor(db.lastBump / 1000)}:R>`
    : "*Jamais*";

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🚀 Classement des Bumpeurs")
    .setDescription(lines.join("\n"))
    .addFields({ name: "⏰ Dernier bump", value: lastBump, inline: true })
    .setFooter({ text: "Tape /bump toutes les 2h pour gagner +100 XP !" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

module.exports = { bumpCommandDef, handleBumpCommand, handleBumpDetection, startBumpScheduler };
