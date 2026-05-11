// src/monkey.js — Singe du Serveur 🐒

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const MONKEY_FILE = path.join(__dirname, "../data/monkey.json");

function loadMonkeyDB() {
  if (!fs.existsSync(MONKEY_FILE)) return { nominations: {}, currentMonkey: null, phase: "nominations", votes: {}, finalists: [], faults: {} };
  const db = JSON.parse(fs.readFileSync(MONKEY_FILE, "utf-8"));
  if (!db.faults) db.faults = {};
  return db;
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
    .setDescription("🐒 Voir qui est le singe actuel et ses fautes"))
  .toJSON();

async function handleMonkeyCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "nominer") return handleNominate(interaction);
  if (sub === "stats")   return handleStats(interaction);
  if (sub === "actuel")  return handleCurrent(interaction);
}

// ── Nominer ───────────────────────────────────────────────────────────────
async function handleNominate(interaction) {
  const db     = loadMonkeyDB();
  const userId = interaction.user.id;
  const target = interaction.options.getUser("membre");

  if (db.phase !== "nominations") {
    return interaction.reply({ content: "❌ Les nominations sont fermées ! Le vote final est en cours.", ephemeral: true });
  }
  if (target.id === userId) return interaction.reply({ content: "😂 Tu ne peux pas te nominer toi-même !", ephemeral: true });
  if (target.bot) return interaction.reply({ content: "❌ Tu ne peux pas nominer un bot !", ephemeral: true });
  if (db.nominations[userId]?.voted) {
    return interaction.reply({ content: `❌ Tu as déjà nominé <@${db.nominations[userId].nominated}> cette semaine !`, ephemeral: true });
  }

  db.nominations[userId] = { nominated: target.id, voted: true };
  saveMonkeyDB(db);

  const votes = Object.values(db.nominations).filter(n => n.nominated === target.id).length;

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle("🐒 Nomination enregistrée !")
      .setDescription(`Tu as nominé <@${target.id}> !\n\n**${target.username}** a **${votes}** nomination(s) 🎯`)
      .setFooter({ text: "Vote final jeudi soir !" })
    ],
    ephemeral: true
  });

  await interaction.channel.send(`🎯 Une nouvelle nomination pour le 🐒 **Singe de la semaine** vient de tomber...`).catch(() => {});
}

// ── Stats ─────────────────────────────────────────────────────────────────
async function handleStats(interaction) {
  const db = loadMonkeyDB();
  const counts = {};
  Object.values(db.nominations).forEach(n => {
    counts[n.nominated] = (counts[n.nominated] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!sorted.length) return interaction.reply({ content: "Aucune nomination encore !", ephemeral: true });

  const lines = sorted.map(([id, count], i) =>
    `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`#${i+1}\``} <@${id}> — **${count}** nomination(s)`
  );

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle("🐒 Nominations Singe de la Semaine")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Les 3 plus nominés passeront au vote final jeudi soir !" })
    ]
  });
}

// ── Singe actuel ──────────────────────────────────────────────────────────
async function handleCurrent(interaction) {
  const db = loadMonkeyDB();
  if (!db.currentMonkey) {
    return interaction.reply({ content: "Pas de singe actuellement 🐒", ephemeral: true });
  }

  const fautes = db.faults[db.currentMonkey.userId] || 0;
  const nextPunishment = fautes < 3 ? `Prochain palier : **3 fautes** → ping public spécial` :
                         fautes < 5 ? `Prochain palier : **5 fautes** → -100 XP` :
                         fautes < 10 ? `Prochain palier : **10 fautes** → timeout 1h` : "⚠️ Danger zone !";

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle("🐒 Singe Actuel du Serveur")
      .setDescription(
        `<@${db.currentMonkey.userId}> est le singe cette semaine !\n\n` +
        `❌ **Fautes :** ${fautes}/10\n` +
        `📅 Libéré : <t:${Math.floor(db.currentMonkey.until / 1000)}:R>\n\n` +
        `*${nextPunishment}*\n\n` +
        `*Il doit dire **"singe"** dans chaque message !*`
      )
    ]
  });
}

// ── Vote final (jeudi soir) ───────────────────────────────────────────────
async function launchMonkeyVote(client, cfg) {
  const db = loadMonkeyDB();
  const counts = {};
  Object.values(db.nominations).forEach(n => {
    counts[n.nominated] = (counts[n.nominated] || 0) + 1;
  });

  const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top3.length) return;

  db.phase     = "vote";
  db.finalists = top3.map(([id, count]) => ({ id, count }));
  db.votes     = {};
  saveMonkeyDB(db);

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const buttons = top3.map(([id, count]) =>
    new ButtonBuilder()
      .setCustomId(`monkey_vote_${id}`)
      .setLabel(`🎯 ${count} noms`)
      .setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle("🐒 VOTE FINAL — Singe de la Semaine !")
    .setDescription(
      `Les **3 plus nominés** :\n\n` +
      top3.map(([id, count], i) => `${i+1}. <@${id}> — ${count} nominations`).join("\n") +
      `\n\n**1 seul singe sera élu !**\n🗳️ Vote maintenant ! Résultat vendredi soir 👇\n\n` +
      `⚠️ *Le singe devra dire "singe" dans chaque message pendant 7 jours !*`
    )
    .setFooter({ text: "1 vote par personne • Résultat vendredi soir" });

  const row = new ActionRowBuilder().addComponents(buttons);
  await channel.send({ embeds: [embed], components: [row] });
}

// ── Gérer les votes ───────────────────────────────────────────────────────
async function handleMonkeyVote(interaction) {
  const db     = loadMonkeyDB();
  const userId = interaction.user.id;
  const target = interaction.customId.replace("monkey_vote_", "");

  if (db.votes[userId]) return interaction.reply({ content: "❌ Tu as déjà voté !", ephemeral: true });

  db.votes[userId] = target;
  saveMonkeyDB(db);

  const count = Object.values(db.votes).filter(v => v === target).length;
  await interaction.reply({ content: `✅ Vote pour <@${target}> ! (${count} votes)`, ephemeral: true });
}

// ── Cérémonie vendredi ────────────────────────────────────────────────────
async function runMonkeyCeremony(client, cfg) {
  const db = loadMonkeyDB();

  const voteCounts = {};
  Object.values(db.votes || {}).forEach(v => {
    voteCounts[v] = (voteCounts[v] || 0) + 1;
  });

  const nominations = {};
  Object.values(db.nominations).forEach(n => {
    nominations[n.nominated] = (nominations[n.nominated] || 0) + 1;
  });

  const source = Object.keys(voteCounts).length ? voteCounts : nominations;
  const sorted = Object.entries(source).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return;

  const [monkeyId, monkeyVotes] = sorted[0];

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  // Retirer rôle à l'ancien singe
  if (db.currentMonkey && cfg.monkeyRoleId) {
    const old = await guild.members.fetch(db.currentMonkey.userId).catch(() => null);
    if (old) await old.roles.remove(cfg.monkeyRoleId).catch(() => {});
  }

  // Donner rôle au nouveau singe
  const monkeyMember = await guild.members.fetch(monkeyId).catch(() => null);
  if (monkeyMember && cfg.monkeyRoleId) {
    await monkeyMember.roles.add(cfg.monkeyRoleId).catch(() => {});
  }

  const nextFriday = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.currentMonkey = { userId: monkeyId, until: nextFriday, votes: monkeyVotes };
  db.faults        = {};
  db.nominations   = {};
  db.votes         = {};
  db.phase         = "nominations";
  saveMonkeyDB(db);

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x8B4513)
    .setTitle("🐒 LE SINGE DE LA SEMAINE EST ÉLU !")
    .setDescription(
      `Avec **${monkeyVotes}** vote(s)...\n\n` +
      `# 🐒 <@${monkeyId}>\n\n` +
      `⚠️ **Règle :** Il/Elle doit dire **"singe"** dans chaque message pendant 7 jours !\n\n` +
      `**Système de fautes :**\n` +
      `❌ 1-2 fautes → Message honteux public\n` +
      `📢 3 fautes → Ping spécial dans le salon\n` +
      `💸 5 fautes → -100 XP\n` +
      `⏰ 10 fautes → Timeout 1 heure\n\n` +
      `*Surveillez-le bien... 👀*`
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  // DM au singe
  if (monkeyMember) {
    await monkeyMember.send(
      `🐒 Tu as été élu **Singe du Serveur** cette semaine !\n\n` +
      `**Règle :** Tu dois dire le mot **"singe"** dans CHAQUE message sur le serveur pendant 7 jours.\n\n` +
      `**Si tu oublies :**\n` +
      `❌ 1-2 fautes → Message honteux public\n` +
      `📢 3 fautes → Ping spécial\n` +
      `💸 5 fautes → -100 XP\n` +
      `⏰ 10 fautes → Timeout 1h\n\n` +
      `Bonne chance 😈`
    ).catch(() => {});
  }
}

// ── Libérer le singe ──────────────────────────────────────────────────────
async function releaseMonkey(client, cfg) {
  const db = loadMonkeyDB();
  if (!db.currentMonkey) return;

  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(db.currentMonkey.userId).catch(() => null);
  if (member && cfg.monkeyRoleId) await member.roles.remove(cfg.monkeyRoleId).catch(() => {});

  const fautes = db.faults[db.currentMonkey.userId] || 0;
  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setDescription(
          `🎉 <@${db.currentMonkey.userId}> est **libéré(e)** de sa peine de singe !\n\n` +
          `📊 Bilan : **${fautes}** faute(s) cette semaine\n` +
          `${fautes === 0 ? "✅ Parfait ! Aucune faute !" : fautes < 5 ? "😅 Pas mal..." : "💀 Un vrai désastre 😂"}\n\n` +
          `*Les nominations pour le prochain singe sont ouvertes !*`
        )
      ]
    });
  }
}

// ── Vérifier que le singe dit "singe" ────────────────────────────────────
async function checkMonkeyMessage(message, addXPCallback) {
  if (message.author.bot) return false;
  const db = loadMonkeyDB();
  if (!db.currentMonkey) return false;
  if (db.currentMonkey.userId !== message.author.id) return false;

  // Le message contient "singe" → OK
  if (message.content.toLowerCase().includes("singe")) return false;

  // Faute !
  db.faults[message.author.id] = (db.faults[message.author.id] || 0) + 1;
  const fautes = db.faults[message.author.id];
  saveMonkeyDB(db);

  // Messages honteux variés
  const shameMessages = [
    `🐒 <@${message.author.id}> a oublié de dire **"singe"** ! Faute n°${fautes} ! 😂`,
    `❌ <@${message.author.id}> ! Pas de "singe" dans ton message ! Honte à toi 🐒 (Faute ${fautes})`,
    `🙈 <@${message.author.id}> croit qu'il/elle peut écrire sans dire **singe**... RATÉ ! (${fautes} faute(s))`,
    `🐒 Rappel pour <@${message.author.id}> : chaque message doit contenir **"singe"** ! Faute ${fautes} !`,
    `👀 <@${message.author.id}> s'est fait attraper ! Faute n°${fautes} — dis **"singe"** !`,
  ];

  await message.reply(shameMessages[Math.floor(Math.random() * shameMessages.length)]);

  // Paliers de punition
  if (fautes === 3) {
    await message.channel.send(
      `📢 @here <@${message.author.id}> a déjà **3 fautes** ! Le singe est incontrôlable ! 🐒😂`
    ).catch(() => {});
  }

  if (fautes === 5) {
    if (addXPCallback) addXPCallback(message.author.id, -100);
    await message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0xFF4444)
        .setDescription(`💸 <@${message.author.id}> a **5 fautes** ! **-100 XP** en punition ! 🐒`)
      ]
    }).catch(() => {});
  }

  if (fautes === 10) {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member) {
      await member.timeout(60 * 60 * 1000, "🐒 10 fautes de singe !").catch(() => {});
      await message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setDescription(`⏰ <@${message.author.id}> a atteint **10 fautes** ! Timeout d'1 heure ! 🐒💀`)
        ]
      }).catch(() => {});
    }
  }

  return true;
}

module.exports = {
  monkeyCommandDef, handleMonkeyCommand, handleMonkeyVote,
  launchMonkeyVote, runMonkeyCeremony, releaseMonkey, checkMonkeyMessage
};
