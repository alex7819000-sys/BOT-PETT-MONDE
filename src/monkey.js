// src/monkey.js — Singe du Serveur 🐒 + Prison

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, ChannelType, PermissionFlagsBits
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const MONKEY_FILE = path.join(__dirname, "../data/monkey.json");

function loadMonkeyDB() {
  if (!fs.existsSync(MONKEY_FILE)) return { nominations: {}, currentMonkey: null, phase: "nominations", voteMessage: null };
  return JSON.parse(fs.readFileSync(MONKEY_FILE, "utf-8"));
}
function saveMonkeyDB(db) {
  fs.mkdirSync(path.dirname(MONKEY_FILE), { recursive: true });
  fs.writeFileSync(MONKEY_FILE, JSON.stringify(db, null, 2));
}

// ── Commande /singe ───────────────────────────────────────────────────────
const monkeyCommandDef = new SlashCommandBuilder()
  .setName("singe")
  .setDescription("🐒 Singe du Serveur")
  .addSubcommand(s => s
    .setName("nominer")
    .setDescription("🎯 Nominer quelqu'un comme singe de la semaine")
    .addUserOption(o => o.setName("membre").setDescription("Le membre à nominer").setRequired(true)))
  .addSubcommand(s => s
    .setName("stats")
    .setDescription("📊 Voir les nominations actuelles"))
  .addSubcommand(s => s
    .setName("actuel")
    .setDescription("🐒 Voir qui est le singe actuel"))
  .toJSON();

// ── Handler principal ─────────────────────────────────────────────────────
async function handleMonkeyCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "nominer") return handleNominate(interaction);
  if (sub === "stats")   return handleStats(interaction);
  if (sub === "actuel")  return handleCurrent(interaction);
}

// ── Nominer quelqu'un ─────────────────────────────────────────────────────
async function handleNominate(interaction) {
  const db     = loadMonkeyDB();
  const userId = interaction.user.id;
  const target = interaction.options.getUser("membre");

  if (db.phase !== "nominations") {
    return interaction.reply({ content: "❌ Les nominations sont fermées ! Le vote final est en cours.", ephemeral: true });
  }

  // Pas se nominer soi-même
  if (target.id === userId) {
    return interaction.reply({ content: "😂 Tu ne peux pas te nominer toi-même !", ephemeral: true });
  }

  // Pas nominer un bot
  if (target.bot) {
    return interaction.reply({ content: "❌ Tu ne peux pas nominer un bot !", ephemeral: true });
  }

  // 1 nomination par semaine
  if (db.nominations[userId]?.voted) {
    const alreadyNominated = db.nominations[userId].nominated;
    return interaction.reply({
      content: `❌ Tu as déjà nominé <@${alreadyNominated}> cette semaine !`,
      ephemeral: true
    });
  }

  // Enregistrer la nomination
  db.nominations[userId] = { nominated: target.id, voted: true };
  saveMonkeyDB(db);

  // Compter les votes pour la cible
  const votes = Object.values(db.nominations).filter(n => n.nominated === target.id).length;

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle("🐒 Nomination enregistrée !")
      .setDescription(`Tu as nominé <@${target.id}> comme singe de la semaine !\n\n**${target.username}** a maintenant **${votes}** nomination(s) 🎯`)
      .setFooter({ text: "Le vote final aura lieu jeudi soir !" })
    ],
    ephemeral: true
  });

  // Message public discret
  await interaction.channel.send(`🎯 Quelqu'un vient de faire une nomination pour le 🐒 Singe de la semaine...`).catch(() => {});
}

// ── Stats nominations ─────────────────────────────────────────────────────
async function handleStats(interaction) {
  const db = loadMonkeyDB();

  // Compter les nominations par personne
  const counts = {};
  Object.values(db.nominations).forEach(n => {
    counts[n.nominated] = (counts[n.nominated] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (!sorted.length) {
    return interaction.reply({ content: "Aucune nomination encore cette semaine !", ephemeral: true });
  }

  const lines = sorted.map(([id, count], i) =>
    `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`#${i+1}\``} <@${id}> — **${count}** nomination(s)`
  );

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle("🐒 Nominations Singe de la Semaine")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Les 3 plus nominés passeront au vote final jeudi soir !" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Singe actuel ──────────────────────────────────────────────────────────
async function handleCurrent(interaction) {
  const db = loadMonkeyDB();

  if (!db.currentMonkey) {
    return interaction.reply({ content: "Il n'y a pas de singe actuellement 🐒", ephemeral: true });
  }

  const releaseDate = new Date(db.currentMonkey.until);
  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle("🐒 Singe Actuel du Serveur")
    .setDescription(`<@${db.currentMonkey.userId}> est le singe du serveur cette semaine !\n\n🔒 Enfermé en prison jusqu'au **vendredi prochain**\n📅 Libération : <t:${Math.floor(db.currentMonkey.until / 1000)}:R>`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Lancer le vote final (jeudi soir) ────────────────────────────────────
async function launchMonkeyVote(client, cfg) {
  const db = loadMonkeyDB();

  // Compter les nominations
  const counts = {};
  Object.values(db.nominations).forEach(n => {
    counts[n.nominated] = (counts[n.nominated] || 0) + 1;
  });

  const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top3.length < 1) return;

  db.phase    = "vote";
  db.finalists = top3.map(([id, count]) => ({ id, count }));
  db.votes     = {};
  saveMonkeyDB(db);

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const buttons = top3.map(([id, count]) =>
    new ButtonBuilder()
      .setCustomId(`monkey_vote_${id}`)
      .setLabel(`🎯 ${count} nominations`)
      .setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle("🐒 VOTE FINAL — Singe de la Semaine !")
    .setDescription(
      `Les **3 plus nominés** sont :\n\n` +
      top3.map(([id, count], i) => `${i+1}. <@${id}> — ${count} nominations`).join("\n") +
      `\n\n**Qui sera le 🐒 Singe de la semaine ?**\nVote maintenant ! Résultat vendredi soir 👇`
    )
    .setFooter({ text: "1 vote par personne • Résultat vendredi soir" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(buttons);
  const msg = await channel.send({ embeds: [embed], components: [row] });

  db.voteMessage = { channelId: channel.id, messageId: msg.id };
  saveMonkeyDB(db);
}

// ── Gérer les votes ───────────────────────────────────────────────────────
async function handleMonkeyVote(interaction) {
  const db     = loadMonkeyDB();
  const userId = interaction.user.id;
  const target = interaction.customId.replace("monkey_vote_", "");

  if (db.votes[userId]) {
    return interaction.reply({ content: "❌ Tu as déjà voté !", ephemeral: true });
  }

  db.votes[userId] = target;
  saveMonkeyDB(db);

  const count = Object.values(db.votes).filter(v => v === target).length;
  await interaction.reply({ content: `✅ Vote enregistré pour <@${target}> ! (${count} votes)`, ephemeral: true });
}

// ── Cérémonie vendredi — élire le singe ──────────────────────────────────
async function runMonkeyCeremony(client, cfg) {
  const db = loadMonkeyDB();

  // Compter les votes finaux
  const voteCounts = {};
  Object.values(db.votes || {}).forEach(v => {
    voteCounts[v] = (voteCounts[v] || 0) + 1;
  });

  // Si pas de vote, utiliser les nominations
  const nominations = {};
  Object.values(db.nominations).forEach(n => {
    nominations[n.nominated] = (nominations[n.nominated] || 0) + 1;
  });

  const source = Object.keys(voteCounts).length ? voteCounts : nominations;
  const sorted = Object.entries(source).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return;

  const [monkeyId, monkeyVotes] = sorted[0];

  // Récupérer le serveur Discord
  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  // Trouver ou créer le salon prison
  let prisonChannel = guild.channels.cache.find(c => c.name.includes("prison"));
  if (!prisonChannel && cfg.prisonChannelId) {
    prisonChannel = await guild.channels.fetch(cfg.prisonChannelId).catch(() => null);
  }

  // Muter le singe partout sauf prison
  const monkeyMember = await guild.members.fetch(monkeyId).catch(() => null);
  if (monkeyMember) {
    // Donner le rôle singe si configuré
    if (cfg.monkeyRoleId) {
      // Retirer l'ancien singe
      if (db.currentMonkey) {
        const oldMonkey = await guild.members.fetch(db.currentMonkey.userId).catch(() => null);
        if (oldMonkey && cfg.monkeyRoleId) await oldMonkey.roles.remove(cfg.monkeyRoleId).catch(() => {});
      }
      await monkeyMember.roles.add(cfg.monkeyRoleId).catch(() => {});
    }
  }

  // Sauvegarder le nouveau singe
  const nextFriday = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.currentMonkey = { userId: monkeyId, until: nextFriday, votes: monkeyVotes };
  db.nominations   = {};
  db.votes         = {};
  db.phase         = "nominations";
  saveMonkeyDB(db);

  // Annonce
  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle("🐒 LE SINGE DE LA SEMAINE EST ÉLU !")
    .setDescription(
      `Avec **${monkeyVotes}** vote(s), le 🐒 **Singe de la Semaine** est...\n\n` +
      `# <@${monkeyId}> 🐒\n\n` +
      `🔒 Il/Elle est maintenant **en prison** jusqu'au prochain vendredi !\n` +
      `${prisonChannel ? `👉 Allez lui rendre visite dans <#${prisonChannel.id}>` : ""}\n\n` +
      `*Les nominations reprennent maintenant pour la semaine prochaine !*`
    )
    .setTimestamp();

  await channel.send({ content: `@everyone`, embeds: [embed] });

  // Message dans la prison
  if (prisonChannel) {
    await prisonChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x8B4513)
        .setDescription(`🔒 <@${monkeyId}> vient d'être emprisonné ici jusqu'au vendredi prochain ! Venez lui rendre visite ! 🐒\n\n*Il/Elle peut seulement parler dans ce salon !*`)
      ]
    });
  }
}

// ── Libérer le singe ──────────────────────────────────────────────────────
async function releaseMonkey(client, cfg) {
  const db = loadMonkeyDB();
  if (!db.currentMonkey) return;

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(db.currentMonkey.userId).catch(() => null);
  if (member && cfg.monkeyRoleId) {
    await member.roles.remove(cfg.monkeyRoleId).catch(() => {});
  }

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setDescription(`🎉 <@${db.currentMonkey.userId}> est libéré(e) de prison ! Bonne semaine... jusqu'au prochain vote 😈🐒`)
      ]
    });
  }

  db.currentMonkey = null;
  saveMonkeyDB(db);
}

module.exports = {
  monkeyCommandDef, handleMonkeyCommand, handleMonkeyVote,
  launchMonkeyVote, runMonkeyCeremony, releaseMonkey
};
