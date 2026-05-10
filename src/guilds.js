// src/guilds.js — Système de Guildes complet

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits
} = require("discord.js");
const { upsert, findOne, findMany, deleteOne } = require("./mongodb");
const fs   = require("fs");
const path = require("path");

const GUILD_FILE = path.join(__dirname, "../data/guilds.json");

// Fallback JSON si pas de MongoDB
function loadGuildsLocal() {
  if (!fs.existsSync(GUILD_FILE)) return { guilds: {}, members: {} };
  return JSON.parse(fs.readFileSync(GUILD_FILE, "utf-8"));
}
function saveGuildsLocal(data) {
  fs.mkdirSync(path.dirname(GUILD_FILE), { recursive: true });
  fs.writeFileSync(GUILD_FILE, JSON.stringify(data, null, 2));
}

const MAX_GUILDS    = 5;
const MIN_LEVEL_CREATE = 10;

// ── Commande /guilde ──────────────────────────────────────────────────────
const guildCommandDef = new SlashCommandBuilder()
  .setName("guilde")
  .setDescription("🏰 Système de Guildes")
  .addSubcommand(s => s
    .setName("créer")
    .setDescription("🏰 Créer une nouvelle guilde (niveau 10 requis)"))
  .addSubcommand(s => s
    .setName("rejoindre")
    .setDescription("➕ Rejoindre une guilde existante"))
  .addSubcommand(s => s
    .setName("quitter")
    .setDescription("🚪 Quitter sa guilde actuelle"))
  .addSubcommand(s => s
    .setName("info")
    .setDescription("📋 Voir les infos d'une guilde")
    .addStringOption(o => o.setName("nom").setDescription("Nom de la guilde").setRequired(false)))
  .addSubcommand(s => s
    .setName("classement")
    .setDescription("🏆 Classement des guildes"))
  .addSubcommand(s => s
    .setName("membres")
    .setDescription("👥 Voir les membres de sa guilde"))
  .addSubcommand(s => s
    .setName("défier")
    .setDescription("⚔️ Défier une guilde pour prendre sa place")
    .addStringOption(o => o.setName("guilde").setDescription("Nom de la guilde à défier").setRequired(true)))
  .addSubcommand(s => s
    .setName("dissoudre")
    .setDescription("💀 [ADMIN] Dissoudre une guilde")
    .addStringOption(o => o.setName("nom").setDescription("Nom de la guilde").setRequired(true)))
  .toJSON();

// ── Handler principal ─────────────────────────────────────────────────────
async function handleGuildCommand(interaction, userLevel) {
  const sub = interaction.options.getSubcommand();

  if (sub === "créer")     return handleCreate(interaction, userLevel);
  if (sub === "rejoindre") return handleJoin(interaction);
  if (sub === "quitter")   return handleLeave(interaction);
  if (sub === "info")      return handleInfo(interaction);
  if (sub === "classement") return handleRanking(interaction);
  if (sub === "membres")   return handleMembers(interaction);
  if (sub === "défier")    return handleChallenge(interaction);
  if (sub === "dissoudre") return handleDissolve(interaction);
}

// ── Créer une guilde ──────────────────────────────────────────────────────
async function handleCreate(interaction, userLevel) {
  const data = loadGuildsLocal();
  const userId = interaction.user.id;

  // Vérifier niveau
  if (userLevel < MIN_LEVEL_CREATE) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle("❌ Niveau insuffisant")
        .setDescription(`Tu dois être **niveau ${MIN_LEVEL_CREATE}** pour créer une guilde !\nTon niveau actuel : **${userLevel}**\n\nContinue à parler pour gagner de l'XP ! 💪`)
      ],
      ephemeral: true
    });
  }

  // Vérifier si déjà dans une guilde
  if (data.members[userId]) {
    return interaction.reply({ content: "❌ Tu es déjà dans une guilde ! Quitte-la d'abord avec `/guilde quitter`", ephemeral: true });
  }

  // Vérifier limite
  const guildsCount = Object.keys(data.guilds).length;
  if (guildsCount >= MAX_GUILDS) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle("⚠️ Limite de guildes atteinte !")
        .setDescription(`Le serveur a déjà **${MAX_GUILDS} guildes** !\n\nPour créer la tienne tu dois **défier** une guilde existante avec \`/guilde défier\``)
      ],
      ephemeral: true
    });
  }

  // Ouvrir modal
  const modal = new ModalBuilder()
    .setCustomId("guild_create_modal")
    .setTitle("🏰 Créer une Guilde");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("guild_name")
        .setLabel("Nom de la guilde (2-20 caractères)")
        .setStyle(TextInputStyle.Short)
        .setMinLength(2).setMaxLength(20).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("guild_emoji")
        .setLabel("Emoji de la guilde (1 emoji)")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(5).setRequired(true).setPlaceholder("⚔️")
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("guild_desc")
        .setLabel("Description courte")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(200).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("guild_color")
        .setLabel("Couleur du rôle (code hex, ex: FF5733)")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(6).setRequired(true).setPlaceholder("FF5733")
    ),
  );

  await interaction.showModal(modal);
}

// ── Traiter la création ───────────────────────────────────────────────────
async function handleCreateModal(interaction) {
  const name  = interaction.fields.getTextInputValue("guild_name").trim();
  const emoji = interaction.fields.getTextInputValue("guild_emoji").trim();
  const desc  = interaction.fields.getTextInputValue("guild_desc").trim();
  const color = interaction.fields.getTextInputValue("guild_color").replace("#", "").trim();

  const data   = loadGuildsLocal();
  const userId = interaction.user.id;

  // Vérifier nom unique
  const exists = Object.values(data.guilds).find(g => g.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    return interaction.reply({ content: `❌ Une guilde nommée **${name}** existe déjà !`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const guildId = Date.now().toString(36);
  const colorInt = parseInt(color, 16) || 0x5865F2;

  // Créer le rôle Discord
  let role = null;
  try {
    role = await interaction.guild.roles.create({
      name: `${emoji} ${name}`,
      color: colorInt,
      reason: `Guilde créée par ${interaction.user.tag}`
    });
  } catch (err) {
    console.error("[GUILD] Erreur création rôle:", err.message);
  }

  // Créer le salon privé
  let channel = null;
  try {
    channel = await interaction.guild.channels.create({
      name: `${emoji}┃${name.toLowerCase().replace(/\s/g, "-")}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: role?.id || interaction.guild.id, allow: [PermissionFlagsBits.ViewChannel] },
      ],
      reason: `Salon privé guilde ${name}`
    });
  } catch (err) {
    console.error("[GUILD] Erreur création salon:", err.message);
  }

  // Sauvegarder
  data.guilds[guildId] = {
    id: guildId, name, emoji, desc,
    color: `#${color}`,
    chief: userId,
    roleId: role?.id || null,
    channelId: channel?.id || null,
    members: [userId],
    weeklyXP: 0,
    totalXP: 0,
    victories: 0,
    createdAt: Date.now(),
    challengedBy: null,
  };
  data.members[userId] = guildId;
  saveGuildsLocal(data);

  // Donner le rôle au créateur
  if (role) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.add(role).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(colorInt)
    .setTitle(`${emoji} Guilde **${name}** créée !`)
    .setDescription(desc)
    .addFields(
      { name: "👑 Chef", value: `<@${userId}>`, inline: true },
      { name: "👥 Membres", value: "1", inline: true },
      { name: "🏠 Salon", value: channel ? `<#${channel.id}>` : "*Non créé*", inline: true },
    )
    .setFooter({ text: "Les autres peuvent rejoindre avec /guilde rejoindre !" });

  await interaction.editReply({ embeds: [embed] });

  // Annonce publique
  const announce = await interaction.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(colorInt)
      .setTitle(`🏰 Nouvelle guilde : ${emoji} ${name} !`)
      .setDescription(`<@${userId}> vient de fonder la guilde **${name}** !\n\n*${desc}*\n\nRejoinds-la avec \`/guilde rejoindre\` !`)
      .setTimestamp()
    ]
  }).catch(() => {});
}

// ── Rejoindre une guilde ──────────────────────────────────────────────────
async function handleJoin(interaction) {
  const data   = loadGuildsLocal();
  const userId = interaction.user.id;

  if (data.members[userId]) {
    return interaction.reply({ content: "❌ Tu es déjà dans une guilde ! Quitte-la d'abord.", ephemeral: true });
  }

  const guilds = Object.values(data.guilds);
  if (!guilds.length) {
    return interaction.reply({ content: "❌ Aucune guilde n'existe encore ! Crée la première avec `/guilde créer`", ephemeral: true });
  }

  const buttons = guilds.map(g =>
    new ButtonBuilder()
      .setCustomId(`guild_join_${g.id}`)
      .setLabel(`${g.emoji} ${g.name} (${g.members.length} membres)`)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🏰 Rejoindre une Guilde")
    .setDescription(guilds.map(g => `${g.emoji} **${g.name}** — ${g.members.length} membres\n*${g.desc}*`).join("\n\n"));

  await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}

// ── Handler bouton rejoindre ──────────────────────────────────────────────
async function handleJoinButton(interaction) {
  const guildId = interaction.customId.replace("guild_join_", "");
  const data    = loadGuildsLocal();
  const userId  = interaction.user.id;

  if (data.members[userId]) {
    return interaction.update({ content: "❌ Tu es déjà dans une guilde !", components: [], embeds: [] });
  }

  const guild = data.guilds[guildId];
  if (!guild) return interaction.update({ content: "❌ Guilde introuvable", components: [], embeds: [] });

  // Ajouter le membre
  guild.members.push(userId);
  data.members[userId] = guildId;
  saveGuildsLocal(data);

  // Donner le rôle
  if (guild.roleId) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.add(guild.roleId).catch(() => {});
  }

  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(parseInt(guild.color.replace("#", ""), 16) || 0x5865F2)
      .setTitle(`✅ Tu as rejoint ${guild.emoji} ${guild.name} !`)
      .setDescription(`Bienvenue dans la guilde ! Ton salon privé : ${guild.channelId ? `<#${guild.channelId}>` : "*Non disponible*"}`)
    ],
    components: []
  });
}

// ── Quitter une guilde ────────────────────────────────────────────────────
async function handleLeave(interaction) {
  const data   = loadGuildsLocal();
  const userId = interaction.user.id;
  const guildId = data.members[userId];

  if (!guildId) return interaction.reply({ content: "❌ Tu n'es dans aucune guilde !", ephemeral: true });

  const guild = data.guilds[guildId];

  // Si c'est le chef → dissoudre ou transférer
  if (guild.chief === userId && guild.members.length === 1) {
    // Supprimer la guilde
    if (guild.roleId) await interaction.guild.roles.delete(guild.roleId).catch(() => {});
    if (guild.channelId) await interaction.guild.channels.delete(guild.channelId).catch(() => {});
    delete data.guilds[guildId];
    delete data.members[userId];
    saveGuildsLocal(data);
    return interaction.reply({ content: `💀 Tu étais le seul membre — la guilde **${guild.name}** a été dissoute.`, ephemeral: true });
  }

  // Retirer le rôle
  if (guild.roleId) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.remove(guild.roleId).catch(() => {});
  }

  guild.members = guild.members.filter(id => id !== userId);
  if (guild.chief === userId) guild.chief = guild.members[0]; // Nouveau chef
  delete data.members[userId];
  saveGuildsLocal(data);

  await interaction.reply({ content: `✅ Tu as quitté la guilde **${guild.emoji} ${guild.name}**.`, ephemeral: true });
}

// ── Info guilde ───────────────────────────────────────────────────────────
async function handleInfo(interaction) {
  const data    = loadGuildsLocal();
  const userId  = interaction.user.id;
  const nomArg  = interaction.options.getString("nom");

  let guild;
  if (nomArg) {
    guild = Object.values(data.guilds).find(g => g.name.toLowerCase() === nomArg.toLowerCase());
  } else {
    const guildId = data.members[userId];
    guild = guildId ? data.guilds[guildId] : null;
  }

  if (!guild) return interaction.reply({ content: "❌ Guilde introuvable !", ephemeral: true });

  const color = parseInt(guild.color.replace("#", ""), 16) || 0x5865F2;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${guild.emoji} ${guild.name}`)
    .setDescription(guild.desc)
    .addFields(
      { name: "👑 Chef", value: `<@${guild.chief}>`, inline: true },
      { name: "👥 Membres", value: `${guild.members.length}`, inline: true },
      { name: "🏠 Salon", value: guild.channelId ? `<#${guild.channelId}>` : "*Non créé*", inline: true },
      { name: "⚡ XP semaine", value: `${guild.weeklyXP || 0}`, inline: true },
      { name: "🏆 Victoires", value: `${guild.victories || 0}`, inline: true },
      { name: "📅 Fondée", value: `<t:${Math.floor(guild.createdAt / 1000)}:R>`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Classement guildes ────────────────────────────────────────────────────
async function handleRanking(interaction) {
  const data   = loadGuildsLocal();
  const guilds = Object.values(data.guilds).sort((a, b) => (b.weeklyXP || 0) - (a.weeklyXP || 0));

  if (!guilds.length) return interaction.reply({ content: "Aucune guilde encore !", ephemeral: true });

  const medals = ["🥇", "🥈", "🥉"];
  const lines  = guilds.map((g, i) =>
    `${medals[i] || `\`#${i+1}\``} ${g.emoji} **${g.name}** — ⚡ ${g.weeklyXP || 0} XP cette semaine | 🏆 ${g.victories || 0} victoires | 👥 ${g.members.length} membres`
  );

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle("🏆 Classement des Guildes")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Reset chaque vendredi soir !" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Membres de sa guilde ──────────────────────────────────────────────────
async function handleMembers(interaction) {
  const data    = loadGuildsLocal();
  const guildId = data.members[interaction.user.id];
  if (!guildId) return interaction.reply({ content: "❌ Tu n'es dans aucune guilde !", ephemeral: true });

  const guild = data.guilds[guildId];
  const memberList = guild.members.map(id => id === guild.chief ? `👑 <@${id}>` : `<@${id}>`).join("\n");

  const embed = new EmbedBuilder()
    .setColor(parseInt(guild.color.replace("#", ""), 16) || 0x5865F2)
    .setTitle(`${guild.emoji} Membres de ${guild.name}`)
    .setDescription(memberList || "*Aucun membre*")
    .setFooter({ text: `${guild.members.length} membre(s)` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Défier une guilde ─────────────────────────────────────────────────────
async function handleChallenge(interaction) {
  const data    = loadGuildsLocal();
  const userId  = interaction.user.id;
  const nomArg  = interaction.options.getString("guilde");

  // Vérifier pas déjà dans une guilde
  if (data.members[userId]) {
    return interaction.reply({ content: "❌ Tu es déjà dans une guilde ! Quitte-la d'abord.", ephemeral: true });
  }

  const target = Object.values(data.guilds).find(g => g.name.toLowerCase() === nomArg.toLowerCase());
  if (!target) return interaction.reply({ content: `❌ Guilde **${nomArg}** introuvable !`, ephemeral: true });

  if (target.challengedBy) {
    return interaction.reply({ content: `❌ Cette guilde est déjà en duel !`, ephemeral: true });
  }

  // Lancer le duel
  target.challengedBy = { userId, startXP: 0, chiefStartXP: 0, startDate: Date.now() };
  saveGuildsLocal(data);

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle(`⚔️ Duel lancé contre ${target.emoji} ${target.name} !`)
    .setDescription(
      `<@${userId}> défie la guilde **${target.emoji} ${target.name}** !\n\n` +
      `📅 Le duel dure **7 jours**\n` +
      `⚡ Celui qui gagne le plus d'XP en 7 jours gagne\n` +
      `👥 Les membres de la guilde peuvent aider leur chef !\n\n` +
      `Si le challenger gagne → il fonde une nouvelle guilde à la place !`
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ── Dissoudre une guilde (admin) ──────────────────────────────────────────
async function handleDissolve(interaction) {
  const data = loadGuildsLocal();
  const nom  = interaction.options.getString("nom");
  const guild = Object.values(data.guilds).find(g => g.name.toLowerCase() === nom.toLowerCase());

  if (!guild) return interaction.reply({ content: `❌ Guilde **${nom}** introuvable !`, ephemeral: true });

  // Retirer les rôles
  if (guild.roleId) {
    await interaction.guild.roles.delete(guild.roleId).catch(() => {});
  }
  if (guild.channelId) {
    await interaction.guild.channels.delete(guild.channelId).catch(() => {});
  }

  // Retirer les membres
  guild.members.forEach(id => delete data.members[id]);
  delete data.guilds[guild.id];
  saveGuildsLocal(data);

  await interaction.reply({ content: `✅ Guilde **${guild.emoji} ${guild.name}** dissoute !`, ephemeral: true });
}

// ── Ajouter XP à la guilde du membre ─────────────────────────────────────
function addGuildXP(userId, amount) {
  const data    = loadGuildsLocal();
  const guildId = data.members[userId];
  if (!guildId || !data.guilds[guildId]) return;

  data.guilds[guildId].weeklyXP  = (data.guilds[guildId].weeklyXP  || 0) + amount;
  data.guilds[guildId].totalXP   = (data.guilds[guildId].totalXP   || 0) + amount;
  saveGuildsLocal(data);
}

// ── Cérémonie vendredi — résultats guildes ────────────────────────────────
async function runGuildCeremony(client, cfg) {
  const data   = loadGuildsLocal();
  const guilds = Object.values(data.guilds).sort((a, b) => (b.weeklyXP || 0) - (a.weeklyXP || 0));
  if (!guilds.length) return;

  const winner = guilds[0];
  const medals = ["🥇", "🥈", "🥉"];
  const lines  = guilds.map((g, i) =>
    `${medals[i] || `\`#${i+1}\``} ${g.emoji} **${g.name}** — ${g.weeklyXP || 0} XP`
  );

  winner.victories = (winner.victories || 0) + 1;

  // Donner rôle "Guilde Dominante" si configuré
  if (cfg.dominantRoleId) {
    // Retirer l'ancien rôle dominant
    const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
    if (guild) {
      const role = await guild.roles.fetch(cfg.dominantRoleId).catch(() => null);
      if (role) {
        role.members.forEach(m => m.roles.remove(role).catch(() => {}));
        // Donner aux membres de la guilde gagnante
        winner.members.forEach(async id => {
          const member = await guild.members.fetch(id).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
        });
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`⚔️ Résultats Guerre des Guildes — Semaine ${new Date().toLocaleDateString("fr-FR")}`)
    .setDescription(
      `🏆 **${winner.emoji} ${winner.name}** remporte la semaine !\n\n` +
      lines.join("\n") +
      `\n\n🎉 Tous les membres de **${winner.name}** ont le **bonus XP x2** pendant 24h !`
    )
    .setFooter({ text: "La guerre repart à zéro la semaine prochaine !" })
    .setTimestamp();

  // Reset XP hebdo
  Object.values(data.guilds).forEach(g => g.weeklyXP = 0);
  saveGuildsLocal(data);

  const channelId = cfg.announceChannelId || process.env.ANNOUNCE_CHANNEL_ID;
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (channel) await channel.send({ embeds: [embed] });
}

module.exports = {
  guildCommandDef, handleGuildCommand, handleCreateModal,
  handleJoinButton, addGuildXP, runGuildCeremony
};
