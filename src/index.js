// src/index.js — King of the Day Bot v3 👑 FINAL

require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require("discord.js");
const cron = require("node-cron");
const http = require("http"); // Pour satisfaire Render
const db   = require("./database");

const { commandDefs, handleInteraction }                                    = require("./commands");
const { runCeremony }                                                        = require("./ceremony");
const { pubCommandDef, handlePubInteraction }                               = require("./pubCommands");
const { startAllSchedulers }                                                 = require("./pubScheduler");
const { setupCommandDef, handleSetup, handleSetupInteraction, isSetupInteraction, loadConfig } = require("./setupCommands");
const { animeCommandDef, handleAnimeCommand, handleAnimeVote, startAnimeScheduler } = require("./animeSmash");
const { beauteCommandDef, handleBeauteCommand, handleBeauteVote, handleBeauteModal } = require("./beauteSmash");
const { handleAnimalDetection, catCommandDef, dogCommandDef, handleCatCommand, handleDogCommand } = require("./animalDetector");
const { warCommandDef, handleWarCommand, handleWarMessage, handleWarButton, runWarCeremony } = require("./animalWar");
const { guildCommandDef, handleGuildCommand, handleCreateModal, handleJoinButton, addGuildXP, runGuildCeremony } = require("./guilds");
const { monkeyCommandDef, handleMonkeyCommand, handleMonkeyVote, launchMonkeyVote, runMonkeyCeremony, releaseMonkey, checkMonkeyMessage } = require("./monkey");
const { coupleCommandDef, handleCoupleCommand, handleCoupleVote, launchCoupleVote, runCoupleCeremony } = require("./couple");
const { quizCommandDef, handleQuizCommand, postDailyQuiz, checkQuizAnswer } = require("./animeQuiz");
const { connectMongo }                                                       = require("./mongodb");
const { bumpCommandDef, handleBumpCommand, handleBumpDetection, startBumpScheduler } = require("./bump");

for (const key of ["DISCORD_TOKEN", "GUILD_ID", "KING_ROLE_ID", "ANNOUNCE_CHANNEL_ID"]) {
  if (!process.env[key]) { console.error(`❌  Manquant dans .env : ${key}`); process.exit(1); }
}

const XP_AMOUNT   = () => parseInt(process.env.XP_PER_MESSAGE    || "15");
const XP_COOLDOWN = () => parseInt(process.env.XP_COOLDOWN_SECONDS || "60") * 1000;
const CROWN_HOUR  = parseInt(process.env.CROWN_HOUR || "20");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

const cooldowns = new Map();

// ── Serveur HTTP pour Render (évite "No open ports") ─────────────────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end("BOT PETIT MONDE — Online ✅")).listen(PORT, () => {
  console.log(`🌐 Serveur HTTP démarré sur port ${PORT}`);
});

// ── Nettoyer les options vides dans les commandes ─────────────────────────
function cleanCommand(cmd) {
  const obj = JSON.parse(JSON.stringify(cmd));
  function clean(o) {
    if (o.options && o.options.length === 0) delete o.options;
    if (o.options) o.options.forEach(clean);
  }
  clean(obj);
  return obj;
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("📡 Enregistrement des commandes slash...");
    const allCommands = [
      ...commandDefs, pubCommandDef, setupCommandDef,
      animeCommandDef, beauteCommandDef,
      warCommandDef, guildCommandDef,
      monkeyCommandDef, coupleCommandDef,
      quizCommandDef, bumpCommandDef,
      catCommandDef, dogCommandDef,
    ].map(cleanCommand);
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: allCommands });
    console.log(`✅  ${allCommands.length} commandes slash enregistrées !`);
  } catch (err) {
    console.error("❌  Commandes :", err.message);
  }
}

client.once("clientReady", async () => {
  console.log(`\n👑  King of the Day Bot v3 FINAL — ${client.user.tag}`);
  console.log(`⏰  Couronnement : vendredi à ${CROWN_HOUR}h00 (Paris)\n`);

  // Connexion MongoDB
  await connectMongo();

  await registerCommands();

  // ── CRONS ──────────────────────────────────────────────────────────────

  // Vendredi soir — Grand Event
  cron.schedule(`0 ${CROWN_HOUR} * * 5`, async () => {
    const cfg = loadConfig();
    console.log("[CRON] 👑 Grand Event du Vendredi !");
    await runCeremony(client);
    await runWarCeremony(client, cfg);
    await runGuildCeremony(client, cfg);
    await releaseMonkey(client, cfg); // Libérer l'ancien singe
    await runMonkeyCeremony(client, cfg); // Élire le nouveau
    await runCoupleCeremony(client, cfg);
  }, { timezone: "Europe/Paris" });

  // Jeudi soir 20h — Vote final singe + couple
  cron.schedule("0 20 * * 4", async () => {
    const cfg = loadConfig();
    console.log("[CRON] 🗳️ Lancement votes finaux !");
    await launchMonkeyVote(client, cfg);
    await launchCoupleVote(client, cfg);
  }, { timezone: "Europe/Paris" });

  // Chaque jour 10h — Quiz anime
  cron.schedule("0 10 * * *", async () => {
    const cfg = loadConfig();
    await postDailyQuiz(client, cfg);
  }, { timezone: "Europe/Paris" });

  // Démarrer les pubs
  startAllSchedulers(client);

  // Démarrer anime smash or pass
  const cfg = loadConfig();
  // Démarrer anime smash or pass — lire depuis env si config vide
  const animeChannelId    = cfg.animeChannelId    || process.env.ANIME_CHANNEL_ID;
  const animeIntervalHours = cfg.animeIntervalHours || parseInt(process.env.ANIME_INTERVAL_HOURS || "6");
  if (animeChannelId) {
    startAnimeScheduler(client, { animeChannelId, animeIntervalHours });
    console.log(`[ANIME] ✅ Scheduler démarré — salon ${animeChannelId} toutes les ${animeIntervalHours}h`);
  }
  startBumpScheduler(client, cfg);

  console.log("✅ Bot v3 FINAL prêt — toutes les fonctionnalités actives !");
});

// ── MESSAGES ───────────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.guild.id !== process.env.GUILD_ID) return;

  const cfg     = loadConfig();
  const excluded = cfg.excludedChannels || [];
  const userId  = message.author.id;
  const now     = Date.now();

  if (!excluded.includes(message.channelId)) {
    if ((now - (cooldowns.get(userId) || 0)) >= XP_COOLDOWN()) {
      cooldowns.set(userId, now);
      const result = db.addXP(userId, XP_AMOUNT());
      addGuildXP(userId, XP_AMOUNT()); // XP pour la guilde aussi

      if (result.levelUp) {
        message.channel.send({ embeds: [new EmbedBuilder().setColor(0xFFD700).setDescription(`⬆️ <@${userId}> vient de passer **Niveau ${result.newLevel}** ! 🎉`)] }).catch(() => {});
      }
      if (result.newXp % 500 === 0 && result.newXp > 0) {
        message.channel.send(`⚡ <@${userId}> atteint **${result.newXp} XP** cette semaine ! 🔥`).catch(() => {});
      }
    }
  }

  // 🐾 Animaux
  // 🐒 Vérifier que le singe dit "singe"
  await checkMonkeyMessage(message, (uid, xp) => db.addXP(uid, xp));

  await handleAnimalDetection(message);

  // ⚔️ Guerre chien vs chat
  await handleWarMessage(message);

  // 🚀 Détection bump Disboard
  await handleBumpDetection(message, (uid, xp) => db.addXP(uid, xp));

  // 🎌 Quiz anime
  if (cfg.animeChannelId && message.channelId === cfg.animeChannelId) {
    await checkQuizAnswer(message, (uid, xp) => db.addXP(uid, xp));
  }
});

// ── INTERACTIONS ───────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  try {
    const cfg = loadConfig();

    // Setup
    if (isSetupInteraction(interaction)) {
      return interaction.isChatInputCommand() ? handleSetup(interaction) : handleSetupInteraction(interaction);
    }

    // Pub
    const isPubCmd = interaction.isChatInputCommand() && interaction.commandName === "pub";
    const isPubInt = (interaction.isChannelSelectMenu() && interaction.customId === "pub_select_channel") ||
      (interaction.isModalSubmit() && interaction.customId.startsWith("pub_modal_")) ||
      (interaction.isStringSelectMenu() && interaction.customId === "pub_action_select") ||
      (interaction.isButton() && (
        interaction.customId.startsWith("send_now_") ||
        interaction.customId === "pub_créer_shortcut" ||
        interaction.customId === "pub_select_all_channels" ||
        interaction.customId === "pub_toggle_all"
      ));
    if (isPubCmd || isPubInt) return handlePubInteraction(interaction, client);

    // Anime Smash or Pass
    if (interaction.isChatInputCommand() && interaction.commandName === "anime") return handleAnimeCommand(interaction, cfg);
    if (interaction.isButton() && interaction.customId.startsWith("anime_")) return handleAnimeVote(interaction);

    // Beauté Smash or Pass
    if (interaction.isChatInputCommand() && interaction.commandName === "beaute") return handleBeauteCommand(interaction, cfg);
    if (interaction.isButton() && interaction.customId.startsWith("beaute_")) return handleBeauteVote(interaction);
    if (interaction.isModalSubmit() && interaction.customId === "beaute_submit_modal") return handleBeauteModal(interaction, cfg);

    // Guerre chien vs chat
    if (interaction.isChatInputCommand() && interaction.commandName === "guerre") return handleWarCommand(interaction);
    if (interaction.isButton() && interaction.customId.startsWith("war_join_")) return handleWarButton(interaction);

    // Guildes
    if (interaction.isChatInputCommand() && interaction.commandName === "guilde") {
      const userXP = db.getUser(interaction.user.id);
      const level  = userXP ? db.getLevelFromXP(userXP.totalXp || 0) : 0;
      return handleGuildCommand(interaction, level);
    }
    if (interaction.isModalSubmit() && interaction.customId === "guild_create_modal") return handleCreateModal(interaction);
    if (interaction.isButton() && interaction.customId.startsWith("guild_join_")) return handleJoinButton(interaction);

    // Singe
    if (interaction.isChatInputCommand() && interaction.commandName === "singe") return handleMonkeyCommand(interaction);
    if (interaction.isButton() && interaction.customId.startsWith("monkey_vote_")) return handleMonkeyVote(interaction);

    // Couple
    if (interaction.isChatInputCommand() && interaction.commandName === "couple") return handleCoupleCommand(interaction);
    if (interaction.isButton() && interaction.customId.startsWith("couple_vote_")) return handleCoupleVote(interaction);

    // Quiz
    if (interaction.isChatInputCommand() && interaction.commandName === "quiz") return handleQuizCommand(interaction, cfg);

    // Cat & Dog
    if (interaction.isChatInputCommand() && interaction.commandName === "cat") return handleCatCommand(interaction);
    if (interaction.isChatInputCommand() && interaction.commandName === "dog") return handleDogCommand(interaction);

    // Bump stats
    if (interaction.isChatInputCommand() && interaction.commandName === "bumpstats") return handleBumpCommand(interaction);

    // King of the Day (base)
    return handleInteraction(interaction);

  } catch (err) {
    console.error("[INTERACTION ERROR]", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Une erreur s'est produite !", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN).catch(err => { console.error("❌  Login :", err.message); process.exit(1); });
