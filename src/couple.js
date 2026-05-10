// src/couple.js — Meilleur Couple 💑

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const COUPLE_FILE = path.join(__dirname, "../data/couple.json");

function loadCoupleDB() {
  if (!fs.existsSync(COUPLE_FILE)) return { nominations: {}, currentCouple: null, phase: "nominations", votes: {} };
  return JSON.parse(fs.readFileSync(COUPLE_FILE, "utf-8"));
}
function saveCoupleDB(db) {
  fs.mkdirSync(path.dirname(COUPLE_FILE), { recursive: true });
  fs.writeFileSync(COUPLE_FILE, JSON.stringify(db, null, 2));
}

// ── Commande /couple ──────────────────────────────────────────────────────
const coupleCommandDef = new SlashCommandBuilder()
  .setName("couple")
  .setDescription("💑 Meilleur Couple du Serveur")
  .addSubcommand(s => s
    .setName("nominer")
    .setDescription("💕 Nominer un couple")
    .addUserOption(o => o.setName("membre1").setDescription("Premier membre du couple").setRequired(true))
    .addUserOption(o => o.setName("membre2").setDescription("Deuxième membre du couple").setRequired(true)))
  .addSubcommand(s => s
    .setName("stats")
    .setDescription("📊 Voir les nominations actuelles"))
  .addSubcommand(s => s
    .setName("actuel")
    .setDescription("💑 Voir le couple actuel"))
  .toJSON();

// ── Handler principal ─────────────────────────────────────────────────────
async function handleCoupleCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "nominer") return handleNominate(interaction);
  if (sub === "stats")   return handleStats(interaction);
  if (sub === "actuel")  return handleCurrent(interaction);
}

// ── Nominer un couple ─────────────────────────────────────────────────────
async function handleNominate(interaction) {
  const db      = loadCoupleDB();
  const userId  = interaction.user.id;
  const membre1 = interaction.options.getUser("membre1");
  const membre2 = interaction.options.getUser("membre2");

  if (db.phase !== "nominations") {
    return interaction.reply({ content: "❌ Les nominations sont fermées ! Le vote final est en cours.", ephemeral: true });
  }

  if (membre1.id === membre2.id) {
    return interaction.reply({ content: "❌ Tu ne peux pas nominer la même personne deux fois !", ephemeral: true });
  }

  if (membre1.bot || membre2.bot) {
    return interaction.reply({ content: "❌ Tu ne peux pas nominer un bot !", ephemeral: true });
  }

  if (db.nominations[userId]) {
    return interaction.reply({ content: "❌ Tu as déjà nominé un couple cette semaine !", ephemeral: true });
  }

  // Créer un ID de couple trié pour éviter les doublons (A+B = B+A)
  const coupleKey = [membre1.id, membre2.id].sort().join("+");
  db.nominations[userId] = coupleKey;

  if (!db.coupleCounts) db.coupleCounts = {};
  db.coupleCounts[coupleKey] = (db.coupleCounts[coupleKey] || 0) + 1;

  saveCoupleDB(db);

  const votes = db.coupleCounts[coupleKey];
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("💕 Nomination enregistrée !")
      .setDescription(`Tu as nominé **<@${membre1.id}>** et **<@${membre2.id}>** comme meilleur couple !\n\nCe couple a maintenant **${votes}** nomination(s) 💑`)
      .setFooter({ text: "Le vote final aura lieu jeudi soir !" })
    ],
    ephemeral: true
  });

  await interaction.channel.send(`💕 Quelqu'un vient de nominer un couple pour le titre de **Meilleur Couple** de la semaine...`).catch(() => {});
}

// ── Stats nominations ─────────────────────────────────────────────────────
async function handleStats(interaction) {
  const db = loadCoupleDB();
  const counts = db.coupleCounts || {};
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!sorted.length) return interaction.reply({ content: "Aucune nomination encore !", ephemeral: true });

  const lines = sorted.map(([key, count], i) => {
    const [id1, id2] = key.split("+");
    return `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`#${i+1}\``} <@${id1}> 💕 <@${id2}> — **${count}** nomination(s)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("💑 Nominations Meilleur Couple")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Les 3 couples les plus nominés passeront au vote final jeudi soir !" });

  await interaction.reply({ embeds: [embed] });
}

// ── Couple actuel ─────────────────────────────────────────────────────────
async function handleCurrent(interaction) {
  const db = loadCoupleDB();
  if (!db.currentCouple) return interaction.reply({ content: "Aucun couple élu cette semaine !", ephemeral: true });

  const [id1, id2] = db.currentCouple.key.split("+");
  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("💑 Meilleur Couple de la Semaine")
    .setDescription(`<@${id1}> 💕 <@${id2}>\n\n**${db.currentCouple.votes}** vote(s) cette semaine !`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Lancer le vote final (jeudi soir) ────────────────────────────────────
async function launchCoupleVote(client, cfg) {
  const db     = loadCoupleDB();
  const counts = db.coupleCounts || {};
  const top3   = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top3.length) return;

  db.phase    = "vote";
  db.finalists = top3.map(([key, count]) => ({ key, count }));
  db.votes     = {};
  saveCoupleDB(db);

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const buttons = top3.map(([key, count]) => {
    const [id1, id2] = key.split("+");
    return new ButtonBuilder()
      .setCustomId(`couple_vote_${key}`)
      .setLabel(`💕 ${count} noms`)
      .setStyle(ButtonStyle.Primary);
  });

  const lines = top3.map(([key, count], i) => {
    const [id1, id2] = key.split("+");
    return `${i+1}. <@${id1}> 💕 <@${id2}> — ${count} nominations`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("💑 VOTE FINAL — Meilleur Couple de la Semaine !")
    .setDescription(`Les **3 couples finalistes** :\n\n${lines.join("\n")}\n\n**Vote pour le meilleur couple !** 👇`)
    .setFooter({ text: "1 vote par personne • Résultat vendredi soir" });

  const row = new ActionRowBuilder().addComponents(buttons);
  await channel.send({ embeds: [embed], components: [row] });
}

// ── Gérer les votes ───────────────────────────────────────────────────────
async function handleCoupleVote(interaction) {
  const db      = loadCoupleDB();
  const userId  = interaction.user.id;
  const coupleKey = interaction.customId.replace("couple_vote_", "");

  if (db.votes[userId]) return interaction.reply({ content: "❌ Tu as déjà voté !", ephemeral: true });

  db.votes[userId] = coupleKey;
  saveCoupleDB(db);

  const [id1, id2] = coupleKey.split("+");
  await interaction.reply({ content: `✅ Vote enregistré pour <@${id1}> 💕 <@${id2}> !`, ephemeral: true });
}

// ── Cérémonie vendredi ────────────────────────────────────────────────────
async function runCoupleCeremony(client, cfg) {
  const db = loadCoupleDB();

  const voteCounts = {};
  Object.values(db.votes || {}).forEach(key => {
    voteCounts[key] = (voteCounts[key] || 0) + 1;
  });

  const source = Object.keys(voteCounts).length ? voteCounts : (db.coupleCounts || {});
  const sorted = Object.entries(source).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return;

  const [winnerKey, winnerVotes] = sorted[0];
  const [id1, id2] = winnerKey.split("+");

  // Donner les rôles
  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (guild && cfg.coupleRoleId) {
    // Retirer l'ancien couple
    if (db.currentCouple) {
      const [old1, old2] = db.currentCouple.key.split("+");
      for (const id of [old1, old2]) {
        const m = await guild.members.fetch(id).catch(() => null);
        if (m) await m.roles.remove(cfg.coupleRoleId).catch(() => {});
      }
    }
    // Donner au nouveau couple
    for (const id of [id1, id2]) {
      const m = await guild.members.fetch(id).catch(() => null);
      if (m) await m.roles.add(cfg.coupleRoleId).catch(() => {});
    }
  }

  db.currentCouple = { key: winnerKey, votes: winnerVotes };
  db.nominations   = {};
  db.coupleCounts  = {};
  db.votes         = {};
  db.phase         = "nominations";
  saveCoupleDB(db);

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("💑 LE MEILLEUR COUPLE DE LA SEMAINE EST ÉLU !")
    .setDescription(
      `Avec **${winnerVotes}** vote(s), le meilleur couple est...\n\n` +
      `# <@${id1}> 💕 <@${id2}>\n\n` +
      `🎊 Félicitations à vous deux !`
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

module.exports = {
  coupleCommandDef, handleCoupleCommand, handleCoupleVote,
  launchCoupleVote, runCoupleCeremony
};
