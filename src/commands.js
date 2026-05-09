// src/commands.js — Commandes premium v2 (boutons, menus, pagination)

const {
  EmbedBuilder, SlashCommandBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder
} = require("discord.js");
const db = require("./database");
const { runCeremony } = require("./ceremony");

// ── Définitions des commandes ─────────────────────────────────────────────
const commandDefs = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("⚡ Voir ton profil XP complet avec niveau et badges")
    .addUserOption(o => o.setName("membre").setDescription("Voir le profil d'un autre membre").setRequired(false)),

  new SlashCommandBuilder()
    .setName("classement")
    .setDescription("🏆 Classement interactif de la semaine"),

  new SlashCommandBuilder()
    .setName("historique")
    .setDescription("👑 Voir les anciens Kings of the Day"),

  new SlashCommandBuilder()
    .setName("couronner")
    .setDescription("👑 [ADMIN] Lancer manuellement le couronnement")
    .setDefaultMemberPermissions(0x8),

  new SlashCommandBuilder()
    .setName("xp")
    .setDescription("⚡ Voir ton XP rapide")
    .addUserOption(o => o.setName("membre").setDescription("Voir le XP d'un autre").setRequired(false)),

].map(c => c.toJSON());

// ── Builders d'embeds ─────────────────────────────────────────────────────
function buildProfilEmbed(user, userData) {
  const level      = db.getLevelFromXP(userData.totalXp);
  const progress   = db.xpInCurrentLevel(userData.totalXp);
  const bar        = db.progressBar(progress.current, progress.needed);
  const badges     = db.getUserBadges(userData);
  const badgeStr   = badges.length ? badges.map(b => `${b.label} *${b.title}*`).join("\n") : "*Aucun badge pour l'instant*";
  const lb         = db.getLeaderboard(100);
  const rank       = lb.findIndex(u => u.id === user.id) + 1;

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: `Profil de ${user.displayName}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "📈 Niveau & Progression",
        value:
          `**Niveau ${level}**\n` +
          `${bar}\n` +
          `${progress.current.toLocaleString("fr-FR")} / ${progress.needed.toLocaleString("fr-FR")} XP`,
        inline: false,
      },
      {
        name: "⚡ XP cette semaine",
        value: `**${userData.xp.toLocaleString("fr-FR")} XP**`,
        inline: true,
      },
      {
        name: "📊 XP total",
        value: `**${userData.totalXp.toLocaleString("fr-FR")} XP**`,
        inline: true,
      },
      {
        name: "🏅 Classement",
        value: rank ? `**#${rank}**` : "*Non classé*",
        inline: true,
      },
      {
        name: "👑 Couronnes",
        value: `**x${userData.crownCount || 0}**`,
        inline: true,
      },
      {
        name: "🎖️ Badges",
        value: badgeStr,
        inline: false,
      }
    )
    .setFooter({ text: "King of the Day Bot  •  XP remis à zéro chaque vendredi 👑" })
    .setTimestamp();
}

function buildLeaderboardEmbed(lb, page = 0, pageSize = 5) {
  const start  = page * pageSize;
  const slice  = lb.slice(start, start + pageSize);
  const medals = ["🥇", "🥈", "🥉"];
  const total  = lb.reduce((s, u) => s + u.xp, 0);

  const lines = slice.map((u, i) => {
    const rank     = start + i + 1;
    const icon     = medals[rank - 1] || `\`#${rank}\``;
    const level    = db.getLevelFromXP(u.totalXp);
    const progress = db.xpInCurrentLevel(u.totalXp);
    const pct      = Math.round((progress.current / progress.needed) * 100);
    return `${icon} <@${u.id}> — **${u.xp.toLocaleString("fr-FR")} XP**  ·  Nv.**${level}**  ·  ${pct}% vers Nv.${level + 1}`;
  });

  const maxPages = Math.ceil(lb.length / pageSize);

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle("🏆  Classement de la semaine")
    .setDescription(lines.join("\n\n") || "*Aucun XP enregistré cette semaine*")
    .setFooter({ text: `Page ${page + 1}/${maxPages}  •  ${lb.length} membres actifs  •  ${total.toLocaleString("fr-FR")} XP total` })
    .setTimestamp();
}

// ── Handlers de commandes ─────────────────────────────────────────────────
async function handleProfil(interaction) {
  const target   = interaction.options.getUser("membre") || interaction.user;
  const userData = db.getUser(target.id);
  const embed    = buildProfilEmbed(target, userData);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_classement")
      .setLabel("🏆 Classement")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("btn_historique")
      .setLabel("👑 Historique")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleXP(interaction) {
  const target   = interaction.options.getUser("membre") || interaction.user;
  const userData = db.getUser(target.id);
  const level    = db.getLevelFromXP(userData.totalXp);
  const progress = db.xpInCurrentLevel(userData.totalXp);
  const bar      = db.progressBar(progress.current, progress.needed);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL({ size: 32 }) })
    .setDescription(
      `**Niveau ${level}** — ${userData.xp.toLocaleString("fr-FR")} XP cette semaine\n${bar}`
    )
    .setFooter({ text: "Utilise /profil pour voir tous tes badges et statistiques" });

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

async function handleClassement(interaction) {
  const lb    = db.getLeaderboard(50);
  const embed = buildLeaderboardEmbed(lb, 0);
  const row   = buildPaginationRow(0, lb.length, 5);
  await interaction.reply({ embeds: [embed], components: row ? [row] : [] });
}

function buildPaginationRow(page, total, pageSize) {
  const maxPages = Math.ceil(total / pageSize);
  if (maxPages <= 1) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb_prev_${page}`)
      .setLabel("◀ Précédent")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`lb_next_${page}`)
      .setLabel("Suivant ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPages - 1),
  );
}

async function handleHistorique(interaction) {
  const history = db.getKingHistory(5);

  if (!history.length) {
    return interaction.reply({ content: "Aucun King couronné pour l'instant !", ephemeral: true });
  }

  const lines = history.map((h, i) =>
    `**${i + 1}.** <@${h.userId}>\n> ${h.xp.toLocaleString("fr-FR")} XP  ·  ${h.date}`
  );

  const embed = new EmbedBuilder()
    .setColor(0xC09030)
    .setTitle("👑  Historique des Kings of the Day")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: "Chaque vendredi soir, un nouveau roi est couronné" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleCouronner(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await runCeremony(interaction.client);
  await interaction.editReply({ content: "✅ Cérémonie lancée !" });
}

// ── Routeur interactions (commandes + boutons) ────────────────────────────
async function handleInteraction(interaction) {
  // Commandes slash
  if (interaction.isChatInputCommand()) {
    const handlers = {
      profil:    handleProfil,
      xp:        handleXP,
      classement: handleClassement,
      historique: handleHistorique,
      couronner:  handleCouronner,
    };
    return handlers[interaction.commandName]?.(interaction)?.catch(console.error);
  }

  // Boutons
  if (interaction.isButton()) {
    const id = interaction.customId;

    // Bouton classement (depuis profil ou cérémonie)
    if (id === "btn_classement") {
      const lb    = db.getLeaderboard(50);
      const embed = buildLeaderboardEmbed(lb, 0);
      const row   = buildPaginationRow(0, lb.length, 5);
      return interaction.reply({ embeds: [embed], components: row ? [row] : [], ephemeral: true });
    }

    // Bouton historique
    if (id === "btn_historique") {
      await handleHistorique(interaction);
      // Patch: override to ephemeral
      return;
    }

    // Bouton profil du roi (depuis cérémonie)
    if (id.startsWith("btn_xp_")) {
      const userId   = id.split("btn_xp_")[1];
      const userData = db.getUser(userId);
      try {
        const user  = await interaction.client.users.fetch(userId);
        const embed = buildProfilEmbed(user, userData);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      } catch {
        return interaction.reply({ content: "Impossible de charger ce profil.", ephemeral: true });
      }
    }

    // Pagination du classement
    if (id.startsWith("lb_prev_") || id.startsWith("lb_next_")) {
      const parts   = id.split("_");
      const dir     = parts[1]; // prev | next
      const curPage = parseInt(parts[2]);
      const newPage = dir === "next" ? curPage + 1 : curPage - 1;
      const lb      = db.getLeaderboard(50);
      const embed   = buildLeaderboardEmbed(lb, newPage);
      const row     = buildPaginationRow(newPage, lb.length, 5);
      return interaction.update({ embeds: [embed], components: row ? [row] : [] });
    }
  }
}

module.exports = { commandDefs, handleInteraction };
