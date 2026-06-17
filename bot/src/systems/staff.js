// src/systems/staff.js — Tickets de candidature staff
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const mongoose = require('mongoose');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

// Modèle ticket staff
const tSchema = new mongoose.Schema({
  guildId: String, channelId: String,
  applicantId: String, reviewerId: String,
  posteVise: String,
  status: { type: String, default: 'open' }, // open | en_attente | accepte | refuse
}, { timestamps: true });
const StaffTicket = mongoose.models.StaffTicket || mongoose.model('StaffTicket', tSchema);

// ─── Bouton "Candidater" (depuis le message de recrutement) ─────────────────
async function handleCandidater(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const cfg = await Config.findOne({ guildId: gid });

  if (!cfg?.staffCategoryId) {
    return interaction.editReply({ content: '❌ La catégorie staff n\'est pas configurée. Utilisez `/setup salon`.' });
  }

  // Vérifie si un ticket est déjà ouvert
  const existing = await StaffTicket.findOne({ guildId: gid, applicantId: uid, status: { $in: ['open', 'en_attente'] } });
  if (existing) {
    const ch = interaction.guild.channels.cache.get(existing.channelId);
    return interaction.editReply({ content: `✅ Tu as déjà un ticket ouvert : ${ch ? `<#${ch.id}>` : '(salon supprimé)'}` });
  }

  // Crée le salon privé
  const category = interaction.guild.channels.cache.get(cfg.staffCategoryId);
  const channel = await interaction.guild.channels.create({
    name: `candidature-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32),
    type: ChannelType.GuildText,
    parent: category || null,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: uid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(cfg.staffRoleId ? [{ id: cfg.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ],
  });

  await StaffTicket.create({ guildId: gid, channelId: channel.id, applicantId: uid, status: 'open' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle('📋 Candidature Staff')
    .setDescription([
      `Bonjour **${interaction.user.displayName}** ! 👋`,
      '',
      'Bienvenue dans ton ticket de candidature.',
      'Présente-toi et explique pourquoi tu souhaites rejoindre l\'équipe.',
      '',
      '> Poste visé, expériences, disponibilités...',
    ].join('\n'))
    .setFooter({ text: 'Les membres de l\'équipe te répondront bientôt.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`staff:prendre:${channel.id}`).setLabel('📥 Prendre en charge').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`staff:accepter:${channel.id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`staff:refuser:${channel.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`staff:attente:${channel.id}`).setLabel('⏳ Mettre en attente').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ content: `<@${uid}>`, embeds: [embed], components: [row] });
  return interaction.editReply({ content: `✅ Ticket créé : <#${channel.id}>` });
}

// ─── Bouton "Prendre en charge" ─────────────────────────────────────────────
async function handlePrendre(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await StaffTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });

  ticket.reviewerId = interaction.user.id;
  ticket.status = 'open';
  await ticket.save();

  await interaction.channel.send({ content: `👤 **${interaction.user.displayName}** prend en charge cette candidature.` });
  return interaction.editReply({ content: '✅ Ticket pris en charge.' });
}

// ─── Bouton "Accepter" ──────────────────────────────────────────────────────
async function handleAccepter(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const ticket = await StaffTicket.findOne({ guildId: gid, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });

  ticket.status = 'accepte';
  await ticket.save();

  const cfg = await Config.findOne({ guildId: gid });
  const member = await interaction.guild.members.fetch(ticket.applicantId).catch(() => null);

  // Donne le rôle staff si configuré
  if (member && cfg?.staffRoleId) {
    await member.roles.add(cfg.staffRoleId).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle('✅ Candidature acceptée !')
    .setDescription(`Félicitations **${member?.displayName ?? 'candidat'}** ! Tu rejoins l'équipe. 🎉`)
    .setTimestamp();

  await interaction.channel.send({ content: `<@${ticket.applicantId}>`, embeds: [embed] });

  // Archive le salon après 10s
  setTimeout(async () => {
    if (cfg?.staffArchiveCategoryId) {
      const archiveCat = interaction.guild.channels.cache.get(cfg.staffArchiveCategoryId);
      if (archiveCat) await interaction.channel.setParent(archiveCat, { lockPermissions: false }).catch(() => {});
    }
    await interaction.channel.permissionOverwrites.edit(ticket.applicantId, { SendMessages: false }).catch(() => {});
  }, 10_000);

  return interaction.editReply({ content: '✅ Candidature acceptée.' });
}

// ─── Bouton "Refuser" ───────────────────────────────────────────────────────
async function handleRefuser(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await StaffTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });

  ticket.status = 'refuse';
  await ticket.save();

  const member = await interaction.guild.members.fetch(ticket.applicantId).catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle('❌ Candidature refusée')
    .setDescription('Ta candidature n\'a pas été retenue cette fois. N\'hésite pas à recandidater plus tard !')
    .setTimestamp();

  await interaction.channel.send({ content: `<@${ticket.applicantId}>`, embeds: [embed] });

  setTimeout(async () => {
    await interaction.channel.delete().catch(() => {});
  }, 15_000);

  return interaction.editReply({ content: '✅ Candidature refusée. Le ticket sera supprimé dans 15s.' });
}

// ─── Bouton "Mettre en attente" ─────────────────────────────────────────────
async function handleAttente(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await StaffTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });

  ticket.status = 'en_attente';
  await ticket.save();

  await interaction.channel.send({ content: `⏳ **${interaction.user.displayName}** a mis cette candidature en attente.` });
  return interaction.editReply({ content: '✅ Ticket mis en attente.' });
}

module.exports = { handleCandidater, handlePrendre, handleAccepter, handleRefuser, handleAttente, StaffTicket };
