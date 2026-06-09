// src/handlers/commandHandlers/embed.js
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { safeReply } = require('../../utils/permissions');

// Stockage temporaire des embeds en cours de création (en mémoire)
const drafts = new Map();

module.exports = async function handleEmbed(interaction) {
  const sub = interaction.options?.getSubcommand?.();

  // ── /embed creer ──────────────────────────────────────────────────────────
  if (sub === 'creer') {
    const salon = interaction.options.getChannel('salon');

    const modal = new ModalBuilder()
      .setCustomId(`embed:modal:${salon.id}:${interaction.user.id}`)
      .setTitle('✏️ Créer un embed')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('titre')
            .setLabel('Titre (optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(256)
            .setPlaceholder('Ex: 📋 Règlement du serveur')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description (texte principal)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setPlaceholder('Le contenu de ton embed...')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('couleur')
            .setLabel('Couleur hex (optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(7)
            .setPlaceholder('Ex: #5865F2 — défaut: bleu Discord')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('image')
            .setLabel('URL image/bannière (optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://...')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('thumbnail')
            .setLabel('URL miniature (coin haut droit, optionnel)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('https://...')
        ),
      );

    await interaction.showModal(modal);
  }

  // ── /embed modifier ───────────────────────────────────────────────────────
  if (sub === 'modifier') {
    const salon    = interaction.options.getChannel('salon');
    const msgId    = interaction.options.getString('message_id');

    const modal = new ModalBuilder()
      .setCustomId(`embed:edit:${salon.id}:${msgId}:${interaction.user.id}`)
      .setTitle('✏️ Modifier un embed')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('titre')
            .setLabel('Nouveau titre (laisser vide = inchangé)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(256)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Nouvelle description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(4000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('couleur')
            .setLabel('Nouvelle couleur hex')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(7)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('image')
            .setLabel('Nouvelle URL image/bannière')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
      );

    await interaction.showModal(modal);
  }
};

// ── Handler modal création ────────────────────────────────────────────────────
async function handleEmbedModal(interaction) {
  const parts   = interaction.customId.split(':');
  const salonId = parts[2];
  const userId  = parts[3];

  await interaction.deferReply({ ephemeral: true });

  const titre      = interaction.fields.getTextInputValue('titre')     || null;
  const description= interaction.fields.getTextInputValue('description');
  const couleurRaw = interaction.fields.getTextInputValue('couleur')   || '#5865F2';
  const image      = interaction.fields.getTextInputValue('image')     || null;
  const thumbnail  = interaction.fields.getTextInputValue('thumbnail') || null;

  // Parser la couleur hex
  let color = 0x5865F2;
  try {
    const hex = couleurRaw.replace('#', '');
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) color = parseInt(hex, 16);
  } catch (_) {}

  const embed = new EmbedBuilder().setColor(color).setDescription(description);
  if (titre)     embed.setTitle(titre);
  if (image)     embed.setImage(image);
  if (thumbnail) embed.setThumbnail(thumbnail);

  // Aperçu avec boutons confirmer/annuler
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`embed:confirm:${salonId}:${userId}`)
      .setLabel('✅ Poster')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`embed:cancel:${userId}`)
      .setLabel('❌ Annuler')
      .setStyle(ButtonStyle.Danger),
  );

  // Stocker le draft
  drafts.set(`${userId}:${salonId}`, { embed: embed.toJSON(), salonId });

  await interaction.editReply({
    content: `**👁️ Aperçu de ton embed :**\nSalon cible : <#${salonId}>`,
    embeds: [embed],
    components: [row],
  });
}

// ── Handler modal modification ────────────────────────────────────────────────
async function handleEmbedEditModal(interaction) {
  const parts   = interaction.customId.split(':');
  const salonId = parts[2];
  const msgId   = parts[3];

  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.guild.channels.cache.get(salonId);
    if (!channel) return interaction.editReply({ content: '❌ Salon introuvable.' });

    const msg = await channel.messages.fetch(msgId);
    if (!msg) return interaction.editReply({ content: '❌ Message introuvable. Vérifie l\'ID.' });
    if (msg.author.id !== interaction.client.user.id) {
      return interaction.editReply({ content: '❌ Ce message n\'a pas été posté par le bot.' });
    }

    const oldEmbed  = msg.embeds[0];
    const newEmbed  = new EmbedBuilder();

    const titre      = interaction.fields.getTextInputValue('titre');
    const description= interaction.fields.getTextInputValue('description');
    const couleurRaw = interaction.fields.getTextInputValue('couleur');
    const image      = interaction.fields.getTextInputValue('image');

    // Garder les anciennes valeurs si champ vide
    if (titre || oldEmbed?.title)           newEmbed.setTitle(titre || oldEmbed?.title);
    if (description || oldEmbed?.description) newEmbed.setDescription(description || oldEmbed?.description || '');
    if (oldEmbed?.thumbnail)                newEmbed.setThumbnail(oldEmbed.thumbnail.url);

    let color = oldEmbed?.color || 0x5865F2;
    if (couleurRaw) {
      try {
        const hex = couleurRaw.replace('#', '');
        if (/^[0-9A-Fa-f]{6}$/.test(hex)) color = parseInt(hex, 16);
      } catch (_) {}
    }
    newEmbed.setColor(color);

    const finalImage = image || oldEmbed?.image?.url || null;
    if (finalImage) newEmbed.setImage(finalImage);

    await msg.edit({ embeds: [newEmbed] });
    return interaction.editReply({ content: `✅ Embed modifié dans <#${salonId}> !`, embeds: [newEmbed] });

  } catch (err) {
    return interaction.editReply({ content: `❌ Erreur : ${err.message}` });
  }
}

// ── Handler bouton confirmer/annuler ─────────────────────────────────────────
async function handleEmbedButton(interaction) {
  const parts  = interaction.customId.split(':');
  const action = parts[1];
  const userId = parts[3] || parts[2];

  if (action === 'cancel') {
    drafts.delete(`${userId}:${parts[2]}`);
    return interaction.update({ content: '❌ Annulé.', embeds: [], components: [] });
  }

  if (action === 'confirm') {
    const salonId = parts[2];
    const draft   = drafts.get(`${userId}:${salonId}`);
    if (!draft) return interaction.update({ content: '❌ Draft expiré. Recommence avec `/embed creer`.', embeds: [], components: [] });

    try {
      const channel = interaction.guild.channels.cache.get(salonId);
      if (!channel) return interaction.update({ content: '❌ Salon introuvable.', embeds: [], components: [] });

      await channel.send({ embeds: [draft.embed] });
      drafts.delete(`${userId}:${salonId}`);

      return interaction.update({
        content: `✅ Embed posté dans <#${salonId}> !`,
        embeds: [],
        components: [],
      });
    } catch (err) {
      return interaction.update({ content: `❌ Erreur : ${err.message}`, embeds: [], components: [] });
    }
  }
}

module.exports.handleEmbedModal     = handleEmbedModal;
module.exports.handleEmbedEditModal = handleEmbedEditModal;
module.exports.handleEmbedButton    = handleEmbedButton;
