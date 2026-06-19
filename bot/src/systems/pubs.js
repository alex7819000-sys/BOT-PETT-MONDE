// src/systems/pubs.js — Tickets pub
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const mongoose = require('mongoose');
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');

const pubSchema = new mongoose.Schema({
  guildId: String, channelId: String,
  applicantId: String, serverName: String, serverInvite: String,
  pubText: String,
  status: { type: String, default: 'open' },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });
const PubTicket = mongoose.models.PubTicket || mongoose.model('PubTicket', pubSchema);

// Bouton "Faire une demande de pub"
async function handlePubDemande(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('pub_form')
    .setTitle('Demande de publicité')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('server_name').setLabel('Nom de votre serveur').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('server_invite').setLabel('Lien d\'invitation').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('pub_text').setLabel('Texte de publicité').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
    );
  return interaction.showModal(modal);
}

// Soumission du modal pub (appelé depuis modals.js)
async function handlePubModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const cfg = await Config.findOne({ guildId: gid });

  const existing = await PubTicket.findOne({ guildId: gid, applicantId: uid, status: 'open' });
  if (existing) {
    const ch = interaction.guild.channels.cache.get(existing.channelId);
    return interaction.editReply({ content: `✅ Ticket déjà ouvert : ${ch ? `<#${ch.id}>` : '(supprimé)'}` });
  }

  const serverName   = interaction.fields.getTextInputValue('server_name');
  const serverInvite = interaction.fields.getTextInputValue('server_invite');
  const pubText      = interaction.fields.getTextInputValue('pub_text');

  const channel = await interaction.guild.channels.create({
    name: `pub-${serverName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32),
    type: ChannelType.GuildText,
    parent: cfg?.pubTicketCategoryId || null,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: uid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });

  await PubTicket.create({ guildId: gid, channelId: channel.id, applicantId: uid, serverName, serverInvite, pubText, status: 'open' });

  const embed = new EmbedBuilder()
    .setColor(COLORS.ORANGE)
    .setTitle('📣 Demande de publicité')
    .addFields(
      { name: 'Serveur', value: serverName, inline: true },
      { name: 'Invitation', value: serverInvite },
      { name: 'Texte pub', value: pubText.slice(0, 1024) },
    )
    .setFooter({ text: `Demande de ${interaction.user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pub:valider:${channel.id}`).setLabel('✅ Valider').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pub:refuser:${channel.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@${uid}>`, embeds: [embed], components: [row] });
  return interaction.editReply({ content: `✅ Ticket créé : <#${channel.id}>` });
}

async function handlePubValider(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await PubTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });
  ticket.status = 'validé';
  await ticket.save();

  const cfg = await Config.findOne({ guildId: interaction.guild.id });

  // Poste dans le salon pub si configuré
  if (cfg?.pubPostChannelId) {
    const pubCh = interaction.guild.channels.cache.get(cfg.pubPostChannelId);
    if (pubCh) {
      await pubCh.send([
        `📣 **${ticket.serverName}**`,
        ticket.pubText,
        `🔗 ${ticket.serverInvite}`,
      ].join('\n')).catch(() => {});
    }
  }

  const embed = new EmbedBuilder().setColor(COLORS.GREEN).setTitle('✅ Publicité validée !')
    .setDescription('Votre pub a été publiée !').setTimestamp();
  await interaction.channel.send({ content: `<@${ticket.applicantId}>`, embeds: [embed] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 10_000);
  return interaction.editReply({ content: '✅ Pub validée et publiée.' });
}

async function handlePubRefuser(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await PubTicket.findOne({ guildId: interaction.guild.id, channelId: interaction.channel.id });
  if (!ticket) return interaction.editReply({ content: '❌ Ticket introuvable.' });
  ticket.status = 'refuse';
  await ticket.save();

  const embed = new EmbedBuilder().setColor(COLORS.RED).setTitle('❌ Publicité refusée')
    .setDescription('Votre demande a été refusée. Vérifiez que votre contenu respecte les règles.').setTimestamp();
  await interaction.channel.send({ content: `<@${ticket.applicantId}>`, embeds: [embed] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 15_000);
  return interaction.editReply({ content: '✅ Refusé. Suppression dans 15s.' });
}

async function toggleAllPubs(guildId) {
  const cfg = await Config.findOne({ guildId });
  // Pas de champ pub global — on retourne juste true pour indiquer "activé"
  return true;
}

module.exports = { handlePubDemande, handlePubModal, handlePubValider, handlePubRefuser, toggleAllPubs };
