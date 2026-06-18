// src/systems/debat/index.js — Créer un débat dans un salon forum
'use strict';
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
        ActionRowBuilder, ChannelType } = require('discord.js');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

async function openDebatModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('debat:submit')
    .setTitle('💬 Créer un débat');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Sujet du débat (obligatoire)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (optionnel)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(2000)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('imageUrl')
        .setLabel('Lien image (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
  );

  await interaction.showModal(modal);
}

async function handleDebatSubmit(interaction) {
  const gid   = interaction.guild.id;
  const title = interaction.fields.getTextInputValue('title');
  const desc  = interaction.fields.getTextInputValue('description') || null;
  const img   = interaction.fields.getTextInputValue('imageUrl') || null;

  const config  = await Config.findOne({ guildId: gid });
  if (!config?.debatChannelId) {
    return interaction.reply({ content: '❌ Salon débat non configuré. Fais `/setup salon → Débat`.', ephemeral: true });
  }

  const channel = interaction.guild.channels.cache.get(config.debatChannelId);
  if (!channel) return interaction.reply({ content: '❌ Salon débat introuvable.', ephemeral: true });

  // Salon forum
  if (channel.type === ChannelType.GuildForum) {
    const content = [
      desc ? `📝 ${desc}` : null,
      img  ? `🖼️ ${img}` : null,
      `\n**Lancé par** : ${interaction.member.displayName}`,
    ].filter(Boolean).join('\n') || `Débat lancé par ${interaction.member.displayName}`;

    const thread = await channel.threads.create({
      name: title,
      message: { content },
      reason: `Débat créé par ${interaction.user.tag}`,
    });

    await interaction.reply({ content: `✅ Débat créé : <#${thread.id}>`, ephemeral: false });
    logger.info('Debat', `Créé : ${title} par ${interaction.user.tag}`);
    return;
  }

  // Salon texte normal → créer thread
  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`💬 Débat — ${title}`)
    .setAuthor({ name: interaction.member.displayName, iconURL: interaction.member.displayAvatarURL() });

  if (desc) embed.setDescription(desc);
  if (img)  embed.setImage(img);
  embed.setTimestamp().setFooter({ text: `Lancé par ${interaction.member.displayName}` });

  const msg    = await channel.send({ embeds: [embed] });
  const thread = await msg.startThread({ name: `💬 ${title}`.slice(0, 100), autoArchiveDuration: 4320 });
  await thread.send(`Donnez votre avis sur : **${title}** 👇`);

  await interaction.reply({ content: `✅ Débat créé dans <#${thread.id}> !`, ephemeral: false });
}

module.exports = { openDebatModal, handleDebatSubmit };
