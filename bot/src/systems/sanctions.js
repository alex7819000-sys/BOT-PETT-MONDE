// src/systems/sanctions.js — Validation staff des signalements + application réelle
// des sanctions. La création de la demande (formulaire côté membre) est dans
// systems/reportPanel.js — ce fichier gère la partie "staff" + les actions Discord.
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Config           = require('../db/models/Config');
const Warn             = require('../db/models/Warn');
const SanctionRequest  = require('../db/models/SanctionRequest');
const logger           = require('../utils/logger');

const TIERS = ['warn', 'mute', 'voiceban', 'chatban', 'kick', 'ban'];
const TIER_LABEL = {
  warn:     '⚠️ Avertissement',
  mute:     '🔇 Mute (vocal + tchat)',
  voiceban: '🎙️❌ Ban vocal temporaire',
  chatban:  '💬❌ Ban tchat temporaire',
  kick:     '👢 Expulsion (kick)',
  ban:      '🔨 Exclusion définitive (ban)',
};
const TIER_COLOR = { warn: 0xFFAA00, mute: 0xFF8C00, voiceban: 0xFF7043, chatban: 0xFF7043, kick: 0xFF6600, ban: 0xFF0000 };
const DURATION_TIERS = ['mute', 'voiceban', 'chatban']; // nécessitent une durée

const DURATIONS = [
  { label: '10 minutes', value: '600000' },
  { label: '1 heure',    value: '3600000' },
  { label: '6 heures',   value: '21600000' },
  { label: '24 heures',  value: '86400000' },
  { label: '48 heures',  value: '172800000' },
  { label: '7 jours',    value: '604800000' },
];
function durationLabel(ms) {
  return DURATIONS.find(d => Number(d.value) === Number(ms))?.label || `${Math.round(ms / 60000)} min`;
}

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

// ── Nombre de sanctions actives récentes d'un membre (info affichée au staff) ──
async function countRecentSanctions(guildId, targetId, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return Warn.countDocuments({ guildId, userId: targetId, active: true, createdAt: { $gte: cutoff } });
}

// ── Construction de l'embed de la demande ──────────────────────────────────
async function buildRequestEmbed(request, config) {
  const tier = request.chosenTier || request.requestedTier;
  const embed = new EmbedBuilder()
    .setColor(TIER_COLOR[tier] || 0x99AAB5)
    .setTitle('🚨 Signalement')
    .addFields(
      { name: '👤 Membre visé', value: `<@${request.targetId}>`, inline: true },
      { name: '🗣️ Signalé par', value: `<@${request.reporterId}>`, inline: true },
      { name: '⚖️ Sanction demandée', value: TIER_LABEL[request.requestedTier] || '—', inline: true },
      { name: '📋 Explication', value: request.reason, inline: false },
    )
    .setTimestamp();

  if (request.penaltyDurationMs) {
    embed.addFields({ name: '⏳ Durée demandée', value: durationLabel(request.penaltyDurationMs), inline: true });
  }
  if (request.proofText) embed.addFields({ name: '🔗 Preuve (texte/lien)', value: request.proofText.substring(0, 1000), inline: false });
  if (request.proofImageUrl) embed.setImage(request.proofImageUrl);

  const recentCount = await countRecentSanctions(request.guildId, request.targetId, config?.sanctionResetDays ?? 60).catch(() => 0);
  embed.addFields({ name: '📁 Historique récent', value: `${recentCount} sanction(s) sur les ${config?.sanctionResetDays ?? 60} derniers jours`, inline: false });

  if (request.status === 'approved') {
    embed.setColor(0x57F287);
    embed.addFields({ name: '✅ Validé', value: `Sanction appliquée : ${TIER_LABEL[request.chosenTier]}${request.penaltyDurationMs ? ` (${durationLabel(request.penaltyDurationMs)})` : ''} — par <@${request.validatedBy}>`, inline: false });
  } else if (request.status === 'rejected') {
    embed.setColor(0x99AAB5);
    embed.addFields({ name: '❌ Refusé', value: `Par <@${request.validatedBy}>`, inline: false });
  }

  return embed;
}

function buildActionRows(requestId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sanction:validate:${requestId}`).setLabel('✅ Valider la sanction demandée').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sanction:changetier:${requestId}`).setLabel('✏️ Choisir une autre sanction').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sanction:reject:${requestId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  )];
}

// ── Bouton "Valider la sanction demandée" ──────────────────────────────────
async function handleValidateButton(interaction, requestId) {
  const config = await getConfig(interaction.guild.id);
  if (!isValidator(interaction, config)) {
    return interaction.reply({ content: '❌ Tu n\'as pas la permission de valider une sanction.', ephemeral: true });
  }
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.reply({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', ephemeral: true });
  }

  if (DURATION_TIERS.includes(request.requestedTier) && !request.penaltyDurationMs) {
    return promptDuration(interaction, requestId, request.requestedTier);
  }
  return applyTier(interaction, request, request.requestedTier, request.penaltyDurationMs || null);
}

// ── Bouton "Choisir une autre sanction" → menu déroulant ───────────────────
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
    .setPlaceholder('Choisis la sanction à appliquer')
    .addOptions(TIERS.map(t => ({ label: TIER_LABEL[t], value: t })));

  return interaction.reply({
    content: 'Choisis la sanction à appliquer à la place :',
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

// ── Sélection d'une sanction custom (staff) ────────────────────────────────
async function handleTierSelect(interaction, requestId) {
  const chosen = interaction.values?.[0];
  if (!TIERS.includes(chosen)) return interaction.update({ content: '❌ Sanction invalide.', components: [] });

  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.update({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', components: [] });
  }

  if (DURATION_TIERS.includes(chosen)) return promptDuration(interaction, requestId, chosen, true);
  return applyTier(interaction, request, chosen, null, true);
}

// ── Demande la durée avant application (mute / voiceban / chatban) ────────
async function promptDuration(interaction, requestId, tier, isUpdate = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`sanction:duration:${requestId}:${tier}`)
    .setPlaceholder('Choisis la durée')
    .addOptions(DURATIONS.map(d => ({ label: d.label, value: d.value })));

  const payload = {
    content: `⏳ Choisis la durée pour : **${TIER_LABEL[tier]}**`,
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  };
  return isUpdate ? interaction.update(payload) : interaction.reply(payload);
}

// ── Sélection de la durée (staff) → applique ────────────────────────────────
async function handleDurationSelect(interaction, requestId, tier) {
  const durationMs = parseInt(interaction.values?.[0], 10);
  const request = await SanctionRequest.findById(requestId).catch(() => null);
  if (!request || request.status !== 'pending') {
    return interaction.update({ content: '❌ Cette demande n\'existe plus ou a déjà été traitée.', components: [] });
  }
  return applyTier(interaction, request, tier, durationMs, true);
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

  const embed = await buildRequestEmbed(request, config);
  await interaction.update({ embeds: [embed], components: [] }).catch(() => {});
  await postToHistory(interaction.guild, request, config);

  const target = await interaction.guild.members.fetch(request.targetId).catch(() => null);
  if (target) {
    await target.send({
      embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle(`Signalement classé sans suite — ${interaction.guild.name}`)
        .setDescription('Un signalement te concernant a été examiné par le staff et n\'a donné lieu à aucune sanction.')],
    }).catch(() => {});
  }
}

// ── Applique réellement la sanction choisie ─────────────────────────────────
async function applyTier(interaction, request, tier, durationMs, isUpdate = false) {
  const guild = interaction.guild;
  const config = await getConfig(guild.id);
  const target = await guild.members.fetch(request.targetId).catch(() => null);

  if (!target) {
    const payload = { content: '❌ Le membre visé n\'est plus sur le serveur.', components: [] };
    return isUpdate ? interaction.update(payload) : interaction.reply(payload);
  }

  if (DURATION_TIERS.includes(tier) && !durationMs) {
    return promptDuration(interaction, request._id.toString(), tier, isUpdate);
  }

  if ((tier === 'voiceban' && !config?.voiceBanRoleId) || (tier === 'chatban' && !config?.chatBanRoleId)) {
    const payload = { content: `❌ Le rôle "${tier === 'voiceban' ? 'Ban vocal' : 'Ban tchat'}" n'est pas configuré (\`/notif sanction\`).`, components: [] };
    return isUpdate ? interaction.update(payload) : interaction.reply(payload);
  }

  const priorCount = await Warn.countDocuments({ guildId: guild.id, userId: target.id, active: true });
  const warnNumber = priorCount + 1;
  const penaltyExpiresAt = DURATION_TIERS.includes(tier) && tier !== 'mute' ? new Date(Date.now() + durationMs) : null;

  await Warn.create({
    guildId: guild.id, userId: target.id, moderatorId: interaction.user.id,
    reporterId: request.reporterId, reason: request.reason, warnNumber, tier,
    proofImageUrl: request.proofImageUrl, proofText: request.proofText,
    penaltyDurationMs: DURATION_TIERS.includes(tier) ? durationMs : null,
    penaltyExpiresAt,
  });

  const dmEmbed = new EmbedBuilder()
    .setColor(TIER_COLOR[tier])
    .setTitle(`${TIER_LABEL[tier]} — ${guild.name}`)
    .setDescription(`**Raison :** ${request.reason}` + (DURATION_TIERS.includes(tier) ? `\n**Durée :** ${durationLabel(durationMs)}` : ''))
    .setTimestamp();

  try {
    if (tier === 'warn') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
    } else if (tier === 'mute') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.timeout(durationMs, request.reason).catch(() => {});
    } else if (tier === 'voiceban') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      if (target.voice?.channelId) await target.voice.disconnect(request.reason).catch(() => {});
      await target.roles.add(config.voiceBanRoleId, request.reason).catch(() => {});
    } else if (tier === 'chatban') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.roles.add(config.chatBanRoleId, request.reason).catch(() => {});
    } else if (tier === 'kick') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.kick(request.reason).catch(() => {});
    } else if (tier === 'ban') {
      await target.send({ embeds: [dmEmbed] }).catch(() => {});
      await target.ban({ reason: request.reason, deleteMessageSeconds: 0 }).catch(() => {});
    }
  } catch (err) {
    logger.error('Sanctions', `Erreur application sanction ${tier}`, err);
  }

  request.status = 'approved';
  request.chosenTier = tier;
  request.penaltyDurationMs = DURATION_TIERS.includes(tier) ? durationMs : null;
  request.validatedBy = interaction.user.id;
  request.validatedAt = new Date();
  await request.save();

  const embed = await buildRequestEmbed(request, config);
  const payload = { embeds: [embed], components: [] };
  await (isUpdate ? interaction.update(payload) : interaction.reply(payload)).catch(() => {});

  await postToHistory(guild, request, config);
}

// ── Poste dans le salon "historique" (validé ou refusé) ────────────────────
async function postToHistory(guild, request, config) {
  const historyChannelId = config?.sanctionHistoryChannelId || config?.logChannelId || config?.logsChannelId;
  if (!historyChannelId) return;
  const channel = guild.channels.cache.get(historyChannelId);
  if (!channel) return;

  const embed = await buildRequestEmbed(request, config);
  embed.setTitle(request.status === 'approved' ? '📁 Signalement traité — sanction appliquée' : '📁 Signalement traité — refusé');
  await channel.send({ embeds: [embed] }).catch(() => {});
}

// ── Cron : retire les rôles voiceban/chatban expirés ────────────────────────
async function cleanupExpiredPenalties(client) {
  const now = new Date();
  const expired = await Warn.find({
    tier: { $in: ['voiceban', 'chatban'] }, active: true, penaltyLifted: false,
    penaltyExpiresAt: { $lte: now, $ne: null },
  }).lean().catch(() => []);

  for (const warn of expired) {
    try {
      const guild = client.guilds.cache.get(warn.guildId);
      if (!guild) continue;
      const config = await getConfig(warn.guildId);
      const roleId = warn.tier === 'voiceban' ? config?.voiceBanRoleId : config?.chatBanRoleId;
      const member = await guild.members.fetch(warn.userId).catch(() => null);
      if (member && roleId) await member.roles.remove(roleId).catch(() => {});
      await Warn.updateOne({ _id: warn._id }, { penaltyLifted: true });
    } catch (err) {
      logger.error('Sanctions', `Erreur cleanup pénalité ${warn._id}`, err);
    }
  }
}

module.exports = {
  TIERS, TIER_LABEL, DURATION_TIERS, DURATIONS, durationLabel,
  buildRequestEmbed, buildActionRows,
  handleValidateButton, handleChangeTierButton, handleTierSelect, handleDurationSelect, handleRejectButton,
  isValidator, postToHistory, cleanupExpiredPenalties,
};
