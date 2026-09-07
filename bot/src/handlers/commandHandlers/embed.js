// src/handlers/commandHandlers/embed.js — /embed (création + édition complète)
'use strict';
const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { requireAdmin, safeReply } = require('../../utils/permissions');

function parseColor(input) {
  if (!input) return null;
  const hex = input.trim().replace('#', '');
  const n = parseInt(hex, 16);
  return Number.isNaN(n) ? null : n;
}

function buildFields(existing = null) {
  return [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('titre').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(existing?.title || '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)
        .setValue(existing?.description || '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('couleur').setLabel('Couleur hex (ex: #FFD700)').setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(existing?.color != null ? `#${existing.color.toString(16).padStart(6, '0')}` : '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('image').setLabel('URL image (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(existing?.image?.url || '')
    ),
  ];
}

// ── /embed creer | modifier ──────────────────────────────────────────────────
async function handle(interaction) {
  if (!requireAdmin(interaction)) return;
  const sub = interaction.options.getSubcommand();

  if (sub === 'creer') {
    const salon = interaction.options.getChannel('salon');
    const modal = new ModalBuilder().setCustomId(`embed:modal:${salon.id}`).setTitle('Créer un Embed');
    modal.addComponents(...buildFields());
    return interaction.showModal(modal);
  }

  if (sub === 'modifier') {
    const salon = interaction.options.getChannel('salon');
    const msgId = interaction.options.getString('message_id');

    let msg;
    try { msg = await salon.messages.fetch(msgId); }
    catch (_) { return safeReply(interaction, { content: '❌ Message introuvable dans ce salon.', ephemeral: true }); }

    if (msg.author.id !== interaction.client.user.id) {
      return safeReply(interaction, { content: '❌ Je ne peux modifier que mes propres messages.', ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId(`embed:edit:${salon.id}:${msgId}`).setTitle('Modifier l\'Embed');
    modal.addComponents(...buildFields(msg.embeds[0]));
    return interaction.showModal(modal);
  }
}

// ── Soumission modal création (customId: embed:modal:<channelId>) ───────────
async function handleEmbedModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channelId = interaction.customId.split(':')[2];
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return interaction.editReply({ content: '❌ Salon introuvable.' });

  const titre = interaction.fields.getTextInputValue('titre') || null;
  const desc  = interaction.fields.getTextInputValue('description');
  const coul  = interaction.fields.getTextInputValue('couleur');
  const image = interaction.fields.getTextInputValue('image') || null;

  const embed = new EmbedBuilder().setDescription(desc).setTimestamp();
  if (titre) embed.setTitle(titre);
  const color = parseColor(coul);
  if (color !== null) embed.setColor(color);
  if (image) embed.setImage(image);

  let sent;
  try {
    sent = await channel.send({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ content: '❌ Impossible de poster dans ce salon (permissions ?).' });
  }

  // Bouton "Modifier" attaché en édition (on a besoin du message ID, connu seulement après envoi)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed:edit_btn:${channel.id}:${sent.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary),
  );
  await sent.edit({ components: [row] }).catch(() => {});

  return interaction.editReply({ content: `✅ Embed posté dans <#${channel.id}> !` });
}

// ── Soumission modal édition (customId: embed:edit:<channelId>:<messageId>) ──
async function handleEmbedEditModal(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const parts     = interaction.customId.split(':');
  const channelId = parts[2];
  const messageId = parts[3];

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return interaction.editReply({ content: '❌ Salon introuvable.' });

  let msg;
  try { msg = await channel.messages.fetch(messageId); }
  catch (_) { return interaction.editReply({ content: '❌ Message introuvable.' }); }

  const titre = interaction.fields.getTextInputValue('titre') || null;
  const desc  = interaction.fields.getTextInputValue('description');
  const coul  = interaction.fields.getTextInputValue('couleur');
  const image = interaction.fields.getTextInputValue('image') || null;

  const embed = new EmbedBuilder().setDescription(desc).setTimestamp();
  if (titre) embed.setTitle(titre);
  const color = parseColor(coul);
  if (color !== null) embed.setColor(color);
  if (image) embed.setImage(image);

  await msg.edit({ embeds: [embed] }).catch(() => {});
  return interaction.editReply({ content: '✅ Embed modifié !' });
}

// ── Bouton "✏️ Modifier" sous un embed posté ──────────────────────────────────
async function handleEmbedButton(interaction) {
  const parts  = interaction.customId.split(':'); // embed:edit_btn:channelId:messageId
  const action = parts[1];
  if (action !== 'edit_btn') return;

  const channelId = parts[2];
  const messageId = parts[3];
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });

  let msg;
  try { msg = await channel.messages.fetch(messageId); }
  catch (_) { return interaction.reply({ content: '❌ Message introuvable.', ephemeral: true }); }

  if (msg.author.id !== interaction.client.user.id) {
    return interaction.reply({ content: '❌ Je ne peux modifier que mes propres messages.', ephemeral: true });
  }

  const modal = new ModalBuilder().setCustomId(`embed:edit:${channelId}:${messageId}`).setTitle('Modifier l\'Embed');
  modal.addComponents(...buildFields(msg.embeds[0]));
  return interaction.showModal(modal);
}

module.exports = { handle, handleEmbedModal, handleEmbedEditModal, handleEmbedButton };
