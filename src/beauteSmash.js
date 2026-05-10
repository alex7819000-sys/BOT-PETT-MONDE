// src/beauteSmash.js — Smash or Pass Membres (photos anonymes + classement)

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, AttachmentBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const BEAUTE_DB_FILE = path.join(__dirname, "../data/beauteSmash.json");

function loadBeauteDB() {
  if (!fs.existsSync(BEAUTE_DB_FILE)) return { submissions: {}, votes: {} };
  return JSON.parse(fs.readFileSync(BEAUTE_DB_FILE, "utf-8"));
}

function saveBeauteDB(db) {
  fs.mkdirSync(path.dirname(BEAUTE_DB_FILE), { recursive: true });
  fs.writeFileSync(BEAUTE_DB_FILE, JSON.stringify(db, null, 2));
}

// Générer un ID unique pour la soumission
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ── Commandes slash beauté ────────────────────────────────────────────────
const beauteCommandDef = new SlashCommandBuilder()
  .setName("beaute")
  .setDescription("💅 Smash or Pass Membres")
  .addSubcommand(s => s
    .setName("soumettre")
    .setDescription("📸 Soumettre une photo anonyme pour le vote"))
  .addSubcommand(s => s
    .setName("classement")
    .setDescription("🏆 Voir le classement des membres"))
  .addSubcommand(s => s
    .setName("moi")
    .setDescription("📊 Voir mes stats personnelles"))
  .addSubcommand(s => s
    .setName("approuver")
    .setDescription("✅ [ADMIN] Approuver une soumission en attente")
    .addStringOption(o => o.setName("id").setDescription("ID de la soumission").setRequired(true)))
  .addSubcommand(s => s
    .setName("refuser")
    .setDescription("❌ [ADMIN] Refuser une soumission")
    .addStringOption(o => o.setName("id").setDescription("ID de la soumission").setRequired(true)))
  .addSubcommand(s => s
    .setName("en_attente")
    .setDescription("📋 [ADMIN] Voir les soumissions en attente"))
  .toJSON();

// ── Handler principal ─────────────────────────────────────────────────────
async function handleBeauteCommand(interaction, cfg) {
  const sub = interaction.options.getSubcommand();

  if (sub === "soumettre") return handleSoumettre(interaction, cfg);
  if (sub === "classement") return handleClassement(interaction);
  if (sub === "moi") return handleMesStats(interaction);
  if (sub === "approuver") return handleApprouver(interaction, cfg);
  if (sub === "refuser") return handleRefuser(interaction);
  if (sub === "en_attente") return handleEnAttente(interaction);
}

// ── Soumettre une photo ───────────────────────────────────────────────────
async function handleSoumettre(interaction, cfg) {
  if (!cfg.beauteChannelId) {
    return interaction.reply({ content: "❌ Configure d'abord le salon avec `/setup beaute`", ephemeral: true });
  }

  // Vérifier si a déjà une soumission active
  const db = loadBeauteDB();
  const hasActive = Object.values(db.submissions).some(
    s => s.userId === interaction.user.id && s.status === "active"
  );

  if (hasActive) {
    return interaction.reply({
      content: "❌ Tu as déjà une photo active en vote ! Attends qu'elle soit terminée.",
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("beaute_submit_modal")
    .setTitle("📸 Soumettre une photo");

  const urlInput = new TextInputBuilder()
    .setCustomId("photo_url")
    .setLabel("Lien de ta photo (imgur, discord cdn, etc.)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://i.imgur.com/exemple.jpg")
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId("photo_desc")
    .setLabel("Description courte (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: Photo de vacances 🌴")
    .setRequired(false)
    .setMaxLength(100);

  modal.addComponents(
    new ActionRowBuilder().addComponents(urlInput),
    new ActionRowBuilder().addComponents(descInput),
  );

  await interaction.showModal(modal);
}

// ── Traiter la soumission ─────────────────────────────────────────────────
async function handleBeauteModal(interaction, cfg) {
  const photoUrl = interaction.fields.getTextInputValue("photo_url");
  const desc     = interaction.fields.getTextInputValue("photo_desc") || "";

  // Validation URL basique
  if (!photoUrl.startsWith("http")) {
    return interaction.reply({ content: "❌ Lien invalide ! Utilise un lien qui commence par http", ephemeral: true });
  }

  const db  = loadBeauteDB();
  const id  = generateId();

  db.submissions[id] = {
    id,
    userId:    interaction.user.id,
    photoUrl,
    desc,
    status:    "pending", // pending, active, ended
    timestamp: Date.now(),
    messageId: null,
  };

  db.votes[id] = { smash: [], pass: [] };
  saveBeauteDB(db);

  // Notifier les admins
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle("✅ Photo soumise !")
      .setDescription("Ta photo est en attente de validation par un admin.\nElle sera postée anonymement une fois approuvée !")
      .setFooter({ text: `ID de ta soumission : ${id}` })
    ],
    ephemeral: true
  });

  // Notifier le canal admin si configuré
  if (cfg.beauteChannelId) {
    const channel = await interaction.client.channels.fetch(cfg.beauteChannelId).catch(() => null);
    if (channel) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle("📸 Nouvelle soumission en attente")
        .setDescription(`ID : \`${id}\`\nDescription : ${desc || "*Aucune*"}\n\nUtilise \`/beaute approuver ${id}\` ou \`/beaute refuser ${id}\``)
        .setImage(photoUrl);

      await channel.send({ embeds: [adminEmbed] }).catch(() => {});
    }
  }
}

// ── Approuver une soumission ──────────────────────────────────────────────
async function handleApprouver(interaction, cfg) {
  const id = interaction.options.getString("id");
  const db = loadBeauteDB();

  if (!db.submissions[id]) {
    return interaction.reply({ content: `❌ Soumission \`${id}\` introuvable`, ephemeral: true });
  }

  const sub = db.submissions[id];
  if (sub.status !== "pending") {
    return interaction.reply({ content: "❌ Cette soumission n'est pas en attente", ephemeral: true });
  }

  const channel = await interaction.client.channels.fetch(cfg.beauteChannelId).catch(() => null);
  if (!channel) {
    return interaction.reply({ content: "❌ Salon beauté introuvable, reconfigure avec `/setup beaute`", ephemeral: true });
  }

  const votes = db.votes[id];

  const embed = buildBeauteEmbed(id, sub, votes);
  const row   = buildBeauteRow(id, votes);

  const msg = await channel.send({ embeds: [embed], components: [row] });

  sub.status    = "active";
  sub.messageId = msg.id;
  saveBeauteDB(db);

  return interaction.reply({ content: `✅ Soumission \`${id}\` approuvée et postée !`, ephemeral: true });
}

// ── Refuser une soumission ────────────────────────────────────────────────
async function handleRefuser(interaction) {
  const id = interaction.options.getString("id");
  const db = loadBeauteDB();

  if (!db.submissions[id]) {
    return interaction.reply({ content: `❌ Soumission \`${id}\` introuvable`, ephemeral: true });
  }

  db.submissions[id].status = "refused";
  saveBeauteDB(db);

  return interaction.reply({ content: `✅ Soumission \`${id}\` refusée`, ephemeral: true });
}

// ── Voir les soumissions en attente ──────────────────────────────────────
async function handleEnAttente(interaction) {
  const db = loadBeauteDB();
  const pending = Object.values(db.submissions).filter(s => s.status === "pending");

  if (!pending.length) {
    return interaction.reply({ content: "✅ Aucune soumission en attente !", ephemeral: true });
  }

  const lines = pending.map(s =>
    `\`${s.id}\` — [Photo](${s.photoUrl}) — ${s.desc || "*Pas de description*"}`
  );

  const embed = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle(`📋 ${pending.length} soumission(s) en attente`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Utilise /beaute approuver <id> ou /beaute refuser <id>" });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Gérer les votes ───────────────────────────────────────────────────────
async function handleBeauteVote(interaction) {
  const parts  = interaction.customId.split("_");
  const action = parts[1]; // smash, pass, stats
  const subId  = parts[2];

  const db    = loadBeauteDB();
  const votes = db.votes[subId] || { smash: [], pass: [] };
  const sub   = db.submissions[subId];
  const userId = interaction.user.id;

  if (!sub) return interaction.reply({ content: "❌ Soumission introuvable", ephemeral: true });

  // Empêcher de voter pour sa propre photo
  if (sub.userId === userId) {
    return interaction.reply({ content: "😅 Tu ne peux pas voter pour ta propre photo !", ephemeral: true });
  }

  if (action === "stats") {
    const total    = votes.smash.length + votes.pass.length;
    const smashPct = total ? Math.round((votes.smash.length / total) * 100) : 0;
    const passPct  = total ? 100 - smashPct : 0;
    const score    = calcScore(votes);

    const bar = buildScoreBar(smashPct);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle("📊 Stats de cette photo")
        .setDescription(
          `${bar}\n\n` +
          `💚 **Smash :** ${votes.smash.length} (${smashPct}%)\n` +
          `💔 **Pass :** ${votes.pass.length} (${passPct}%)\n` +
          `⭐ **Score :** ${score}/100\n` +
          `👥 **Votants :** ${total}`
        )
      ],
      ephemeral: true
    });
  }

  // Voter
  if (action === "smash") {
    if (votes.smash.includes(userId)) {
      votes.smash = votes.smash.filter(id => id !== userId);
    } else {
      votes.smash.push(userId);
      votes.pass = votes.pass.filter(id => id !== userId);
    }
  } else if (action === "pass") {
    if (votes.pass.includes(userId)) {
      votes.pass = votes.pass.filter(id => id !== userId);
    } else {
      votes.pass.push(userId);
      votes.smash = votes.smash.filter(id => id !== userId);
    }
  }

  db.votes[subId] = votes;
  saveBeauteDB(db);

  const newEmbed = buildBeauteEmbed(subId, sub, votes);
  const newRow   = buildBeauteRow(subId, votes);

  await interaction.update({ embeds: [newEmbed], components: [newRow] });
}

// ── Classement ────────────────────────────────────────────────────────────
async function handleClassement(interaction) {
  const db = loadBeauteDB();

  const ranked = Object.entries(db.submissions)
    .filter(([id, s]) => s.status === "active" || s.status === "ended")
    .map(([id, s]) => {
      const votes = db.votes[id] || { smash: [], pass: [] };
      const total = votes.smash.length + votes.pass.length;
      const pct   = total ? Math.round((votes.smash.length / total) * 100) : 0;
      const score = calcScore(votes);
      return { id, sub: s, votes, total, pct, score };
    })
    .filter(r => r.total > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (!ranked.length) {
    return interaction.reply({ content: "Aucun vote encore ! Soumets une photo avec `/beaute soumettre`", ephemeral: true });
  }

  const medals = ["🥇", "🥈", "🥉"];

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("💅 Classement Smash or Pass Membres")
    .setDescription(
      ranked.map((r, i) =>
        `${medals[i] || `\`#${i+1}\``} **Photo anonyme** — ⭐ Score : **${r.score}/100** — 💚 ${r.pct}% (${r.votes.smash.length}/${r.total})`
      ).join("\n")
    )
    .setThumbnail(ranked[0]?.sub.photoUrl)
    .setFooter({ text: "Score calculé sur le ratio smash/pass et le nombre de votes" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

// ── Mes stats ─────────────────────────────────────────────────────────────
async function handleMesStats(interaction) {
  const db   = loadBeauteDB();
  const userId = interaction.user.id;

  const mySubs = Object.entries(db.submissions)
    .filter(([id, s]) => s.userId === userId)
    .map(([id, s]) => {
      const votes = db.votes[id] || { smash: [], pass: [] };
      const total = votes.smash.length + votes.pass.length;
      const pct   = total ? Math.round((votes.smash.length / total) * 100) : 0;
      const score = calcScore(votes);
      return { id, sub: s, votes, total, pct, score };
    });

  if (!mySubs.length) {
    return interaction.reply({ content: "Tu n'as pas encore soumis de photo ! Utilise `/beaute soumettre`", ephemeral: true });
  }

  const totalSmash = mySubs.reduce((s, r) => s + r.votes.smash.length, 0);
  const totalVotes = mySubs.reduce((s, r) => s + r.total, 0);
  const avgScore   = mySubs.length ? Math.round(mySubs.reduce((s, r) => s + r.score, 0) / mySubs.length) : 0;
  const globalPct  = totalVotes ? Math.round((totalSmash / totalVotes) * 100) : 0;

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("📊 Mes statistiques")
    .setDescription(`
**Photos soumises :** ${mySubs.length}
**Smash total :** 💚 ${totalSmash}
**Votes total :** 👥 ${totalVotes}
**Ratio global :** ${globalPct}% Smash
**Score moyen :** ⭐ ${avgScore}/100
    `)
    .setFooter({ text: "Tes photos sont anonymes pour les autres membres" });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function calcScore(votes) {
  const total = votes.smash.length + votes.pass.length;
  if (total === 0) return 0;
  const ratio = votes.smash.length / total;
  // Score = ratio smash * 80 + bonus votes (max 20)
  const bonusVotes = Math.min(total / 10, 1) * 20;
  return Math.round(ratio * 80 + bonusVotes);
}

function buildScoreBar(pct) {
  const filled = Math.round(pct / 10);
  return `${"💚".repeat(filled)}${"🖤".repeat(10 - filled)} ${pct}%`;
}

function buildBeauteEmbed(id, sub, votes) {
  const total    = votes.smash.length + votes.pass.length;
  const smashPct = total ? Math.round((votes.smash.length / total) * 100) : 0;
  const score    = calcScore(votes);
  const bar      = buildScoreBar(smashPct);

  return new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("💅 Smash or Pass — Photo Anonyme")
    .setDescription(
      sub.desc ? `*"${sub.desc}"*\n\n` : "" +
      `${bar}\n\n` +
      `💚 **Smash :** ${votes.smash.length}   |   💔 **Pass :** ${votes.pass.length}\n` +
      `⭐ **Score :** ${score}/100   |   👥 **${total}** votes`
    )
    .setImage(sub.photoUrl)
    .setFooter({ text: "Vote maintenant ! Les photos sont anonymes 🙈" })
    .setTimestamp();
}

function buildBeauteRow(id, votes) {
  const total    = votes.smash.length + votes.pass.length;
  const smashPct = total ? Math.round((votes.smash.length / total) * 100) : 0;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`beaute_smash_${id}`)
      .setLabel(`💚 Smash (${votes.smash.length})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`beaute_pass_${id}`)
      .setLabel(`💔 Pass (${votes.pass.length})`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`beaute_stats_${id}`)
      .setLabel(`📊 ${smashPct}% Smash`)
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  beauteCommandDef, handleBeauteCommand, handleBeauteVote,
  handleBeauteModal
};
