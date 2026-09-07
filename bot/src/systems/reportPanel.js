// src/systems/reportPanel.js — Panneau public "Faire un signalement" : n'importe quel
// membre peut signaler quelqu'un, expliquer le problème, proposer une sanction et
// fournir une preuve. Ça part ensuite dans le salon staff pour validation (sanctions.js).
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  UserSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const Config          = require('../db/models/Config');
const SanctionRequest = require('../db/models/SanctionRequest');
const sanctions       = require('./sanctions');
const logger          = require('../utils/logger');

const PROOF_WAIT_MS = 120_000; // 2 minutes pour envoyer une capture d'écran

async function getConfig(guildId) {
  return Config.findOne({ guildId }).lean().catch(() => null);
}

// ── Poster (ou rafraîchir) le panneau public dans le salon configuré ──────
async function postOrRefreshPanel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor(0xFF5252)
    .setTitle('🚨 Faire un signalement')
    .setDescription(
      'Tu as vu un membre enfreindre le règlement ? Clique sur le bouton ci-dessous.\n\n' +
      '**Tu devras :**\n' +
      '1️⃣ Choisir le membre concerné\n' +
      '2️⃣ Expliquer le problème\n' +
      '3️⃣ Proposer une sanction (avertissement, mute, ban vocal/tchat temporaire, kick, ban)\n' +
      '4️⃣ Donner une preuve (capture d\'écran ou lien)\n\n' +
      'Le staff examine ensuite ta demande et valide (ou choisit une autre sanction).'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sigrep:start').setLabel('🚨 Faire un signalement').setStyle(ButtonStyle.Danger)
  );

  const config = await getConfig(guild.id);
  if (config?.reportPanelMessageId) {
    const existing = await channel.messages.fetch(config.reportPanelMessageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] }).catch(() => {});
      return existing;
    }
  }

  const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (msg) await Config.updateOne({ guildId: guild.id }, { reportPanelMessageId: msg.id });
  return msg;
}

// ── Étape 1 : clic sur "Faire un signalement" → choisir le membre ─────────
async function handleStartButton(interaction) {
  const menu = new UserSelectMenuBuilder()
    .setCustomId('sigrep:selectuser')
    .setPlaceholder('Quel membre veux-tu signaler ?');

  return interaction.reply({
    content: 'Sélectionne le membre concerné :',
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

// ── Étape 2 : membre choisi → formulaire (raison + preuve texte) ──────────
async function handleUserSelected(interaction) {
  const targetId = interaction.values?.[0];
  if (!targetId) return interaction.update({ content: '❌ Aucun membre sélectionné.', components: [] });

  if (targetId === interaction.user.id) {
    return interaction.update({ content: '❌ Tu ne peux pas te signaler toi-même.', components: [] });
  }
  const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (targetMember?.user?.bot) {
    return interaction.update({ content: '❌ Impossible de signaler un bot.', components: [] });
  }

  const modal = new ModalBuilder()
    .setCustomId(`sigrep:modal:${targetId}`)
    .setTitle('Détails du signalement')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('raison').setLabel('Explique le problème')
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('preuve_lien').setLabel('Preuve (lien, si tu en as un — optionnel)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300)
      ),
    );

  return interaction.showModal(modal);
}

// ── Étape 3 : formulaire soumis → choisir la sanction demandée ────────────
async function handleModalSubmit(interaction, targetId) {
  await interaction.deferReply({ ephemeral: true });

  const reason = interaction.fields.getTextInputValue('raison');
  const proofText = interaction.fields.getTextInputValue('preuve_lien') || null;

  const request = await SanctionRequest.create({
    guildId: interaction.guild.id, targetId, reporterId: interaction.user.id,
    reason, proofText, status: 'draft',
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`sigrep:tier:${request._id}`)
    .setPlaceholder('Quelle sanction proposes-tu ?')
    .addOptions(sanctions.TIERS.map(t => ({ label: sanctions.TIER_LABEL[t], value: t })));

  return interaction.editReply({
    content: 'Quelle sanction proposes-tu pour ce membre ?',
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

// ── Étape 4 : sanction choisie → durée si besoin, sinon direct preuve image ─
async function handleTierSelected(interaction, requestId) {
  const chosen = interaction.values?.[0];
  if (!sanctions.TIERS.includes(chosen)) {
    return interaction.update({ content: '❌ Sanction invalide.', components: [] });
  }

  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'draft') {
    return interaction.update({ content: '❌ Cette demande n\'est plus valide (recommence).', components: [] });
  }
  request.requestedTier = chosen;
  await request.save();

  if (sanctions.DURATION_TIERS.includes(chosen)) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`sigrep:duration:${requestId}`)
      .setPlaceholder('Pendant combien de temps ?')
      .addOptions(sanctions.DURATIONS.map(d => ({ label: d.label, value: d.value })));
    return interaction.update({
      content: `⏳ Pendant combien de temps : **${sanctions.TIER_LABEL[chosen]}** ?`,
      components: [new ActionRowBuilder().addComponents(menu)],
    });
  }

  return askForProofImage(interaction, requestId);
}

// ── Étape 4bis : durée choisie ──────────────────────────────────────────────
async function handleDurationSelected(interaction, requestId) {
  const durationMs = parseInt(interaction.values?.[0], 10);
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'draft') {
    return interaction.update({ content: '❌ Cette demande n\'est plus valide (recommence).', components: [] });
  }
  request.penaltyDurationMs = durationMs;
  await request.save();

  return askForProofImage(interaction, requestId);
}

// ── Étape 5 : proposer d'envoyer une capture d'écran, puis finaliser ──────
async function askForProofImage(interaction, requestId) {
  await interaction.update({
    content: '📸 Si tu as une **capture d\'écran** en preuve, envoie-la ici (dans ce salon) dans les 2 prochaines minutes.\n' +
      'Sinon, ignore ce message — ton signalement partira sans image, juste avec ton explication.',
    components: [],
  }).catch(() => {});

  const channel = interaction.channel;
  const collector = channel.createMessageCollector({
    filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0,
    time: PROOF_WAIT_MS, max: 1,
  });

  let finalized = false;
  collector.on('collect', async (msg) => {
    finalized = true;
    const url = msg.attachments.first()?.url || null;
    await SanctionRequest.updateOne({ _id: requestId }, { proofImageUrl: url });
    await msg.delete().catch(() => {}); // on nettoie le salon, l'image part directement dans la demande staff
    await finalizeRequest(interaction.guild, requestId, interaction.user);
  });

  collector.on('end', async () => {
    if (!finalized) await finalizeRequest(interaction.guild, requestId, interaction.user);
  });
}

// ── Poste la demande finalisée dans le salon staff ─────────────────────────
async function finalizeRequest(guild, requestId, reporterUser) {
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'draft') return;

  const config = await getConfig(guild.id);
  if (!config?.sanctionChannelId) {
    await reporterUser.send('❌ Ton signalement n\'a pas pu être envoyé : aucun salon de validation n\'est configuré sur le serveur. Préviens un admin.').catch(() => {});
    return;
  }
  const staffChannel = guild.channels.cache.get(config.sanctionChannelId);
  if (!staffChannel) return;

  request.status = 'pending';
  await request.save();

  const embed = await sanctions.buildRequestEmbed(request, config);
  const rows = sanctions.buildActionRows(request._id.toString());
  const msg = await staffChannel.send({ embeds: [embed], components: rows }).catch(() => null);
  if (msg) {
    request.messageId = msg.id;
    request.channelId = staffChannel.id;
    await request.save().catch(() => {});
  }

  await reporterUser.send('✅ Ton signalement a été envoyé au staff pour validation. Merci !').catch(() => {});
}

module.exports = {
  postOrRefreshPanel,
  handleStartButton,
  handleUserSelected,
  handleModalSubmit,
  handleTierSelected,
  handleDurationSelected,
};
