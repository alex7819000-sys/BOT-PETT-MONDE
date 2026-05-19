// src/pubCommands.js — Commandes /pub avec formulaires modaux

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ChannelType,
} = require("discord.js");

const pubDb        = require("./pubDatabase");
const { schedulePub, stopPub, sendPub, buildPubEmbed, buildPubRow } = require("./pubScheduler");

// ── Définition de la commande ─────────────────────────────────────────────
const pubCommandDef = new SlashCommandBuilder()
  .setName("pub")
  .setDescription("📢 [ADMIN] Gérer les publicités CVForge")
  .setDefaultMemberPermissions(0x8) // ADMINISTRATOR uniquement
  .addSubcommand(s => s.setName("créer").setDescription("➕ Créer une nouvelle pub automatique"))
  .addSubcommand(s => s.setName("liste").setDescription("📋 Voir toutes les pubs configurées"))
  .addSubcommand(s => s.setName("supprimer").setDescription("🗑️ Supprimer une pub"))
  .addSubcommand(s => s.setName("pause").setDescription("⏸️ Mettre une pub en pause"))
  .addSubcommand(s => s.setName("relancer").setDescription("▶️ Relancer une pub en pause"))
  .addSubcommand(s => s.setName("envoyer").setDescription("📤 Envoyer une pub maintenant (test)"))
  .toJSON();

// ── /pub créer ─────────────────────────────────────────────────────────────
// Étape 1 : sélecteur de salon
async function handlePubCreer(interaction) {
  const rowChannel = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("pub_select_channel")
      .setPlaceholder("Choisir le salon où poster la pub")
      .addChannelTypes(ChannelType.GuildText)
  );

  const rowAll = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pub_select_all_channels")
      .setLabel("📢 Tous les salons")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: "**Étape 1/2** — Dans quel salon veux-tu poster cette pub ?\n\n💡 Clique **Tous les salons** pour poster dans tous les salons textuels, ou choisis un salon spécifique.",
    components: [rowChannel, rowAll],
    ephemeral: true,
  });
}

// ── /pub liste ─────────────────────────────────────────────────────────────
async function handlePubListe(interaction) {
  const pubs = pubDb.getAllPubs();

  if (!pubs.length) {
    return interaction.reply({ content: "Aucune pub configurée. Utilise `/pub créer` pour en ajouter une !", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("📢 Pubs CVForge configurées")
    .setDescription(`**${pubs.length} pub(s)** au total`)
    .setTimestamp();

  for (const pub of pubs.slice(0, 10)) {
    const schedule = pub.scheduledTime
      ? `🕐 Tous les jours à **${pub.scheduledTime}**`
      : pub.intervalMinutes
      ? `⏱️ Toutes les **${pub.intervalMinutes} min**`
      : "⚠️ Pas de schedule";

    embed.addFields({
      name: `${pub.active ? "🟢" : "🔴"} Pub #${pub.id.slice(-5)} — ${pub.channelId === "ALL" ? "📢 Tous les salons" : `<#${pub.channelId}>`}`,
      value:
        `📝 ${pub.description.slice(0, 80)}${pub.description.length > 80 ? "…" : ""}\n` +
        `🔗 ${pub.lien}\n` +
        `${schedule}\n` +
        `📤 Envoyée **${pub.sentCount || 0}** fois${pub.lastSent ? ` · Dernière : <t:${Math.floor(new Date(pub.lastSent).getTime() / 1000)}:R>` : ""}`,
    });
  }

  // Boutons de gestion
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pub_manage_menu")
        .setLabel("⚙️ Gérer une pub")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("pub_créer_shortcut")
        .setLabel("➕ Nouvelle pub")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("pub_toggle_all")
        .setLabel(pubs.some(p => p.active) ? "⏸️ Tout désactiver" : "▶️ Tout activer")
        .setStyle(pubs.some(p => p.active) ? ButtonStyle.Danger : ButtonStyle.Success),
    )
  ];

  await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}

// ── /pub supprimer / pause / relancer ─────────────────────────────────────
async function handlePubAction(interaction, action) {
  const pubs = pubDb.getAllPubs();
  if (!pubs.length) {
    return interaction.reply({ content: "Aucune pub à gérer.", ephemeral: true });
  }

  const options = pubs.slice(0, 25).map(pub => ({
    label: `Pub #${pub.id.slice(-5)} — ${pub.description.slice(0, 40)}`,
    description: `Salon: <#${pub.channelId}> · ${pub.active ? "Active" : "En pause"} · ${pub.sentCount || 0}x envoyée`,
    value: `${action}_${pub.id}`,
    emoji: pub.active ? "🟢" : "🔴",
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("pub_action_select")
      .setPlaceholder("Choisir une pub...")
      .addOptions(options)
  );

  const labels = { supprimer: "supprimer", pause: "mettre en pause", relancer: "relancer" };
  await interaction.reply({
    content: `Quelle pub veux-tu **${labels[action]}** ?`,
    components: [row],
    ephemeral: true,
  });
}

// ── /pub envoyer (test) ───────────────────────────────────────────────────
async function handlePubEnvoyer(interaction) {
  const pubs = pubDb.getActivePubs();
  if (!pubs.length) {
    return interaction.reply({ content: "Aucune pub active.", ephemeral: true });
  }

  const options = pubs.slice(0, 25).map(pub => ({
    label: `Pub #${pub.id.slice(-5)} — ${pub.description.slice(0, 50)}`,
    value: `send_${pub.id}`,
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("pub_action_select")
      .setPlaceholder("Quelle pub envoyer maintenant ?")
      .addOptions(options)
  );

  await interaction.reply({ content: "📤 Quelle pub veux-tu envoyer maintenant ?", components: [row], ephemeral: true });
}

// ── Modal de création (étape 2) ───────────────────────────────────────────
function buildPubModal(channelId) {
  return new ModalBuilder()
    .setCustomId(`pub_modal_${channelId}`)
    .setTitle("📢 Créer une pub CVForge")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pub_lien")
          .setLabel("🔗 Lien de la pub (ex: cvforge.uk/promo)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("cvforge.uk")
          .setValue("cvforge.uk")
          .setRequired(true)
          .setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pub_description")
          .setLabel("📝 Message de la pub")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Ex: Besoin d'un CV professionnel ? CVForge te permet de créer un CV en 5 minutes ! 🚀")
          .setRequired(true)
          .setMaxLength(500)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pub_image")
          .setLabel("🖼️ Lien image/bannière (optionnel)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("https://i.imgur.com/ta-banniere.png")
          .setRequired(false)
          .setMaxLength(300)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pub_schedule")
          .setLabel("⏰ Heure précise OU intervalle en minutes")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex: 20:30  OU  60 (= toutes les 60 min)")
          .setRequired(false)
          .setMaxLength(10)
      ),
    );
}

// ── Handler global des interactions pub ───────────────────────────────────
async function handlePubInteraction(interaction, client) {

  // ── Commande slash /pub ───────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "pub") {
    const sub = interaction.options.getSubcommand();
    if (sub === "créer")     return handlePubCreer(interaction);
    if (sub === "liste")     return handlePubListe(interaction);
    if (sub === "supprimer") return handlePubAction(interaction, "supprimer");
    if (sub === "pause")     return handlePubAction(interaction, "pause");
    if (sub === "relancer")  return handlePubAction(interaction, "relancer");
    if (sub === "envoyer")   return handlePubEnvoyer(interaction);
  }

  // ── Bouton toggle all pubs ────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "pub_toggle_all") {
    const pubs   = pubDb.getAllPubs();
    const anyActive = pubs.some(p => p.active);

    for (const pub of pubs) {
      if (anyActive) {
        pubDb.pausePub(pub.id);
        stopPub(pub.id);
      } else {
        pubDb.resumePub(pub.id);
        schedulePub(client, pubDb.getPubById(pub.id));
      }
    }

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(anyActive ? 0xFF4444 : 0x00FF88)
        .setDescription(anyActive
          ? `⏸️ **Toutes les pubs sont désactivées** — Utilise \`/pub liste\` pour les réactiver individuellement`
          : `▶️ **Toutes les pubs sont réactivées !**`
        )
      ],
      components: []
    });
  }

  // ── Bouton "Tous les salons" ──────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "pub_select_all_channels") {
    const modal = buildPubModal("ALL");
    return interaction.showModal(modal);
  }

  // ── Sélecteur de salon (étape 1) ─────────────────────────────────────
  if (interaction.isChannelSelectMenu() && interaction.customId === "pub_select_channel") {
    const channelId = interaction.values[0];
    const modal     = buildPubModal(channelId);
    return interaction.showModal(modal);
  }

  // ── Modal soumis (étape 2 — création) ────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("pub_modal_")) {
    const channelId    = interaction.customId.replace("pub_modal_", "");
    const lien         = interaction.fields.getTextInputValue("pub_lien").trim();
    const description  = interaction.fields.getTextInputValue("pub_description").trim();
    const imageUrl     = interaction.fields.getTextInputValue("pub_image").trim() || null;
    const scheduleRaw  = interaction.fields.getTextInputValue("pub_schedule").trim();

    let scheduledTime   = null;
    let intervalMinutes = null;

    if (scheduleRaw) {
      if (scheduleRaw.includes(":")) {
        // Heure précise ex "20:30"
        scheduledTime = scheduleRaw;
      } else {
        const mins = parseInt(scheduleRaw);
        if (!isNaN(mins) && mins > 0) intervalMinutes = mins;
      }
    }

    const pub = pubDb.createPub({
      channelId, lien, description, imageUrl, scheduledTime, intervalMinutes,
      createdBy: interaction.user.id,
    });

    // Programmer le cron
    schedulePub(client, pub);

    // Preview de la pub
    const previewEmbed = buildPubEmbed(pub);
    const scheduleInfo = scheduledTime
      ? `🕐 Tous les jours à **${scheduledTime}**`
      : intervalMinutes
      ? `⏱️ Toutes les **${intervalMinutes} minutes**`
      : "⚠️ Pas de schedule — utilise `/pub envoyer` pour l'envoyer manuellement";

    const confirmEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("✅ Pub créée avec succès !")
      .addFields(
        { name: "📍 Salon",    value: `<#${channelId}>`,  inline: true },
        { name: "📅 Schedule", value: scheduleInfo,        inline: true },
        { name: "🆔 ID",       value: `\`${pub.id.slice(-8)}\``, inline: true },
      )
      .setFooter({ text: "Aperçu de la pub ci-dessous 👇" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`send_now_${pub.id}`)
        .setLabel("📤 Envoyer maintenant (test)")
        .setStyle(ButtonStyle.Secondary),
    );

    return interaction.reply({
      embeds: [confirmEmbed, previewEmbed],
      components: [row, buildPubRow(pub)],
      ephemeral: true,
    });
  }

  // ── Select menu action (supprimer / pause / relancer / envoyer) ───────
  if (interaction.isStringSelectMenu() && interaction.customId === "pub_action_select") {
    const value  = interaction.values[0];
    const [action, ...idParts] = value.split("_");
    const pubId  = idParts.join("_");
    const pub    = pubDb.getPubById(pubId);

    if (!pub) {
      return interaction.update({ content: "❌ Pub introuvable.", components: [] });
    }

    if (action === "supprimer") {
      stopPub(pubId);
      pubDb.deletePub(pubId);
      return interaction.update({ content: `🗑️ Pub **#${pubId.slice(-5)}** supprimée.`, components: [], embeds: [] });
    }

    if (action === "pause") {
      stopPub(pubId);
      pubDb.togglePub(pubId, false);
      return interaction.update({ content: `⏸️ Pub **#${pubId.slice(-5)}** mise en pause.`, components: [], embeds: [] });
    }

    if (action === "relancer") {
      const updated = pubDb.togglePub(pubId, true);
      schedulePub(client, updated);
      return interaction.update({ content: `▶️ Pub **#${pubId.slice(-5)}** relancée !`, components: [], embeds: [] });
    }

    if (action === "send") {
      await sendPub(client, pub);
      return interaction.update({ content: `📤 Pub **#${pubId.slice(-5)}** envoyée dans <#${pub.channelId}> !`, components: [], embeds: [] });
    }
  }

  // ── Bouton "Envoyer maintenant" depuis la confirmation ────────────────
  if (interaction.isButton() && interaction.customId.startsWith("send_now_")) {
    const pubId = interaction.customId.replace("send_now_", "");
    const pub   = pubDb.getPubById(pubId);
    if (!pub) return interaction.reply({ content: "❌ Pub introuvable.", ephemeral: true });
    await sendPub(client, pub);
    return interaction.reply({ content: `✅ Pub envoyée dans <#${pub.channelId}> !`, ephemeral: true });
  }

  // ── Bouton "Nouvelle pub" depuis la liste ─────────────────────────────
  if (interaction.isButton() && interaction.customId === "pub_créer_shortcut") {
    return handlePubCreer(interaction);
  }
}

module.exports = { pubCommandDef, handlePubInteraction };
