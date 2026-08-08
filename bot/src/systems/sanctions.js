// src/systems/sanctions.js — Signalement avec preuve → file d'attente → validation staff.
// Paliers dans l'ordre : Avertissement → Mute → Kick → Ban.
// Le palier suggéré dépend de l'historique récent du membre (reset après X jours calmes).
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Config           = require('../db/models/Config');
const Warn             = require('../db/models/Warn');
const SanctionRequest  = require('../db/models/SanctionRequest');
const logger           = require('../utils/logger');

const TIERS = ['warn', 'mute', 'kick', 'ban'];
const TIER_LABEL = { warn: '⚠️ Avertissement', mute: '🔇 Mute', kick: '👢 Kick', ban: '🔨 Ban définitif' };
const TIER_COLOR = { warn: 0xFFAA00, mute: 0xFF8C00, kick: 0xFF6600, ban: 0xFF0000 };

const MUTE_DURATIONS = [
  { label: '10 minutes', value: '600000' },
  { label: '1 heure',    value: '3600000' },
  { label: '24 heures',  value: '86400000' },
  { label: '48 heures',  value: '172800000' },
  { label: '7 jours',    value: '604800000' },
];

async function getConfig(guildId) {
  return Config.findOne({ guildId }).lean().catch(() => null);
}

// ── Qui a le droit de valider/refuser ? ────────────────────────────────────
function isValidator(interaction, config) {
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (config?.coOwnerIds?.includes(interaction.user.id)) return true;
  if (config?.sanctionValidatorRoleId && interaction.member.roles.cache.has(config.sanctionValidatorRoleId)) return true;
  return false;
}

// ── Calcule le palier suggéré à partir de l'historique récent du membre ──
async function computeSuggestedTier(guildId, targetId, resetDays) {
  const cutoff = new Date(Date.now() - resetDays * 24 * 60 * 60 * 1000);
  const count = await Warn.countDocuments({
    guildId, userId: targetId, active: true, createdAt: { $gte: cutoff },
  });
  return TIERS[Math.min(count, TIERS.length - 1)];
}

// ── Créer une demande + la poster dans le salon de validation ─────────────
async function createRequest({ guild, target, reporter, reason, proofImageUrl, proofText }) {
  const config = await getConfig(guild.id);
  if (!config?.sanctionChannelId) {
    return { ok: false, reason: 'Aucun salon de validation configuré. Un admin doit faire `/notif sanction salon:#xxx`.' };
  }
  const channel = guild.channels.cache.get(config.sanctionChannelId);
  if (!channel) {
    return { ok: false, reason: 'Le salon de validation configuré est introuvable.' };
  }

  const resetDays = config.sanctionResetDays ?? 60;
  const suggestedTier = await computeSuggestedTier(guild.id, target.id, resetDays);

  const request = await SanctionRequest.create({
    guildId: guild.id, targetId: target.id, reporterId: reporter.id,
    reason, proofImageUrl: proofImageUrl || null, proofText: proofText || null,
    suggestedTier, channelId: channel.id,
  });

  const embed = buildRequestEmbed(request, target, reporter);
  const rows = buildActionRows(request._id.toString());

  const msg = await channel.send({ embeds: [embed], components: rows }).catch(() => null);
  if (msg) {
    request.messageId = msg.id;
    await request.save().catch(() => {});
  }

  return { ok: true, request };
}

function buildRequestEmbed(request, target, reporter, statusOverride) {
  const status = statusOverride || request.status;
  const embed = new EmbedBuilder()
    .setColor(TIER_COLOR[request.suggestedTier])
    .setTitle('🚨 Nouveau signalement')
    .addFields(
      { name: '👤 Membre visé', value: `<@${request.targetId}>`, inline: true },
      { name: '🗣️ Signalé par', value: `<@${request.reporterId}>`, inline: true },
      { name: '📋 Raison', value: request.reason, inline: false },
      { name: '⚖️ Palier suggéré', value: TIER_LABEL[request.suggestedTier], inline: true },
    )
    .setTimestamp();

  if (request.proofText) embed.addFields({ name: '🔗 Preuve (texte/lien)', value: request.proofText.substring(0, 1000), inline: false });
  if (request.proofImageUrl) embed.setImage(request.proofImageUrl);

  if (status === 'approved') {
    embed.setColor(0x57F287);
    embed.addFields({ name: '✅ Validé', value: `Palier appliqué : ${TIER_LABEL[request.chosenTier]} — par <@${request.validatedBy}>`, inline: false });
  } else if (status === 'rejected') {
    embed.setColor(0x99AAB5);
    embed.addFields({ name: '❌ Refusé', value: `Par <@${request.validatedBy}>`, inline: false });
  }

  return embed;
}

function buildActionRows(requestId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sanction:validate:${requestId}`).setLabel('✅ Valider le palier suggéré').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sanction:changetier:${requestId}`).setLabel('✏️ Changer de palier').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sanction:reject:${requestId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );
  return [row1];
}

// ── Bouton "Valider le palier suggéré" ─────────────────────────────────────
async function handleValidateButton(interaction, requestId) {
  const config = await getConfig(interaction.guild.id);
  if (!isValidator(interaction, config)) {
    return interaction.reply({ content: '❌ Tu n\'as pas la permission de valider une sanction.', ephemeral: true });
  }
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.reply({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', ephemeral: true });
  }

  if (request.suggestedTier === 'mute') {
    return promptMuteDuration(interaction, requestId, request.suggestedTier);
  }
  return applyTier(interaction, request, request.suggestedTier, null);
}

// ── Bouton "Changer de palier" → menu déroulant ────────────────────────────
async function handleChangeTierButton(interaction, requestId) {
  const config = await getConfig(interaction.guild.id);
  if (!isValidator(interaction, config)) {
    return interaction.reply({ content: '❌ Tu n\'as pas la permission de valider une sanction.', ephemeral: true });
  }
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.reply({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', ephemeral: true });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`sanction:tier:${requestId}`)
    .setPlaceholder('Choisis le palier à appliquer')
    .addOptions(TIERS.map(t => ({ label: TIER_LABEL[t], value: t })));

  return interaction.reply({
    content: 'Choisis le palier à appliquer à la place :',
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

// ── Sélection d'un palier custom (depuis le menu déroulant) ───────────────
async function handleTierSelect(interaction, requestId) {
  const chosen = interaction.values?.[0];
  if (!TIERS.includes(chosen)) return interaction.update({ content: '❌ Palier invalide.', components: [] });

  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.update({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', components: [] });
  }

  if (chosen === 'mute') {
    return promptMuteDuration(interaction, requestId, chosen, true);
  }
  return applyTier(interaction, request, chosen, null, true);
}

// ── Demande la durée du mute avant application ─────────────────────────────
async function promptMuteDuration(interaction, requestId, tier, isUpdate = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`sanction:duration:${requestId}`)
    .setPlaceholder('Choisis la durée du mute')
    .addOptions(MUTE_DURATIONS.map(d => ({ label: d.label, value: d.value })));

  const payload = {
    content: '⏳ Choisis la durée du mute :',
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  };
  return isUpdate ? interaction.update(payload) : interaction.reply(payload);
}

// ── Sélection de la durée du mute → applique ────────────────────────────────
async function handleDurationSelect(interaction, requestId) {
  const durationMs = parseInt(interaction.values?.[0], 10);
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.update({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', components: [] });
  }
  return applyTier(interaction, request, 'mute', durationMs, true);
}

// ── Bouton "Refuser" ────────────────────────────────────────────────────────
async function handleRejectButton(interaction, requestId) {
  const config = await getConfig(interaction.guild.id);
  if (!isValidator(interaction, config)) {
    return interaction.reply({ content: '❌ Tu n\'as pas la permission de refuser une demande.', ephemeral: true });
  }
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.reply({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', ephemeral: true });
  }

  request.status = 'rejected';
  request.validatedBy = interaction.user.id;
  request.validatedAt = new Date();
  await request.save();

  const target = await interaction.guild.members.fetch(request.targetId).catch(() => null);
  const embed = buildRequestEmbed(request, target || { id: request.targetId }, { id: request.reporterId }, 'rejected');
  await interaction.update({ embeds: [embed], components: [] }).catch(() => {});
}

// ── Applique réellement le palier choisi ────────────────────────────────────
async function applyTier(interaction, request, tier, muteDurationMs, isUpdate = false) {
  const guild = interaction.guild;
  const config = await getConfig(guild.id);
  const target = await guild.members.fetch(request.targetId).catch(() => null);

  if (!target) {
    const payload = { content: '❌ Le membre visé n\'est plus sur le serveur.', components: [] };
    return isUpdate ? interaction.update(payload) : interaction.reply(payload);
  }

  // Compte le n° de sanction pour ce membre (historique)
  const priorCount = await Warn.countDocuments({ guildId: guild.id, userId: target.id, active: true });
  const warnNumber = priorCount + 1;

  const warn = await Warn.create({
    guildId: guild.id, userId: target.id, moderatorId: interaction.user.id,
    reporterId: request.reporterId, reason: request.reason, warnNumber, tier,
    proofImageUrl: request.proofImageUrl, proofText: request.proofText,
    muteDurationMs: tier === 'mute' ? muteDurationMs : null,
  });

  // ── Action réelle sur le membre ──────────────────────────────────────────
  const dmEmbed = new EmbedBuilder()
    .setColor(TIER_COLOR[tier])
    .setTitle(`${TIER_LABEL[tier]} sur ${guild.name}`)
    .setDescription(`**Raison :** ${request.reason}`)
    .setTimestamp();

  try {
    if (tier === 'warn') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
    } else if (tier === 'mute') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.timeout(muteDurationMs, request.reason).catch(() => {});
    } else if (tier === 'kick') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.kick(request.reason).catch(() => {});
    } else if (tier === 'ban') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.ban({ reason: request.reason, deleteMessageSeconds: 0 }).catch(() => {});
    }
  } catch (err) {
    logger.error('Sanctions', `Erreur application palier ${tier}`, err);
  }

  // ── Log dans #logs ──────────────────────────────────────────────────────
  const logChannelId = config?.logChannelId || config?.logsChannelId;
  if (logChannelId) {
    const logCh = guild.channels.cache.get(logChannelId);
    if (logCh) {
      const logEmbed = new EmbedBuilder()
        .setColor(TIER_COLOR[tier])
        .setTitle(`${TIER_LABEL[tier]} appliqué`)
        .addFields(
          { name: '👤 Membre', value: `<@${target.id}>`, inline: true },
          { name: '🛡️ Validé par', value: `<@${interaction.user.id}>`, inline: true },
          { name: '🗣️ Signalé par', value: `<@${request.reporterId}>`, inline: true },
          { name: '📋 Raison', value: request.reason, inline: false },
          { name: '🔢 Sanction n°', value: `${warnNumber}`, inline: true },
          tier === 'mute' ? { name: '⏳ Durée', value: MUTE_DURATIONS.find(d => d.value == muteDurationMs)?.label || `${muteDurationMs}ms`, inline: true } : null,
        ).filter(Boolean)
        .setTimestamp();
      if (request.proofImageUrl) logEmbed.setImage(request.proofImageUrl);
      await logCh.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }

  // ── Mise à jour de la demande ────────────────────────────────────────────
  request.status = 'approved';
  request.chosenTier = tier;
  request.muteDurationMs = tier === 'mute' ? muteDurationMs : null;
  request.validatedBy = interaction.user.id;
  request.validatedAt = new Date();
  await request.save();

  const embed = buildRequestEmbed(request, target, { id: request.reporterId }, 'approved');
  const payload = { embeds: [embed], components: [] };
  await (isUpdate ? interaction.update(payload) : interaction.reply(payload)).catch(() => {});
}

module.exports = {
  createRequest,
  handleValidateButton,
  handleChangeTierButton,
  handleTierSelect,
  handleDurationSelect,
  handleRejectButton,
  isValidator,
};
