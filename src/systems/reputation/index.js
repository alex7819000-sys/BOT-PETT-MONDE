// src/systems/reputation/index.js
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../db/models/Config');
const User   = require('../../db/models/User');
const logger = require('../../utils/logger');

// ── Badges disponibles (attribués par le staff) ───────────────────────────────
const BADGES = {
  modele:      { emoji: '⭐', label: 'Membre modèle',   desc: 'Toujours respectueux, aide les autres',       color: 0xFFD700 },
  actif:       { emoji: '🔥', label: 'Très actif',      desc: 'Présent partout, anime le serveur',           color: 0xFF6600 },
  competitif:  { emoji: '🎯', label: 'Compétitif',      desc: 'Toujours dans le top classement',             color: 0xED4245 },
  fiable:      { emoji: '🤝', label: 'Fiable',          desc: 'Digne de confiance',                          color: 0x57F287 },
  createur:    { emoji: '🎨', label: 'Créateur',        desc: 'Produit du contenu de qualité',               color: 0xEB459E },
  veteran:     { emoji: '🏆', label: 'Vétéran',         desc: 'Membre de longue date et pilier du serveur',  color: 0x5865F2 },
  surveille:   { emoji: '⚠️', label: 'Surveillé',       desc: 'Comportement à surveiller',                   color: 0xFF0000 },
};

// ── Attribuer un badge à un membre ────────────────────────────────────────────
async function giveBadge(guild, targetId, badgeKey, staffId) {
  const badge = BADGES[badgeKey];
  if (!badge) return { ok: false, reason: 'Badge inconnu.' };

  await User.updateOne(
    { userId: targetId, guildId: guild.id },
    { $addToSet: { badges: badgeKey } },
    { upsert: true }
  );

  // Log
  const config = await Config.findOne({ guildId: guild.id });
  if (config?.logChannelId) {
    try {
      const ch = guild.channels.cache.get(config.logChannelId);
      if (ch) await ch.send({ embeds: [new EmbedBuilder()
        .setColor(badge.color)
        .setTitle(`${badge.emoji} Badge attribué`)
        .addFields(
          { name: '👤 Membre',    value: `<@${targetId}>`,   inline: true },
          { name: '🎖️ Badge',    value: badge.label,         inline: true },
          { name: '🛡️ Par',      value: `<@${staffId}>`,    inline: true },
        ).setTimestamp()
      ]});
    } catch (_) {}
  }

  logger.info('Reputation', `Badge ${badgeKey} → ${targetId}`);
  return { ok: true, badge };
}

// ── Retirer un badge ──────────────────────────────────────────────────────────
async function removeBadge(guild, targetId, badgeKey, staffId) {
  await User.updateOne(
    { userId: targetId, guildId: guild.id },
    { $pull: { badges: badgeKey } }
  );
  return { ok: true };
}

// ── Afficher les badges d'un membre ──────────────────────────────────────────
async function getMemberBadges(userId, guildId) {
  const user = await User.findOne({ userId, guildId });
  const badges = user?.badges || [];
  return badges.map(key => BADGES[key]).filter(Boolean);
}

// ── Envoyer une demande de satisfaction après fermeture de ticket ─────────────
async function sendSatisfactionDM(member, staffId, ticketType, guild) {
  try {
    const dm = await member.createDM();
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⭐ Comment s\'est passée ton expérience ?')
      .setDescription(
        `Ton ticket **${ticketType}** sur **${guild.name}** a été traité par <@${staffId}>.\n\n` +
        `Donne une note à cette interaction — ça aide à améliorer le service ! 😊`
      )
      .setFooter({ text: 'Anonyme • Ta note est visible uniquement du staff' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rep:note:5:${staffId}:${guild.id}`).setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rep:note:3:${staffId}:${guild.id}`).setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rep:note:1:${staffId}:${guild.id}`).setLabel('⭐').setStyle(ButtonStyle.Danger),
    );

    await dm.send({ embeds: [embed], components: [row] });
  } catch (_) {
    // DMs fermés — on ignore silencieusement
  }
}

// ── Gérer la note de satisfaction ────────────────────────────────────────────
async function handleSatisfactionNote(interaction) {
  const parts   = interaction.customId.split(':');
  const note    = parseInt(parts[2]);
  const staffId = parts[3];
  const guildId = parts[4];

  // Mettre à jour le score staff
  try {
    const StaffScore = require('../../db/models/StaffScore');
    await StaffScore.updateOne(
      { userId: staffId, guildId },
      { $inc: { satisfactionTotal: note, satisfactionCount: 1 } },
      { upsert: true }
    );
  } catch (_) {}

  const stars = '⭐'.repeat(note);
  const msg = note >= 4
    ? `${stars} Super, merci pour ton retour positif !`
    : note >= 3
    ? `${stars} Merci pour ton retour. On essaie de s'améliorer !`
    : `${stars} Merci pour ton retour. On va en tenir compte.`;

  await interaction.update({
    embeds: [new EmbedBuilder().setColor(note >= 4 ? 0x57F287 : note >= 3 ? 0xFFD700 : 0xFF6600).setDescription(msg)],
    components: [],
  });

  logger.info('Reputation', `Note ${note}/5 donnée à ${staffId}`);
}

// ── Commande /badge ───────────────────────────────────────────────────────────
async function handleBadgeCommand(interaction) {
  const { safeReply, requireLevel } = require('../../utils/permissions');
  const sub    = interaction.options.getSubcommand();
  const target = interaction.options.getMember('membre');
  const guildId = interaction.guild.id;

  if (sub === 'donner' || sub === 'retirer') {
    const ok = await requireLevel(interaction, 'warn'); // Modérateur+
    if (!ok) return;

    const badgeKey = interaction.options.getString('badge');
    if (sub === 'donner') {
      const result = await giveBadge(interaction.guild, target.id, badgeKey, interaction.user.id);
      if (!result.ok) return safeReply(interaction, { content: `❌ ${result.reason}`, ephemeral: true });
      const badge = result.badge;
      return safeReply(interaction, {
        content: `✅ Badge **${badge.emoji} ${badge.label}** attribué à <@${target.id}> !`,
        ephemeral: true,
      });
    } else {
      await removeBadge(interaction.guild, target.id, badgeKey, interaction.user.id);
      return safeReply(interaction, { content: `✅ Badge retiré de <@${target.id}>.`, ephemeral: true });
    }
  }

  if (sub === 'voir') {
    const who    = target || interaction.member;
    const badges = await getMemberBadges(who.id, guildId);
    const StaffScore = require('../../db/models/StaffScore');
    const score  = await StaffScore.findOne({ userId: who.id, guildId });
    const satAvg = score?.satisfactionCount
      ? (score.satisfactionTotal / score.satisfactionCount).toFixed(1)
      : null;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎖️ Réputation de ${who.displayName}`)
      .setThumbnail(who.displayAvatarURL({ size: 64 }));

    if (badges.length) {
      embed.addFields({
        name: '🏅 Badges',
        value: badges.map(b => `${b.emoji} **${b.label}** — *${b.desc}*`).join('\n'),
        inline: false,
      });
    } else {
      embed.setDescription('*Aucun badge pour l\'instant.*');
    }

    if (satAvg) {
      embed.addFields({
        name: '⭐ Satisfaction (staff)',
        value: `${satAvg}/5 *(${score.satisfactionCount} avis)*`,
        inline: true,
      });
    }

    return safeReply(interaction, { embeds: [embed], ephemeral: false });
  }
}

module.exports = { giveBadge, removeBadge, getMemberBadges, sendSatisfactionDM, handleSatisfactionNote, handleBadgeCommand, BADGES };
