// src/setupCommands.js — Commandes /setup pour configurer le bot depuis Discord

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder
} = require("discord.js");

// Stockage config en mémoire + fichier
const fs   = require("fs");
const path = require("path");
const CONFIG_FILE = path.join(__dirname, "../data/config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── Définition commande /setup ────────────────────────────────────────────
const setupCommandDef = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("⚙️ [ADMIN] Configurer le bot depuis Discord")
  .setDefaultMemberPermissions(0x8) // Admin uniquement
  .addSubcommand(s => s
    .setName("voir")
    .setDescription("📋 Voir la configuration actuelle"))
  .addSubcommand(s => s
    .setName("xp")
    .setDescription("⚡ Configurer le système XP"))
  .addSubcommand(s => s
    .setName("king")
    .setDescription("👑 Configurer le salon d'annonce du King"))
  .addSubcommand(s => s
    .setName("exclusion")
    .setDescription("🚫 Exclure/inclure un salon du gain d'XP"))
  .addSubcommand(s => s
    .setName("anime")
    .setDescription("🎌 Configurer le Smash or Pass Anime"))
  .addSubcommand(s => s
    .setName("beaute")
    .setDescription("💅 Configurer le Smash or Pass Membres"))
  .addSubcommand(s => s
    .setName("guerre")
    .setDescription("⚔️ Configurer le salon d'annonce de la guerre Chien vs Chat"))
  .toJSON();

// ── Handler /setup ────────────────────────────────────────────────────────
async function handleSetup(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "voir") return showConfig(interaction);
  if (sub === "xp")  return setupXP(interaction);
  if (sub === "king") return setupKing(interaction);
  if (sub === "exclusion") return setupExclusion(interaction);
  if (sub === "anime") return setupAnime(interaction);
  if (sub === "beaute") return setupBeaute(interaction);
  if (sub === "guerre") return setupGuerre(interaction);
}

// ── /setup voir ──────────────────────────────────────────────────────────
async function showConfig(interaction) {
  const cfg = loadConfig();
  const env = process.env;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("⚙️ Configuration du Bot")
    .addFields(
      { name: "👑 Rôle King", value: env.KING_ROLE_ID ? `<@&${env.KING_ROLE_ID}>` : "*Non configuré*", inline: true },
      { name: "📣 Salon annonce", value: env.ANNOUNCE_CHANNEL_ID ? `<#${env.ANNOUNCE_CHANNEL_ID}>` : "*Non configuré*", inline: true },
      { name: "⏰ Heure couronnement", value: `Vendredi à **${env.CROWN_HOUR || 20}h00**`, inline: true },
      { name: "⚡ XP par message", value: `**${env.XP_PER_MESSAGE || 15} XP**`, inline: true },
      { name: "⏱️ Cooldown XP", value: `**${env.XP_COOLDOWN_SECONDS || 60}s**`, inline: true },
      { name: "🚫 Salons exclus", value: cfg.excludedChannels?.length ? cfg.excludedChannels.map(id => `<#${id}>`).join(", ") : "*Aucun*", inline: false },
      { name: "🎌 Salon Anime S/P", value: cfg.animeChannelId ? `<#${cfg.animeChannelId}>` : "*Non configuré*", inline: true },
      { name: "🕐 Intervalle Anime", value: cfg.animeIntervalHours ? `**${cfg.animeIntervalHours}h**` : "*Non configuré*", inline: true },
      { name: "💅 Salon Beauté S/P", value: cfg.beauteChannelId ? `<#${cfg.beauteChannelId}>` : "*Non configuré*", inline: true },
    )
    .setFooter({ text: "Utilise /setup <option> pour modifier la configuration" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /setup xp ─────────────────────────────────────────────────────────────
async function setupXP(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("setup_xp_modal")
    .setTitle("⚡ Configuration XP");

  const xpInput = new TextInputBuilder()
    .setCustomId("xp_amount")
    .setLabel("XP par message (défaut: 15)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("15")
    .setValue(process.env.XP_PER_MESSAGE || "15")
    .setRequired(true);

  const cooldownInput = new TextInputBuilder()
    .setCustomId("xp_cooldown")
    .setLabel("Cooldown en secondes (défaut: 60)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("60")
    .setValue(process.env.XP_COOLDOWN_SECONDS || "60")
    .setRequired(true);

  const crownInput = new TextInputBuilder()
    .setCustomId("crown_hour")
    .setLabel("Heure couronnement vendredi (0-23)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("20")
    .setValue(process.env.CROWN_HOUR || "20")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(xpInput),
    new ActionRowBuilder().addComponents(cooldownInput),
    new ActionRowBuilder().addComponents(crownInput),
  );

  await interaction.showModal(modal);
}

// ── /setup king ───────────────────────────────────────────────────────────
async function setupKing(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle("👑 Configuration King of the Day")
    .setDescription("Choisis le salon d'annonce du couronnement :");

  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_king_channel")
      .setPlaceholder("Choisir le salon d'annonce")
      .addChannelTypes(ChannelType.GuildText)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ── /setup exclusion ──────────────────────────────────────────────────────
async function setupExclusion(interaction) {
  const cfg = loadConfig();
  const excluded = cfg.excludedChannels || [];

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle("🚫 Salons exclus du gain d'XP")
    .setDescription(
      excluded.length
        ? `Salons actuellement exclus :\n${excluded.map(id => `<#${id}>`).join(", ")}`
        : "*Aucun salon exclu — tous les salons donnent de l'XP*"
    );

  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_exclusion_channel")
      .setPlaceholder("Choisir un salon à exclure/inclure")
      .addChannelTypes(ChannelType.GuildText)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ── /setup anime ──────────────────────────────────────────────────────────
async function setupAnime(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("setup_anime_modal")
    .setTitle("🎌 Configuration Smash or Pass Anime");

  const channelInput = new TextInputBuilder()
    .setCustomId("anime_channel_id")
    .setLabel("ID du salon pour le Smash or Pass Anime")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Clic droit sur le salon → Copier l'ID")
    .setRequired(true);

  const intervalInput = new TextInputBuilder()
    .setCustomId("anime_interval")
    .setLabel("Intervalle en heures (ex: 6 = toutes les 6h)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("6")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(channelInput),
    new ActionRowBuilder().addComponents(intervalInput),
  );

  await interaction.showModal(modal);
}

// ── /setup beaute ─────────────────────────────────────────────────────────
async function setupBeaute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("setup_beaute_modal")
    .setTitle("💅 Configuration Smash or Pass Membres");

  const channelInput = new TextInputBuilder()
    .setCustomId("beaute_channel_id")
    .setLabel("ID du salon pour le Smash or Pass Membres")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Clic droit sur le salon → Copier l'ID")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(channelInput),
  );

  await interaction.showModal(modal);
}

// ── Gestion des modals et menus setup ────────────────────────────────────
async function handleSetupInteraction(interaction) {
  // Modal XP
  if (interaction.isModalSubmit() && interaction.customId === "setup_xp_modal") {
    const xp       = interaction.fields.getTextInputValue("xp_amount");
    const cooldown = interaction.fields.getTextInputValue("xp_cooldown");
    const crown    = interaction.fields.getTextInputValue("crown_hour");

    const cfg = loadConfig();
    cfg.xpPerMessage     = parseInt(xp) || 15;
    cfg.xpCooldown       = parseInt(cooldown) || 60;
    cfg.crownHour        = parseInt(crown) || 20;
    saveConfig(cfg);

    // Mettre à jour process.env pour la session courante
    process.env.XP_PER_MESSAGE     = String(cfg.xpPerMessage);
    process.env.XP_COOLDOWN_SECONDS = String(cfg.xpCooldown);
    process.env.CROWN_HOUR         = String(cfg.crownHour);

    const embed = new EmbedBuilder()
      .setColor(0x00FF88)
      .setTitle("✅ Configuration XP sauvegardée !")
      .addFields(
        { name: "⚡ XP par message", value: `**${cfg.xpPerMessage} XP**`, inline: true },
        { name: "⏱️ Cooldown", value: `**${cfg.xpCooldown}s**`, inline: true },
        { name: "⏰ Couronnement", value: `Vendredi à **${cfg.crownHour}h00**`, inline: true },
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Menu salon King
  if (interaction.isChannelSelectMenu() && interaction.customId === "setup_king_channel") {
    const channel = interaction.values[0];
    const cfg = loadConfig();
    cfg.announceChannelId = channel;
    saveConfig(cfg);
    process.env.ANNOUNCE_CHANNEL_ID = channel;

    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x00FF88).setDescription(`✅ Salon d'annonce configuré : <#${channel}>`)],
      components: []
    });
  }

  // Menu exclusion salon
  if (interaction.isChannelSelectMenu() && interaction.customId === "setup_exclusion_channel") {
    const channel = interaction.values[0];
    const cfg = loadConfig();
    cfg.excludedChannels = cfg.excludedChannels || [];

    if (cfg.excludedChannels.includes(channel)) {
      cfg.excludedChannels = cfg.excludedChannels.filter(id => id !== channel);
      saveConfig(cfg);
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x00FF88).setDescription(`✅ <#${channel}> **retiré** des exclusions — ce salon donne de l'XP à nouveau !`)],
        components: []
      });
    } else {
      cfg.excludedChannels.push(channel);
      saveConfig(cfg);
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xFF4444).setDescription(`🚫 <#${channel}> **exclu** — plus d'XP dans ce salon !`)],
        components: []
      });
    }
  }

  // Modal Anime
  if (interaction.isModalSubmit() && interaction.customId === "setup_anime_modal") {
    const channelId = interaction.fields.getTextInputValue("anime_channel_id");
    const interval  = interaction.fields.getTextInputValue("anime_interval");

    const cfg = loadConfig();
    cfg.animeChannelId      = channelId;
    cfg.animeIntervalHours  = parseInt(interval) || 6;
    saveConfig(cfg);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle("✅ Smash or Pass Anime configuré !")
        .setDescription(`📺 Salon : <#${channelId}>\n⏰ Un personnage toutes les **${cfg.animeIntervalHours}h**\n\nLe premier personnage va apparaître dans quelques secondes !`)
      ],
      ephemeral: true
    });
  }

  // Menu salon Guerre
  if (interaction.isChannelSelectMenu() && interaction.customId === "setup_guerre_channel") {
    const channel = interaction.values[0];
    const cfg = loadConfig();
    cfg.warChannelId = channel;
    saveConfig(cfg);

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setDescription(`✅ Salon de la guerre configuré : <#${channel}>\n\nLes résultats **🐶 Chien vs 🐱 Chat** seront annoncés ici chaque vendredi en même temps que le King of the Day !`)
      ],
      components: []
    });
  }

  // Modal Beauté
  if (interaction.isModalSubmit() && interaction.customId === "setup_beaute_modal") {
    const channelId = interaction.fields.getTextInputValue("beaute_channel_id");

    const cfg = loadConfig();
    cfg.beauteChannelId = channelId;
    saveConfig(cfg);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle("✅ Smash or Pass Membres configuré !")
        .setDescription(`💅 Salon : <#${channelId}>\n\nLes membres peuvent maintenant envoyer **/beaute soumettre** pour participer !`)
      ],
      ephemeral: true
    });
  }
}

function isSetupInteraction(interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === "setup") return true;
  if (interaction.isModalSubmit() && interaction.customId.startsWith("setup_")) return true;
  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("setup_")) return true;
  return false;
}

// ── /setup guerre ─────────────────────────────────────────────────────────
async function setupGuerre(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle("⚔️ Configuration Guerre Chien vs Chat")
    .setDescription("Choisis le salon où les résultats de la guerre seront annoncés chaque vendredi :");

  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_guerre_channel")
      .setPlaceholder("Choisir le salon d'annonce de la guerre")
      .addChannelTypes(ChannelType.GuildText)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

module.exports = { setupCommandDef, handleSetup, handleSetupInteraction, isSetupInteraction, loadConfig, saveConfig };
