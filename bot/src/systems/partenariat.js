// src/systems/partenariat.js — Tickets partenariat
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const mongoose = require('mongoose');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

const pSchema = new mongoose.Schema({
  guildId: String, channelId: String,
  applicantId: String, serverName: String, serverInvite: String,
  memberCount: Number, description: String,
  status: { type: String, default: 'open' },
}, { timestamps: true });
const PartnerTicket = mongoose.models.PartnerTicket || mongoose.model('PartnerTicket', pSchema);

// Bouton "Faire une demande de partenariat"
async function handleDemande(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('partner_form')
    .setTitle('Demande de partenariat')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('server_name').setLabel('Nom de votre serveur').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('server_invite').setLabel('Lien d\'invitation').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('member_count').setLabel('Nombre de membres').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('Présentation du serveur').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
    );
  return interaction.showModal(modal);
}

// Soumission du modal partenariat (appelé depuis modals.js)
async function handlePartnerModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const cfg = await Config.findOne({ guildId: gid });

  const existing = await PartnerTicket.findOne({ guildId: gid, applicantId: uid, status: 'open' });
  if (existing) {
    const ch = interaction.guild.channels.cache.get(existing.channelId);
    return interaction.editReply({ content: `✅ Ticket déjà ouvert : ${ch ? `<#${ch.id}>` : '(supprimé)'}` });
  }

  const serverName   = interaction.fields.getTextInputValue('server_name');
  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const memberCount  = parseInt(interaction.fields.getTextInputValue('member_count')) || 0;
  const description  = interaction.fields.getTextInputValue('description');

  const channel = await interaction.guild.channels.create({
    name: `partner-${serverName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32),
    type: ChannelType.GuildText,
    parent: cfg?.partnerCategoryId || null,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: uid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(cfg?.partnerManagerRoleId ? [{ id: cfg.partnerManagerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ],
  });

  await PartnerTicket.create({ guildId: gid, channelId: channel.id, applicantId: uid, serverName, serverInvite, memberCount, description, status: 'open' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.TEAL)
    .setTitle('🤝 Demande de partenariat')
    .addFields(
      { name: 'Serveur', value: serverName, inline: true },
      { name: 'Membres', value: `${memberCount}`, inline: true },
      { name: 'Invitation', value: serverInvite },
      { name: 'Présentation', value: description.slice(0, 1024) },
    )
    .setFooter({ text: `Demande de ${interaction.user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`partner:accepter:${channel.id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`partner:refuser:${channel.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`partner:negocier:${channel.id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Primary),
  );

  await channel.send({ content: `<@${uid}>`, embeds: [embed], components: [row] });
  return interaction.editReply({ content: `✅ Ticket créé : <#${channel.id}>` });
}

async function handleAccepterPartner(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await PartnerTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });
  ticket.status = 'accepte';
  await ticket.save();

  const embed = new EmbedBuilder().setColor(COLORS.GREEN).setTitle('✅ Partenariat accepté !')
    .setDescription('Votre demande de partenariat a été acceptée ! Bienvenue parmi nos partenaires. 🎉')
    .setTimestamp();
  await interaction.channel.send({ content: `<@${ticket.applicantId}>`, embeds: [embed] });

  const cfg = await Config.findOne({ guildId: interaction.guild.id });
  if (cfg?.partnerArchiveCategoryId) {
    const cat = interaction.guild.channels.cache.get(cfg.partnerArchiveCategoryId);
    if (cat) await interaction.channel.setParent(cat, { lockPermissions: false }).catch(() => {});
  }
  return interaction.editReply({ content: '✅ Partenariat accepté.' });
}

async function handleRefuserPartner(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await PartnerTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });
  ticket.status = 'refuse';
  await ticket.save();

  const embed = new EmbedBuilder().setColor(COLORS.RED).setTitle('❌ Partenariat refusé')
    .setDescription('Votre demande n\'a pas été retenue. Merci de votre intérêt !')
    .setTimestamp();
  await interaction.channel.send({ content: `<@${ticket.applicantId}>`, embeds: [embed] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 15_000);
  return interaction.editReply({ content: '✅ Refusé. Suppression dans 15s.' });
}

async function handleNegocier(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.channel.send({ content: `💬 **${interaction.user.displayName}** souhaite négocier les termes du partenariat.` });
  return interaction.editReply({ content: '✅ Message envoyé.' });
}

module.exports = { handleDemande, handlePartnerModal, handleAccepterPartner, handleRefuserPartner, handleNegocier };
