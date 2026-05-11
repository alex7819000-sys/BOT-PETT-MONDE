// src/animalWar.js — Guerre Chien vs Chat 🐶 vs 🐱

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const WAR_DB_FILE = path.join(__dirname, "../data/animalWar.json");

function loadWarDB() {
  if (!fs.existsSync(WAR_DB_FILE)) return { teams: {}, weeklyPoints: { chien: 0, chat: 0 }, history: [] };
  return JSON.parse(fs.readFileSync(WAR_DB_FILE, "utf-8"));
}

function saveWarDB(db) {
  fs.mkdirSync(path.dirname(WAR_DB_FILE), { recursive: true });
  fs.writeFileSync(WAR_DB_FILE, JSON.stringify(db, null, 2));
}

// ── Mots déclencheurs ─────────────────────────────────────────────────────
const CHIEN_WORDS = ["woaf", "woof", "wouf", "ouaf", "🐶", "🐕"];
const CHAT_WORDS  = ["miaou", "meow", "miao", "miaw", "🐱", "🐈"];

// ── Rejoindre une équipe ──────────────────────────────────────────────────
function joinTeam(userId, team) {
  const db = loadWarDB();
  db.teams[userId] = team;
  saveWarDB(db);
}

function getUserTeam(userId) {
  const db = loadWarDB();
  return db.teams[userId] || null;
}

// ── Ajouter des points à une équipe ──────────────────────────────────────
function addTeamPoints(team, points = 1) {
  const db = loadWarDB();
  db.weeklyPoints[team] = (db.weeklyPoints[team] || 0) + points;
  saveWarDB(db);
}

// ── Détecter l'équipe depuis un message ──────────────────────────────────
function detectTeamWord(content) {
  const lower = content.toLowerCase();
  for (const word of CHIEN_WORDS) {
    if (lower.includes(word.toLowerCase())) return "chien";
  }
  for (const word of CHAT_WORDS) {
    if (lower.includes(word.toLowerCase())) return "chat";
  }
  return null;
}

// ── Handler message pour guerre ───────────────────────────────────────────
async function handleWarMessage(message) {
  if (message.author.bot) return false;
  const teamWord = detectTeamWord(message.content);
  if (!teamWord) return false;

  const db     = loadWarDB();
  const userId = message.author.id;
  const currentTeam = db.teams[userId];

  // Si pas encore d'équipe → proposer de rejoindre
  if (!currentTeam) {
    const embed = new EmbedBuilder()
      .setColor(teamWord === "chien" ? 0x8B4513 : 0xFF69B4)
      .setTitle(teamWord === "chien" ? "🐶 Tu sembles être un chien ?" : "🐱 Tu sembles être un chat ?")
      .setDescription(`Rejoins l'équipe **${teamWord === "chien" ? "🐶 Chien" : "🐱 Chat"}** pour participer à la guerre hebdomadaire !\n\n*Tu pourras changer d'équipe avec \`/guerre equipe\`*`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`war_join_chien_${userId}`)
        .setLabel("🐶 Rejoindre les Chiens")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`war_join_chat_${userId}`)
        .setLabel("🐱 Rejoindre les Chats")
        .setStyle(ButtonStyle.Secondary),
    );

    await message.reply({ embeds: [embed], components: [row] });
    return true;
  }

  // Si l'équipe correspond → ajouter des points + répondre
  if (currentTeam === teamWord) {
    addTeamPoints(teamWord, 1);

    // "Good boy/girl" si woof/woaf
    if (teamWord === "chien") {
      const responses = [
        `🐾 Good boy/girl <@${userId}> ! *pat pat* 👋`,
        `🦴 <@${userId}> a rapporté un point pour les **🐶 Chiens** ! Woaf !`,
        `🐶 *tail wagging* Good boy/girl <@${userId}> ! +1 point pour les chiens !`,
      ];
      await message.reply(responses[Math.floor(Math.random() * responses.length)]);
    } else {
      const responses = [
        `🐾 Miaou <@${userId}> ~ *ronronron* +1 point pour les **🐱 Chats** !`,
        `🐟 <@${userId}> a rapporté un point pour les **🐱 Chats** ! Purrr~`,
        `😺 *ronron* Bien joué <@${userId}> ! Les chats avancent !`,
      ];
      await message.reply(responses[Math.floor(Math.random() * responses.length)]);
    }
    return true;
  }

  // Si l'équipe adverse → taquiner
  if (currentTeam !== teamWord) {
    if (teamWord === "chien" && currentTeam === "chat") {
      await message.reply(`😹 <@${userId}> tu es un **chat** qui fait woaf ? Traître ! 🐱➡️🐶`);
    } else {
      await message.reply(`😂 <@${userId}> tu es un **chien** qui fait miaou ? Bizarre ! 🐶➡️🐱`);
    }
    return true;
  }

  return false;
}

// ── Handler boutons rejoindre ─────────────────────────────────────────────
async function handleWarButton(interaction) {
  const parts  = interaction.customId.split("_");
  const team   = parts[2]; // chien ou chat
  const userId = parts[3];

  // Seul l'utilisateur concerné peut cliquer
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "❌ Ce bouton n'est pas pour toi !", ephemeral: true });
  }

  joinTeam(userId, team);
  addTeamPoints(team, 1);

  const embed = new EmbedBuilder()
    .setColor(team === "chien" ? 0x8B4513 : 0xFF69B4)
    .setTitle(team === "chien" ? "🐶 Bienvenue chez les Chiens !" : "🐱 Bienvenue chez les Chats !")
    .setDescription(
      team === "chien"
        ? "Tu fais maintenant partie de la **team 🐶 Chien** !\nCrie **woaf** pour rapporter des points à ton équipe chaque semaine !"
        : "Tu fais maintenant partie de la **team 🐱 Chat** !\nCrie **miaou** pour rapporter des points à ton équipe chaque semaine !"
    )
    .setFooter({ text: "Résultat révélé chaque vendredi soir avec le King of the Day !" });

  await interaction.update({ embeds: [embed], components: [] });
}

// ── Reset hebdomadaire + annonce résultats ────────────────────────────────
async function runWarCeremony(client, cfg) {
  const db = loadWarDB();
  const { chien, chat } = db.weeklyPoints;
  const total = chien + chat;

  if (total === 0) return; // Pas de votes cette semaine

  const winner   = chien > chat ? "chien" : chat > chien ? "chat" : "egalite";
  const chienPct = total ? Math.round((chien / total) * 100) : 50;
  const chatPct  = 100 - chienPct;

  const bar = `${"🐶".repeat(Math.round(chienPct / 10))}${"🐱".repeat(10 - Math.round(chienPct / 10))}`;

  // Compter les membres par équipe
  const chienMembers = Object.values(db.teams).filter(t => t === "chien").length;
  const chatMembers  = Object.values(db.teams).filter(t => t === "chat").length;

  let title, color, desc;
  if (winner === "chien") {
    title = "🐶 Les Chiens remportent la semaine !";
    color = 0x8B4513;
    desc  = `**Woaf woaf !** Les chiens dominent cette semaine ! 🦴`;
  } else if (winner === "chat") {
    title = "🐱 Les Chats remportent la semaine !";
    color = 0xFF69B4;
    desc  = `**Miaou !** Les chats règnent cette semaine ! 🐟`;
  } else {
    title = "🤝 Égalité entre Chiens et Chats !";
    color = 0x9B59B6;
    desc  = `Incroyable ! Les deux équipes sont à égalité cette semaine !`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⚔️ Résultat de la Guerre Animale — Semaine ${new Date().toLocaleDateString("fr-FR")}`)
    .setDescription(desc)
    .addFields(
      { name: "📊 Score de la semaine", value: `${bar}\n🐶 **${chien}** points (${chienPct}%) vs 🐱 **${chat}** points (${chatPct}%)`, inline: false },
      { name: "🐶 Team Chien", value: `**${chienMembers}** membres`, inline: true },
      { name: "🐱 Team Chat", value: `**${chatMembers}** membres`, inline: true },
    )
    .setFooter({ text: "La guerre repart à zéro la semaine prochaine ! Qui gagnera ? 👀" })
    .setTimestamp();

  // Sauvegarder dans l'historique
  db.history.unshift({ week: new Date().toLocaleDateString("fr-FR"), chien, chat, winner });
  db.history = db.history.slice(0, 12); // Garder 12 semaines

  // Reset points hebdo
  db.weeklyPoints = { chien: 0, chat: 0 };
  saveWarDB(db);

  // Poster dans le salon d'annonce
  const channelId = cfg.warChannelId || cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] });
}

// ── Commandes slash ───────────────────────────────────────────────────────
const warCommandDef = new SlashCommandBuilder()
  .setName("guerre")
  .setDescription("⚔️ Guerre Chien vs Chat")
  .addSubcommand(s => s
    .setName("stats")
    .setDescription("📊 Voir les stats de la guerre cette semaine"))
  .addSubcommand(s => s
    .setName("equipe")
    .setDescription("🔄 Changer ou voir son équipe"))
  .addSubcommand(s => s
    .setName("historique")
    .setDescription("📜 Voir les résultats des semaines passées"))
  .addSubcommand(s => s
    .setName("membres")
    .setDescription("👥 Voir les membres de chaque équipe"))
  .toJSON();

async function handleWarCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "stats") {
    const db    = loadWarDB();
    const { chien, chat } = db.weeklyPoints;
    const total = chien + chat;
    const chienPct = total ? Math.round((chien / total) * 100) : 50;
    const chatPct  = 100 - chienPct;
    const bar = `${"🐶".repeat(Math.round(chienPct / 10))}${"🐱".repeat(10 - Math.round(chienPct / 10))}`;
    const chienMembers = Object.values(db.teams).filter(t => t === "chien").length;
    const chatMembers  = Object.values(db.teams).filter(t => t === "chat").length;

    const embed = new EmbedBuilder()
      .setColor(chien >= chat ? 0x8B4513 : 0xFF69B4)
      .setTitle("⚔️ Guerre Chien vs Chat — Stats semaine")
      .setDescription(`${bar}`)
      .addFields(
        { name: "🐶 Chiens", value: `**${chien}** points — ${chienPct}%\n👥 ${chienMembers} membres`, inline: true },
        { name: "🐱 Chats", value: `**${chat}** points — ${chatPct}%\n👥 ${chatMembers} membres`, inline: true },
        { name: "📅 Reset", value: "Chaque vendredi soir avec le King of the Day !", inline: false },
      )
      .setFooter({ text: "Crie woaf ou miaou pour rapporter des points !" });

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "equipe") {
    const db   = loadWarDB();
    const team = db.teams[interaction.user.id];

    const embed = new EmbedBuilder()
      .setColor(team === "chien" ? 0x8B4513 : team === "chat" ? 0xFF69B4 : 0x95A5A6)
      .setTitle("🐾 Choisis ton équipe !")
      .setDescription(
        team
          ? `Tu es actuellement dans la **team ${team === "chien" ? "🐶 Chien" : "🐱 Chat"}**.\nTu peux changer d'équipe ci-dessous.`
          : "Tu n'as pas encore choisi d'équipe ! Rejoins les chiens ou les chats !"
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`war_join_chien_${interaction.user.id}`)
        .setLabel("🐶 Team Chien")
        .setStyle(team === "chien" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`war_join_chat_${interaction.user.id}`)
        .setLabel("🐱 Team Chat")
        .setStyle(team === "chat" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  if (sub === "historique") {
    const db = loadWarDB();
    if (!db.history.length) {
      return interaction.reply({ content: "Pas encore d'historique !", ephemeral: true });
    }

    const lines = db.history.map((h, i) => {
      const icon = h.winner === "chien" ? "🐶" : h.winner === "chat" ? "🐱" : "🤝";
      return `**${h.week}** — ${icon} ${h.winner === "egalite" ? "Égalité" : `Victoire ${h.winner}`} (🐶 ${h.chien} vs 🐱 ${h.chat})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle("📜 Historique Guerre Animale")
      .setDescription(lines.join("\n"))
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "membres") {
    const db = loadWarDB();
    const chienIds = Object.entries(db.teams).filter(([, t]) => t === "chien").map(([id]) => `<@${id}>`);
    const chatIds  = Object.entries(db.teams).filter(([, t]) => t === "chat").map(([id]) => `<@${id}>`);

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle("👥 Membres des équipes")
      .addFields(
        { name: `🐶 Chiens (${chienIds.length})`, value: chienIds.slice(0, 20).join(", ") || "*Aucun*", inline: false },
        { name: `🐱 Chats (${chatIds.length})`, value: chatIds.slice(0, 20).join(", ") || "*Aucun*", inline: false },
      );

    return interaction.reply({ embeds: [embed] });
  }
}

module.exports = { warCommandDef, handleWarCommand, handleWarMessage, handleWarButton, runWarCeremony };
