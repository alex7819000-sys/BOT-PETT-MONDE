// src/index.js — King of the Day Bot v2 👑
// ─────────────────────────────────────────────

require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require("discord.js");
const cron = require("node-cron");
const db   = require("./database");
const { commandDefs, handleInteraction } = require("./commands");
const { runCeremony } = require("./ceremony");
const { pubCommandDef, handlePubInteraction } = require("./pubCommands");
const { startAllSchedulers } = require("./pubScheduler");

// ── Vérification config ───────────────────────────────────────────────────
for (const key of ["DISCORD_TOKEN", "GUILD_ID", "KING_ROLE_ID", "ANNOUNCE_CHANNEL_ID"]) {
  if (!process.env[key]) { console.error(`❌  Manquant dans .env : ${key}`); process.exit(1); }
}

const XP_AMOUNT   = parseInt(process.env.XP_PER_MESSAGE    || "15");
const XP_COOLDOWN = parseInt(process.env.XP_COOLDOWN_SECONDS || "60") * 1000;
const CROWN_HOUR  = parseInt(process.env.CROWN_HOUR        || "20");

// ── Client ────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

const cooldowns = new Map();

// ── Enregistrement des commandes slash ────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("📡 Enregistrement des commandes slash...");
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: [...commandDefs, pubCommandDef] }
    );
    console.log(`✅  ${commandDefs.length} commandes slash enregistrées !`);
  } catch (err) {
    console.error("❌  Commandes :", err.message);
  }
}

// ── Ready ─────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`\n👑  King of the Day Bot v2 — connecté en tant que ${client.user.tag}`);
  console.log(`⏰  Couronnement : vendredi à ${CROWN_HOUR}h00 (Paris)\n`);

  await registerCommands();

  // Couronnement chaque vendredi à l'heure configurée
  cron.schedule(`0 ${CROWN_HOUR} * * 5`, () => {
    console.log("[CRON] 👑 Couronnement !");
    runCeremony(client);
  }, { timezone: "Europe/Paris" });

  // Démarrer les pubs programmées existantes
  startAllSchedulers(client);
});

// ── Gain d'XP ─────────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot)  return;
  if (!message.guild)      return;
  if (message.guild.id !== process.env.GUILD_ID) return;

  const userId = message.author.id;
  const now    = Date.now();
  if ((now - (cooldowns.get(userId) || 0)) < XP_COOLDOWN) return;

  cooldowns.set(userId, now);
  const result = db.addXP(userId, XP_AMOUNT);

  // 🎉 Notification de level-up (ephemeral-style dans le salon)
  if (result.levelUp) {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setDescription(
        `⬆️  <@${userId}> vient de passer **Niveau ${result.newLevel}** ! 🎉`
      );
    message.channel.send({ embeds: [embed] }).catch(() => {});
  }

  // Milestone XP tous les 500
  if (result.newXp % 500 === 0 && result.newXp > 0) {
    message.channel.send(
      `⚡ <@${userId}> atteint **${result.newXp} XP** cette semaine ! 🔥`
    ).catch(() => {});
  }
});

// ── Interactions (commandes slash + boutons) ──────────────────────────────
client.on("interactionCreate", async (interaction) => {
  // Router vers le système pub si c'est une commande /pub ou une interaction pub
  const isPubCommand = interaction.isChatInputCommand() && interaction.commandName === "pub";
  const isPubInteraction =
    (interaction.isChannelSelectMenu() && interaction.customId === "pub_select_channel") ||
    (interaction.isModalSubmit()       && interaction.customId.startsWith("pub_modal_")) ||
    (interaction.isStringSelectMenu()  && interaction.customId === "pub_action_select")  ||
    (interaction.isButton()            && (interaction.customId.startsWith("send_now_") || interaction.customId === "pub_créer_shortcut"));

  if (isPubCommand || isPubInteraction) {
    return handlePubInteraction(interaction, client).catch(console.error);
  }

  // Sinon router vers les commandes King of the Day
  return handleInteraction(interaction);
});

// ── Login ─────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("❌  Login :", err.message);
  process.exit(1);
});
