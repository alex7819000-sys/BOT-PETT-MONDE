// src/systems/pubs/index.js — Système de pubs planifiées
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Pub    = require('../../db/models/Pub');
const logger = require('../../utils/logger');
const { COLORS } = require('../../config/constants');
const { requireAdmin, safeReply } = require('../../utils/permissions');
const { randomUUID } = require('crypto');

// ── Création ──────────────────────────────────────────────────────────────

async function openPubModal(interaction) {
  const modal = new ModalBuilder().setCustomId('pub:create').setTitle('📢 Créer une pub');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Texte du message').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('link').setLabel('Lien (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imageUrl').setLabel('URL image/bannière (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('schedule').setLabel('Toutes les X minutes (ex: 60) ou heure fixe (ex: h20)').setStyle(TextInputStyle.Short).setPlaceholder('60 ou h20').setRequired(true)),
  );
  await interaction.showModal(modal);
}

async function handlePubCreate(interaction) {
  const gid      = interaction.guild.id;
  const title    = interaction.fields.getTextInputValue('title');
  const text     = interaction.fields.getTextInputValue('text');
  const link     = interaction.fields.getTextInputValue('link') || null;
  const imageUrl = interaction.fields.getTextInputValue('imageUrl') || null;
  const schedule = interaction.fields.getTextInputValue('schedule').trim();

  let scheduleType = 'interval', intervalMinutes = 60, dailyHour = 20;
  if (schedule.toLowerCase().startsWith('h')) {
    scheduleType  = 'daily';
    dailyHour     = parseInt(schedule.slice(1)) || 20;
  } else {
    intervalMinutes = parseInt(schedule) || 60;
  }

  // Choisir les salons
  const channels = await interaction.guild.channels.fetch();
  const textChannels = channels.filter(c => c.type === 0).first(20);

  const pub = await Pub.create({
    guildId: gid,
    pubId: randomUUID().slice(0, 8),
    title, text, link, imageUrl,
    channels: ['ALL'],
    scheduleType, intervalMinutes, dailyHour,
  });

  await interaction.reply({
    content: `✅ Pub **"${title}"** créée ! Elle sera envoyée ${scheduleType === 'daily' ? `chaque jour à ${dailyHour}h` : `toutes les ${intervalMinutes} min`}.\n\nUtilise \`/pub salons\` pour choisir les salons cibles.`,
    ephemeral: true,
  });
}

// ── Liste & gestion ───────────────────────────────────────────────────────

async function listPubs(interaction) {
  const gid  = interaction.guild.id;
  const pubs = await Pub.find({ guildId: gid });

  if (!pubs.length) return safeReply(interaction, { content: '❌ Aucune pub créée. Utilise `/pub créer`.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(COLORS.ORANGE)
    .setTitle('📢 Pubs planifiées')
    .setDescription(
      pubs.map(p => {
        const schedule = p.scheduleType === 'daily' ? `chaque jour à ${p.dailyHour}h` : `toutes les ${p.intervalMinutes} min`;
        const status   = p.active ? '🟢' : '🔴';
        const channelInfo = p.channels.includes('ALL') ? 'Tous les salons' : p.channels.map(c => `<#${c}>`).join(', ');
        return `${status} **${p.title}** (\`${p.pubId}\`) — ${schedule} — ${channelInfo}`;
      }).join('\n')
    )
    .setTimestamp();

  const activeAll  = pubs.every(p => p.active);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pub:toggle_all').setLabel(activeAll ? '⏸️ Tout désactiver' : '▶️ Tout activer').setStyle(activeAll ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  await safeReply(interaction, { embeds: [embed], components: [row] });
}

async function togglePub(guildId, pubId) {
  const pub = await Pub.findOne({ guildId, pubId });
  if (!pub) return false;
  pub.active = !pub.active;
  await pub.save();
  return pub.active;
}

async function toggleAllPubs(guildId) {
  const pubs = await Pub.find({ guildId });
  const activeCount = pubs.filter(p => p.active).length;
  const newState = activeCount < pubs.length; // active si pas tous actifs
  await Pub.updateMany({ guildId }, { active: newState });
  return newState;
}

async function deletePub(guildId, pubId) {
  return Pub.deleteOne({ guildId, pubId });
}

// ── Envoi ─────────────────────────────────────────────────────────────────

async function sendPub(client, guildId, pub) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || !pub.active) return;

  const channelIds = pub.channels.includes('ALL')
    ? guild.channels.cache.filter(c => c.type === 0 && c.permissionsFor(guild.members.me).has('SendMessages')).map(c => c.id)
    : pub.channels;

  const embed = new EmbedBuilder()
    .setColor(COLORS.ORANGE)
    .setTitle(pub.title)
    .setDescription(pub.text);

  if (pub.link)     embed.setURL(pub.link);
  if (pub.imageUrl) embed.setImage(pub.imageUrl);
  embed.setTimestamp();

  const components = [];
  if (pub.link) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('🔗 Voir le lien').setStyle(ButtonStyle.Link).setURL(pub.link),
    ));
  }

  for (const cid of channelIds) {
    const ch = guild.channels.cache.get(cid);
    if (ch) await ch.send({ embeds: [embed], components }).catch(() => {});
  }

  await Pub.updateOne({ pubId: pub.pubId, guildId }, { lastSent: new Date() });
  logger.info('Pubs', `Pub "${pub.title}" envoyée dans ${channelIds.length} salon(s)`);
}

module.exports = { openPubModal, handlePubCreate, listPubs, togglePub, toggleAllPubs, deletePub, sendPub };
