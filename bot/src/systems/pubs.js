// src/systems/pubs.js — 2 systèmes en un :
//   1) Catalogue de pubs planifiées (admin) : /pub creer|liste|toggle|supprimer
//   2) Tickets de demande de pub (membres) : bouton "pub:demande" → modal → validation staff
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { randomUUID } = require('crypto');
const Pub     = require('../db/models/Pub');
const Config  = require('../db/models/Config');
const logger  = require('../utils/logger');
const { COLORS } = require('../config/constants');
const { safeReply } = require('../utils/permissions');
const { postLog } = require('./warn');

// ════════════════════════════════════════════════════════════════════════
// 1) CATALOGUE DE PUBS PLANIFIÉES (admin)
// ════════════════════════════════════════════════════════════════════════

async function openPubModal(interaction) {
  const modal = new ModalBuilder().setCustomId('pub:create').setTitle('📢 Créer une pub planifiée');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('link').setLabel('Lien (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imageUrl').setLabel('URL image/bannière (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('schedule').setLabel('Toutes les X min (ex: 60) ou heure fixe (ex: h20)').setStyle(TextInputStyle.Short).setPlaceholder('60 ou h20').setRequired(true)),
  );
  await interaction.showModal(modal);
}

// Soumission du modal de création (customId 'pub:create')
async function handlePubModal(interaction) {
  const gid   = interaction.guild.id;
  const title = interaction.fields.getTextInputValue('title');
  const desc  = interaction.fields.getTextInputValue('description');
  const link  = interaction.fields.getTextInputValue('link') || null;
  const img   = interaction.fields.getTextInputValue('imageUrl') || null;
  const sched = interaction.fields.getTextInputValue('schedule').trim();

  let scheduleType = 'interval', intervalMinutes = 60, dailyHour = 20;
  if (sched.toLowerCase().startsWith('h')) {
    scheduleType = 'daily';
    dailyHour = parseInt(sched.slice(1), 10) || 20;
  } else {
    intervalMinutes = parseInt(sched, 10) || 60;
  }

  const pub = await Pub.create({
    guildId: gid, pubId: randomUUID().slice(0, 8),
    title, text: desc, link, imageUrl: img,
    channels: ['ALL'], scheduleType, intervalMinutes, dailyHour,
  });

  return interaction.reply({
    content: `✅ Pub **"${title}"** créée !\n${scheduleType === 'daily' ? `Chaque jour à ${dailyHour}h` : `Toutes les ${intervalMinutes} min`}\nID : \`${pub.pubId}\``,
    ephemeral: true,
  });
}

async function listPubs(interaction) {
  const pubs = await Pub.find({ guildId: interaction.guild.id });
  if (!pubs.length) return safeReply(interaction, { content: '❌ Aucune pub planifiée. Crée-en une avec `/pub creer`.', ephemeral: true });

  const lines = pubs.map(p => {
    const s = p.scheduleType === 'daily' ? `à ${p.dailyHour}h` : `/${p.intervalMinutes}min`;
    return `${p.active ? '🟢' : '🔴'} **${p.title}** (\`${p.pubId}\`) — ${s}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.ORANGE)
    .setTitle('📢 Pubs planifiées')
    .setDescription(lines.join('\n'))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pub:toggle_all')
      .setLabel(pubs.every(p => p.active) ? '⏸️ Tout désactiver' : '▶️ Tout activer')
      .setStyle(pubs.every(p => p.active) ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  return safeReply(interaction, { embeds: [embed], components: [row] });
}

async function togglePub(guildId, pubId) {
  const pub = await Pub.findOne({ guildId, pubId });
  if (!pub) return null;
  pub.active = !pub.active;
  await pub.save();
  return pub.active;
}

async function toggleAllPubs(guildId) {
  const pubs  = await Pub.find({ guildId });
  if (!pubs.length) return false;
  const state = pubs.filter(p => p.active).length < pubs.length;
  await Pub.updateMany({ guildId }, { active: state });
  return state;
}

async function deletePub(guildId, pubId) {
  return Pub.deleteOne({ guildId, pubId });
}

// Appelé par le scheduler (cron) — envoie une pub si son heure/intervalle est dû
async function sendPub(client, guildId, pub) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || !pub.active) return;

  const channelIds = pub.channels.includes('ALL')
    ? guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)).map(c => c.id)
    : pub.channels;

  const embed = new EmbedBuilder().setColor(COLORS.ORANGE).setTitle(pub.title).setDescription(pub.text);
  if (pub.link)     embed.setURL(pub.link);
  if (pub.imageUrl) embed.setImage(pub.imageUrl);
  embed.setTimestamp();

  const components = pub.link
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🔗 Voir le lien').setStyle(ButtonStyle.Link).setURL(pub.link))]
    : [];

  for (const cid of channelIds) {
    const ch = guild.channels.cache.get(cid);
    if (ch) await ch.send({ embeds: [embed], components }).catch(() => {});
  }
  await Pub.updateOne({ pubId: pub.pubId, guildId }, { lastSent: new Date() });
  logger.info('Pubs', `"${pub.title}" envoyée sur ${guild.name}`);
}

// Vérifie toutes les pubs actives et envoie celles qui sont dues — appelé toutes les 5 min par index.js
async function checkAndSendDuePubs(client) {
  const now = new Date();
  const pubs = await Pub.find({ active: true });
  for (const pub of pubs) {
    let due = false;
    if (pub.scheduleType === 'daily') {
      due = now.getHours() === pub.dailyHour && (!pub.lastSent || (now - pub.lastSent) > 23 * 60 * 60 * 1000);
    } else {
      due = !pub.lastSent || (now - pub.lastSent) >= pub.intervalMinutes * 60 * 1000;
    }
    if (due) await sendPub(client, pub.guildId, pub).catch(err => logger.error('Pubs', 'sendPub error', err));
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2) TICKETS DE DEMANDE DE PUB (membres → validation staff)
// ════════════════════════════════════════════════════════════════════════

// Poste le panel public avec le bouton "Demander une publication"
async function sendPubPanel(channel, guildId) {
  const embed = new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('📢 Demander une publication')
    .setDescription('Tu veux faire connaître ton serveur, ta page ou ton projet ?\n\nClique ci-dessous pour soumettre ta demande au staff.')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pub:demande').setLabel('📢 Faire une demande').setStyle(ButtonStyle.Primary),
  );

  await channel.send({ embeds: [embed], components: [row] });
  logger.info('Pubs', `Panel demande pub envoyé dans #${channel.name}`);
}

async function handlePubDemande(interaction) {
  const guildId = interaction.guild.id;

  const modal = new ModalBuilder()
    .setCustomId(`pub:ticket:${guildId}`)
    .setTitle('📢 Demande de Publication')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('titre').setLabel('Titre de votre publication').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('contenu').setLabel('Contenu / description').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('lien').setLabel('Lien (serveur, réseau, etc.)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('image').setLabel('URL d\'une bannière/image (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)
      ),
    );

  await interaction.showModal(modal);
}

async function handleModalPubTicket(interaction) {
  const guildId = interaction.customId.split(':')[2];
  const config  = await Config.findOne({ guildId });
  const guild   = interaction.guild;

  await interaction.deferReply({ ephemeral: true });

  const titre   = interaction.fields.getTextInputValue('titre');
  const contenu = interaction.fields.getTextInputValue('contenu');
  const lien    = interaction.fields.getTextInputValue('lien')  || null;
  const image   = interaction.fields.getTextInputValue('image') || null;

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: `pub-${interaction.user.username.slice(0, 12).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      type: ChannelType.GuildText,
      parent: config?.pubTicketCategoryId || config?.staffCategoryId || undefined,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ...(config?.staffRoleId ? [{ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ],
      reason: `Demande pub — ${interaction.user.tag}`,
    });
  } catch (err) {
    logger.error('Pubs', 'Erreur création ticket pub', err);
    return interaction.editReply({ content: '❌ Impossible de créer le ticket. Vérifie les permissions du bot.' });
  }

  const ficheEmbed = new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle('📢 Demande de Publication')
    .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
    .addFields(
      { name: '👤 Demandé par', value: `<@${interaction.user.id}> \`${interaction.user.tag}\``, inline: false },
      { name: '📌 Titre',       value: titre,   inline: false },
      { name: '📝 Contenu',     value: contenu, inline: false },
      ...(lien ? [{ name: '🔗 Lien', value: lien, inline: true }] : []),
    )
    .setTimestamp();

  if (image) ficheEmbed.setImage(image);

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pub:valider:${ticketChannel.id}:${interaction.user.id}`).setLabel('✅ Valider & Publier').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pub:refuser:${ticketChannel.id}:${interaction.user.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );

  const staffMention = config?.staffRoleId ? `<@&${config.staffRoleId}>` : '';
  await ticketChannel.send({
    content: `${staffMention} Nouvelle demande de publication de <@${interaction.user.id}> !`,
    embeds: [ficheEmbed],
    components: [actionsRow],
  });

  if (config?.logsChannelId || config?.logChannelId) {
    await postLog(guild, config, new EmbedBuilder()
      .setColor(0xEB459E)
      .setTitle('📢 Nouvelle demande de pub')
      .addFields(
        { name: '👤 Demandeur', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📌 Titre',     value: titre,                        inline: true },
        { name: '📌 Ticket',    value: `<#${ticketChannel.id}>`,    inline: true },
      ).setTimestamp()
    );
  }

  return interaction.editReply({ content: `✅ Demande soumise ! Ticket : <#${ticketChannel.id}>` });
}

async function handlePubValider(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const parts     = interaction.customId.split(':');
  const channelId = parts[2];
  const userId    = parts[3];
  const config    = await Config.findOne({ guildId: interaction.guild.id });

  const ficheEmbed = interaction.message.embeds[0];
  if (!ficheEmbed) return interaction.editReply({ content: '❌ Fiche introuvable.' });

  const pubChannelId = config?.pubPostChannelId || config?.pubChannelId;
  const pubChannel   = pubChannelId ? interaction.guild.channels.cache.get(pubChannelId) : null;

  if (pubChannel) {
    const publishEmbed = new EmbedBuilder()
      .setColor(0xEB459E)
      .setTitle(ficheEmbed.fields?.find(f => f.name === '📌 Titre')?.value || 'Publication')
      .setDescription(ficheEmbed.fields?.find(f => f.name === '📝 Contenu')?.value || '')
      .setFooter({ text: `Publié sur ${interaction.guild.name}` })
      .setTimestamp();

    const lien = ficheEmbed.fields?.find(f => f.name === '🔗 Lien')?.value;
    if (lien) publishEmbed.addFields({ name: '🔗 Lien', value: lien });
    if (ficheEmbed.image) publishEmbed.setImage(ficheEmbed.image.url);

    await pubChannel.send({ embeds: [publishEmbed] }).catch(() => {});
  }

  try {
    const member = await interaction.guild.members.fetch(userId);
    const dm     = await member.createDM();
    await dm.send({ embeds: [new EmbedBuilder()
      .setColor(COLORS.GREEN)
      .setTitle('✅ Publication acceptée !')
      .setDescription(`Ta demande de publication sur **${interaction.guild.name}** a été **validée** et publiée !`)
      .setTimestamp()
    ] });
  } catch (_) {}

  await interaction.message.edit({ components: [] }).catch(() => {});
  await interaction.editReply({ content: `✅ Publication validée${pubChannel ? ` et postée dans <#${pubChannel.id}>` : ''} !` });

  setTimeout(() => {
    interaction.guild.channels.cache.get(channelId)?.delete('Pub validée').catch(() => {});
  }, 10_000);
}

async function handlePubRefuser(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const parts     = interaction.customId.split(':');
  const channelId = parts[2];
  const userId    = parts[3];

  try {
    const member = await interaction.guild.members.fetch(userId);
    const dm     = await member.createDM();
    await dm.send({ embeds: [new EmbedBuilder()
      .setColor(COLORS.RED)
      .setTitle('❌ Publication refusée')
      .setDescription(`Ta demande de publication sur **${interaction.guild.name}** a été **refusée**.\n> Si tu as des questions, ouvre un ticket.`)
      .setTimestamp()
    ] });
  } catch (_) {}

  await interaction.message.edit({ components: [] }).catch(() => {});
  await interaction.editReply({ content: '❌ Publication refusée. DM envoyé au demandeur.' });

  setTimeout(() => {
    interaction.guild.channels.cache.get(channelId)?.delete('Pub refusée').catch(() => {});
  }, 10_000);
}

module.exports = {
  // catalogue
  openPubModal, handlePubModal, listPubs, togglePub, toggleAllPubs, deletePub, sendPub, checkAndSendDuePubs,
  // tickets
  sendPubPanel, handlePubDemande, handleModalPubTicket, handlePubValider, handlePubRefuser,
};
