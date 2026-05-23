// src/systems/confession/index.js — Confession anonyme + devinette
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Confession = require('../../db/models/Confession');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS, EMOJIS } = require('../../config/constants');
const { safeReply } = require('../../utils/permissions');

async function openConfessionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('confession:submit')
    .setTitle(`${EMOJIS.SECRET} Envoyer une confession`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('text')
        .setLabel('Ta confession (anonyme)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('suspects')
        .setLabel('Suspects (3-5 pseudos séparés par des virgules)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: Kuzan, Muck, Luna, Jack')
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

async function handleConfessionSubmit(interaction) {
  const text     = interaction.fields.getTextInputValue('text');
  const rawSusp  = interaction.fields.getTextInputValue('suspects');
  const gid      = interaction.guild.id;
  const uid      = interaction.user.id;

  const config  = await Config.findOne({ guildId: gid });
  if (!config?.secretChannelId) {
    return interaction.reply({ content: '❌ Le salon #SECRET n\'est pas configuré. Fais `/setup confession`.', ephemeral: true });
  }

  const channel = interaction.guild.channels.cache.get(config.secretChannelId);
  if (!channel) return interaction.reply({ content: '❌ Salon #SECRET introuvable.', ephemeral: true });

  // Résoudre les suspects par pseudo
  const suspectNames = rawSusp.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (suspectNames.length < 2) {
    return interaction.reply({ content: '❌ Mets au moins 2 suspects séparés par des virgules.', ephemeral: true });
  }

  // Chercher les membres par pseudo
  const members = await interaction.guild.members.fetch();
  const suspects = [];
  const notFound = [];

  for (const name of suspectNames) {
    const found = members.find(m =>
      m.displayName.toLowerCase().includes(name.toLowerCase()) ||
      m.user.username.toLowerCase().includes(name.toLowerCase())
    );
    if (found) suspects.push(found.id);
    else notFound.push(name);
  }

  if (notFound.length) {
    return interaction.reply({ content: `❌ Membres introuvables : ${notFound.join(', ')}. Vérifie les pseudos.`, ephemeral: true });
  }

  // S'assurer que l'auteur est parmi les suspects
  if (!suspects.includes(uid)) suspects.push(uid);
  const shuffled = suspects.sort(() => Math.random() - 0.5);

  const embed = new EmbedBuilder()
    .setColor(COLORS.DARK)
    .setTitle(`${EMOJIS.SECRET} Confession Anonyme`)
    .setDescription(`> *${text}*`)
    .addFields(
      {
        name: `🕵️ L'auteur est l'un de ces ${shuffled.length} membres :`,
        value: shuffled.map(id => `<@${id}>`).join(' · '),
        inline: false,
      },
    )
    .setFooter({ text: 'Qui a écrit ça ? Votez !' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    shuffled.map((id, i) =>
      new ButtonBuilder()
        .setCustomId(`confession:vote:${id}`)
        .setLabel(`${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i]}`)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  const confession = await Confession.create({ guildId: gid, authorId: uid, text, suspects: shuffled, messageId: msg.id, channelId: config.secretChannelId });

  await interaction.reply({ content: `✅ Confession envoyée dans <#${config.secretChannelId}> !`, ephemeral: true });
  logger.info('Confession', `Nouvelle confession de ${uid}`);
}

async function handleVote(interaction, suspectId) {
  await interaction.deferUpdate();
  const gid  = interaction.guild.id;
  const uid  = interaction.user.id;
  const msgId = interaction.message.id;

  const confession = await Confession.findOne({ guildId: gid, messageId: msgId });
  if (!confession) return;

  // Empêcher l'auteur de voter
  if (confession.authorId === uid) {
    return interaction.followUp({ content: '❌ Tu ne peux pas voter sur ta propre confession 😏', ephemeral: true });
  }

  confession.votes.set(uid, suspectId);
  await confession.save();

  // Afficher les votes en cours
  const counts = {};
  for (const [, sid] of confession.votes) counts[sid] = (counts[sid] || 0) + 1;

  const topSuspect = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  await interaction.followUp({ content: `✅ Vote enregistré ! ${confession.votes.size} vote(s) au total. En tête : <@${topSuspect[0]}> (${topSuspect[1]} vote(s))`, ephemeral: true });

  // Après 24h → afficher résultats + proposer révélation à l'auteur
  if (confession.expiresAt < new Date() && !confession.revealed) {
    await revealResults(confession, interaction.guild, interaction.client);
  }
}

async function handleReveal(interaction, confessionId) {
  await interaction.deferUpdate();
  const confession = await Confession.findById(confessionId);
  if (!confession) return;
  if (confession.authorId !== interaction.user.id) {
    return interaction.followUp({ content: '❌ Ce n\'est pas ta confession.', ephemeral: true });
  }

  confession.revealedTo = true;
  await confession.save();

  const channel = interaction.guild.channels.cache.get(confession.channelId);
  if (channel) {
    await channel.send({ content: `🎭 Révélation ! La confession était de <@${confession.authorId}> :\n> *${confession.text}*` });
  }
}

async function revealResults(confession, guild, client) {
  if (confession.revealed) return;
  confession.revealed = true;
  await confession.save();

  const counts = {};
  for (const [, sid] of confession.votes) counts[sid] = (counts[sid] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const channel = guild.channels.cache.get(confession.channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PURPLE)
    .setTitle('🕵️ Résultats du vote confession !')
    .setDescription(`La communauté pense que l'auteur est...`)
    .addFields(
      sorted.map((([id, count], i) => ({
        name: `${['🥇','🥈','🥉'][i] || `#${i+1}`} ${i === 0 ? '← Suspect principal' : ''}`,
        value: `<@${id}> — **${count}** vote(s)`,
        inline: true,
      })))
    )
    .setTimestamp();

  const revealRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confession:reveal:${confession._id}`)
      .setLabel('🎭 Je me révèle !')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('confession:hide')
      .setLabel('🤫 Rester anonyme')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ embeds: [embed], components: [revealRow] });

  // DM l'auteur
  try {
    const author = await guild.members.fetch(confession.authorId);
    await author.send(`🕵️ Les résultats de ta confession ont été publiés ! Tu peux choisir de te révéler dans <#${confession.channelId}>.`);
  } catch (_) {}
}

module.exports = { openConfessionModal, handleConfessionSubmit, handleVote, handleReveal };
