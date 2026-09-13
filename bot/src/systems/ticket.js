// src/systems/ticket.js — Système tickets public complet
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits,
} = require('discord.js');

const Config = require('../db/models/Config');
const Ticket = require('../db/models/Ticket');
const logger = require('../utils/logger');
const { COLORS } = require('../config/constants');

// ── Types de tickets ──────────────────────────────────────────────────────────
const TICKET_TYPES = {
  support:     { label: '🛠️ Support',        description: 'Aide technique ou question générale' },
  signalement: { label: '🚨 Signalement',     description: 'Signaler un membre ou un contenu' },
  partenariat: { label: '🤝 Partenariat',     description: 'Proposer un partenariat' },
  autre:       { label: '📩 Autre',           description: 'Autre demande' },
};

// ── Envoyer le panel ticket dans un salon ────────────────────────────────────
async function sendTicketPanel(channel, guildId) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle('🎫 Ouvrir un ticket')
    .setDescription(
      'Tu as besoin d\'aide, tu veux signaler quelqu\'un, ou tu as une demande particulière ?\n\n' +
      '**Clique sur le bouton correspondant à ta demande.**\n\n' +
      Object.entries(TICKET_TYPES).map(([k, v]) => `${v.label} — *${v.description}*`).join('\n')
    )
    .setFooter({ text: 'Un ticket = un canal privé avec le staff.' })
    .setTimestamp();

  const rows = [];
  const entries = Object.entries(TICKET_TYPES);
  // 2 boutons par ligne max
  for (let i = 0; i < entries.length; i += 2) {
    const row = new ActionRowBuilder();
    for (let j = i; j < Math.min(i + 2, entries.length); j++) {
      const [key, val] = entries[j];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:open:${key}`)
          .setLabel(val.label)
          .setStyle(ButtonStyle.Primary)
      );
    }
    rows.push(row);
  }

  await channel.send({ embeds: [embed], components: rows });
  logger.info('Ticket', `Panel ticket envoyé dans #${channel.name}`);
}

// ── Ouvrir un ticket ─────────────────────────────────────────────────────────
async function openTicket(interaction, type) {
  await interaction.deferReply({ ephemeral: true });

  const guildId  = interaction.guild.id;
  const userId   = interaction.user.id;
  const config   = await Config.findOne({ guildId });
  const typeInfo = TICKET_TYPES[type] || TICKET_TYPES.autre;

  // Vérifier si l'utilisateur a déjà un ticket ouvert de ce type
  const existing = await Ticket.findOne({ guildId, userId, type, status: 'open' });
  if (existing) {
    const ch = interaction.guild.channels.cache.get(existing.channelId);
    if (ch) return interaction.editReply({ content: `❌ Tu as déjà un ticket **${typeInfo.label}** ouvert : <#${ch.id}>` });
    // Le channel a été supprimé manuellement — on nettoie
    existing.status = 'closed';
    await existing.save();
  }

  // Récupérer la catégorie
  const categoryId = config?.ticketCategoryId;
  const category   = categoryId ? interaction.guild.channels.cache.get(categoryId) : null;

  // Créer le channel ticket
  const channelName = `ticket-${type}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`;

  const staffRoleId = config?.staffRoleId || config?.moderateurRoleId;

  const permOverwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    },
    {
      id: interaction.guild.members.me.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
    },
  ];
  if (staffRoleId) {
    permOverwrites.push({
      id: staffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  let ticketChannel;
  try {
    ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category || undefined,
      permissionOverwrites: permOverwrites,
      topic: `Ticket ${typeInfo.label} — <@${userId}> — Ouvert le ${new Date().toLocaleDateString('fr-FR')}`,
    });
  } catch (err) {
    logger.error('Ticket', 'Erreur création channel ticket', err);
    return interaction.editReply({ content: '❌ Impossible de créer le ticket. Vérifie les permissions du bot.' });
  }

  // Créer en base
  const ticket = await Ticket.create({
    guildId,
    userId,
    type,
    channelId: ticketChannel.id,
    status: 'open',
  });

  // Message d'accueil dans le ticket
  const welcomeEmbed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${typeInfo.label} — Ticket #${ticket._id.toString().slice(-6).toUpperCase()}`)
    .setDescription(
      `Bienvenue <@${userId}> ! 👋\n\n` +
      `**Type :** ${typeInfo.label}\n` +
      `**Objet :** ${typeInfo.description}\n\n` +
      `📝 Explique ta demande ici, le staff répondra dès que possible.\n` +
      `> Merci de décrire ton problème avec le maximum de détails !`
    )
    .setFooter({ text: `ID Ticket : ${ticket._id}` })
    .setTimestamp();

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:claim:${ticket._id}`).setLabel('✋ Prendre en charge').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket:close:${ticket._id}`).setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger),
  );

  const pingContent = staffRoleId ? `<@&${staffRoleId}> | <@${userId}>` : `<@${userId}>`;
  await ticketChannel.send({ content: pingContent, embeds: [welcomeEmbed], components: [controlRow] });

  // Log dans le salon logs
  if (config?.logsChannelId || config?.logChannelId) {
    const logCh = interaction.guild.channels.cache.get(config.logsChannelId || config.logChannelId);
    if (logCh) {
      const logEmbed = new EmbedBuilder()
        .setColor(COLORS.GREEN)
        .setTitle('🎫 Nouveau ticket ouvert')
        .addFields(
          { name: '👤 Membre',  value: `<@${userId}>`,              inline: true },
          { name: '📂 Type',    value: typeInfo.label,               inline: true },
          { name: '📌 Channel', value: `<#${ticketChannel.id}>`,    inline: true },
        )
        .setTimestamp();
      logCh.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  logger.info('Ticket', `Ticket ${type} ouvert par ${interaction.user.tag}`);
  return interaction.editReply({ content: `✅ Ton ticket a été créé : <#${ticketChannel.id}>` });
}

// ── Prendre en charge un ticket ───────────────────────────────────────────────
async function claimTicket(interaction, ticketId) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await Ticket.findById(ticketId);
  if (!ticket || ticket.status !== 'open') return interaction.editReply({ content: '❌ Ticket introuvable ou déjà fermé.' });

  ticket.claimedBy = interaction.user.id;
  await ticket.save();

  const embed = new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setDescription(`✋ <@${interaction.user.id}> a pris en charge ce ticket.`)
    .setTimestamp();

  await interaction.channel.send({ embeds: [embed] });
  return interaction.editReply({ content: '✅ Tu as pris en charge ce ticket.' });
}

// ── Fermer un ticket ──────────────────────────────────────────────────────────
async function closeTicket(interaction, ticketId) {
  await interaction.deferReply({ ephemeral: false });

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });
  if (ticket.status === 'closed') return interaction.editReply({ content: '❌ Ce ticket est déjà fermé.' });

  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });

  ticket.status   = 'closed';
  ticket.closedBy = interaction.user.id;
  ticket.closedAt = new Date();
  await ticket.save();

  const closeEmbed = new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('🔒 Ticket fermé')
    .setDescription(`Ce ticket a été fermé par <@${interaction.user.id}>.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [closeEmbed] });

  // Log
  if (config?.logsChannelId || config?.logChannelId) {
    const logCh = interaction.guild.channels.cache.get(config.logsChannelId || config.logChannelId);
    if (logCh) {
      const typeInfo = TICKET_TYPES[ticket.type] || TICKET_TYPES.autre;
      const logEmbed = new EmbedBuilder()
        .setColor(COLORS.RED)
        .setTitle('🔒 Ticket fermé')
        .addFields(
          { name: '👤 Ouvert par',  value: `<@${ticket.userId}>`,              inline: true },
          { name: '🔒 Fermé par',   value: `<@${interaction.user.id}>`,         inline: true },
          { name: '📂 Type',        value: typeInfo.label,                      inline: true },
        )
        .setTimestamp();
      logCh.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  // Supprimer le channel après 5s
  setTimeout(() => {
    interaction.channel.delete(`Ticket fermé par ${interaction.user.tag}`).catch(() => {});
  }, 5000);
}

// ── Commande /ticket ──────────────────────────────────────────────────────────
async function handleTicketCommand(interaction, client) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });

  if (sub === 'panel') {
    // Admin seulement
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Réservé aux administrateurs.', ephemeral: true });
    }
    const salon = interaction.options.getChannel('salon') || interaction.channel;
    await interaction.deferReply({ ephemeral: true });
    await sendTicketPanel(salon, guildId);
    return interaction.editReply({ content: `✅ Panel ticket envoyé dans <#${salon.id}> !` });
  }

  if (sub === 'ouvrir') {
    const type = interaction.options.getString('type') || 'support';
    return openTicket(interaction, type);
  }

  if (sub === 'fermer') {
    await interaction.deferReply({ ephemeral: true });
    const ticket = await Ticket.findOne({ guildId, channelId: interaction.channel.id, status: 'open' });
    if (!ticket) return interaction.editReply({ content: '❌ Ce salon n\'est pas un ticket ouvert.' });
    return closeTicket(interaction, ticket._id);
  }

  if (sub === 'liste') {
    await interaction.deferReply({ ephemeral: true });
    const tickets = await Ticket.find({ guildId, status: 'open' }).sort({ createdAt: -1 }).limit(20);
    if (!tickets.length) return interaction.editReply({ content: '✅ Aucun ticket ouvert actuellement.' });
    const lines = tickets.map(t => {
      const typeInfo = TICKET_TYPES[t.type] || TICKET_TYPES.autre;
      const ch = interaction.guild.channels.cache.get(t.channelId);
      return `${typeInfo.label} — <@${t.userId}> — ${ch ? `<#${ch.id}>` : '*(salon supprimé)*'}`;
    });
    const embed = new EmbedBuilder()
      .setColor(COLORS.BLUE)
      .setTitle(`🎫 Tickets ouverts (${tickets.length})`)
      .setDescription(lines.join('\n'))
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { openTicket, claimTicket, closeTicket, sendTicketPanel, handleTicketCommand };
