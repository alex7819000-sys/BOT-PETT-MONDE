// src/systems/pubs/index.js — Pubs simplifiées : titre + lien + image + description
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
        ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Pub    = require('../../db/models/Pub');
const logger = require('../../utils/logger');
const { COLORS } = require('../../config/constants');
const { safeReply } = require('../../utils/permissions');
const { randomUUID } = require('crypto');

async function openPubModal(interaction) {
  const modal = new ModalBuilder().setCustomId('pub:create').setTitle('📢 Créer une pub');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('link').setLabel('Lien (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imageUrl').setLabel('URL image/bannière (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('schedule').setLabel('Toutes les X minutes (ex: 60) ou heure fixe (ex: h20)').setStyle(TextInputStyle.Short).setPlaceholder('60 ou h20').setRequired(true)),
  );
  await interaction.showModal(modal);
}

async function handlePubCreate(interaction) {
  const gid   = interaction.guild.id;
  const title = interaction.fields.getTextInputValue('title');
  const desc  = interaction.fields.getTextInputValue('description');
  const link  = interaction.fields.getTextInputValue('link') || null;
  const img   = interaction.fields.getTextInputValue('imageUrl') || null;
  const sched = interaction.fields.getTextInputValue('schedule').trim();

  let scheduleType = 'interval', intervalMinutes = 60, dailyHour = 20;
  if (sched.toLowerCase().startsWith('h')) {
    scheduleType = 'daily'; dailyHour = parseInt(sched.slice(1)) || 20;
  } else {
    intervalMinutes = parseInt(sched) || 60;
  }

  const pub = await Pub.create({
    guildId: gid, pubId: randomUUID().slice(0, 8),
    title, text: desc, link, imageUrl: img,
    channels: ['ALL'], scheduleType, intervalMinutes, dailyHour,
  });

  await interaction.reply({
    content: `✅ Pub **"${title}"** créée !\n${scheduleType === 'daily' ? `Chaque jour à ${dailyHour}h` : `Toutes les ${intervalMinutes} min`}\nID : \`${pub.pubId}\``,
    ephemeral: true,
  });
}

async function listPubs(interaction) {
  const pubs = await Pub.find({ guildId: interaction.guild.id });
  if (!pubs.length) return safeReply(interaction, { content: '❌ Aucune pub.', ephemeral: true });

  const lines = pubs.map(p => {
    const s = p.scheduleType === 'daily' ? `à ${p.dailyHour}h` : `/${p.intervalMinutes}min`;
    return `${p.active ? '🟢' : '🔴'} **${p.title}** (\`${p.pubId}\`) — ${s}`;
  });

  const embed = new EmbedBuilder().setColor(COLORS.ORANGE).setTitle('📢 Pubs planifiées')
    .setDescription(lines.join('\n')).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pub:toggle_all')
      .setLabel(pubs.every(p => p.active) ? '⏸️ Tout désactiver' : '▶️ Tout activer')
      .setStyle(pubs.every(p => p.active) ? ButtonStyle.Danger : ButtonStyle.Success),
  );
  await safeReply(interaction, { embeds: [embed], components: [row] });
}

async function togglePub(guildId, pubId) {
  const pub = await Pub.findOne({ guildId, pubId });
  if (!pub) return null;
  pub.active = !pub.active;
  await pub.save();
  return pub.active;
}

async function toggleAllPubs(guildId) {
  const pubs = await Pub.find({ guildId });
  const state = pubs.filter(p => p.active).length < pubs.length;
  await Pub.updateMany({ guildId }, { active: state });
  return state;
}

async function deletePub(guildId, pubId) { return Pub.deleteOne({ guildId, pubId }); }

async function sendPub(client, guildId, pub) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || !pub.active) return;

  const channelIds = pub.channels.includes('ALL')
    ? guild.channels.cache.filter(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages')).map(c => c.id)
    : pub.channels;

  const embed = new EmbedBuilder().setColor(COLORS.ORANGE).setTitle(pub.title).setDescription(pub.text);
  if (pub.link)     embed.setURL(pub.link);
  if (pub.imageUrl) embed.setImage(pub.imageUrl);
  embed.setTimestamp();

  const components = pub.link ? [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('🔗 Voir le lien').setStyle(ButtonStyle.Link).setURL(pub.link),
  )] : [];

  for (const cid of channelIds) {
    const ch = guild.channels.cache.get(cid);
    if (ch) await ch.send({ embeds: [embed], components }).catch(() => {});
  }
  await Pub.updateOne({ pubId: pub.pubId, guildId }, { lastSent: new Date() });
  logger.info('Pubs', `"${pub.title}" envoyée`);
}

module.exports = { openPubModal, handlePubCreate, listPubs, togglePub, toggleAllPubs, deletePub, sendPub };
