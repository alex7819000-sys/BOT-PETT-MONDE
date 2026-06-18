// src/systems/animation/index.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const User    = require('../db/models/User');
const Config  = require('../db/models/Config');
const logger  = require('../utils/logger');

// ── Roi du jour — personne la plus active ─────────────────────────────────────
async function runRoiDuJour(client, guildId) {
  const config  = await Config.findOne({ guildId });
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(config?.roiDuJourChannelId || config?.announceChannelId);
  if (!channel) return;

  const guild = channel.guild;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Trouver le membre le plus actif aujourd'hui
  // On se base sur l'XP gagné dans les dernières 24h via dailyXp
  const topUser = await User.findOne({ guildId, lastMessage: { $gte: today } })
    .sort({ dailyXp: -1 });

  if (!topUser) return;

  let member;
  try { member = await guild.members.fetch(topUser.userId); } catch { return; }

  // Retirer l'ancien rôle Roi du jour
  if (config?.roiDuJourRoleId) {
    const oldRoi = guild.members.cache.filter(m => m.roles.cache.has(config.roiDuJourRoleId));
    for (const [, m] of oldRoi) {
      if (m.id !== member.id) await m.roles.remove(config.roiDuJourRoleId).catch(() => {});
    }
    await member.roles.add(config.roiDuJourRoleId).catch(() => {});
  }

  // Stats du jour
  const msgToday  = topUser.dailyMessages || 0;
  const xpToday   = topUser.dailyXp       || 0;

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏴‍☠️ Roi des Pirates du ${today.toLocaleDateString('fr-FR')} !`)
    .setDescription(
      `Le roi d'aujourd'hui est **${member.displayName}** ! 👑\n\n` +
      `**📊 Stats du jour :**\n` +
      `💬 **${msgToday}** messages\n` +
      `⭐ **${xpToday}** XP gagnés aujourd'hui`
    )
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .setTimestamp()
    .setFooter({ text: 'Résultat calculé chaque jour à 20h30' });

  await channel.send({ embeds: [embed] });

  // Reset les stats quotidiennes
  await User.updateMany({ guildId }, { dailyXp: 0, dailyMessages: 0 });

  logger.info('Animation', `Roi du jour : ${member.displayName}`);
}

// ── Commande /annonce — template standardisé ─────────────────────────────────
async function postAnnonce(interaction, client) {
  const { safeReply } = require('../utils/permissions');
  const { checkPermission } = require('./hierarchy');

  const ok = await checkPermission(interaction, 'announce');
  if (!ok) return;

  const config  = await Config.findOne({ guildId: interaction.guild.id });
  const contenu = interaction.options.getString('contenu');
  const ping    = interaction.options.getRole('ping');
  const salon   = interaction.options.getChannel('salon') ||
    interaction.guild.channels.cache.get(config?.announceChannelId);

  if (!salon) return safeReply(interaction, { content: '❌ Salon d\'annonce non configuré. Utilise `/setup` ou précise un salon.', ephemeral: true });

  const pingText   = ping ? `<@&${ping.id}>` : (config?.announcePingRoleId ? `<@&${config.announcePingRoleId}>` : '');
  const memberText = config?.memberRolePingId ? `<@&${config.memberRolePingId}>` : '';
  const signature  = interaction.member.displayName;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(
      `${pingText}${memberText ? ` | ${memberText}` : ''}\n\n` +
      `${contenu}\n\n` +
      `*— ${signature}*`
    )
    .setTimestamp();

  // Image optionnelle
  const image = interaction.options.getString('image');
  if (image) embed.setImage(image);

  await salon.send({
    content: pingText,
    embeds: [embed],
    allowedMentions: { roles: ping ? [ping.id] : [], everyone: false },
  });

  await safeReply(interaction, { content: `✅ Annonce publiée dans <#${salon.id}> !`, ephemeral: true });
}

// ── Auto-remerciement boost ───────────────────────────────────────────────────
async function handleBoost(member, client) {
  const guildId = member.guild.id;
  const config  = await Config.findOne({ guildId });

  // ── Attribuer le rôle Booster ─────────────────────────────────────────
  if (config?.boostRoleId) {
    try {
      await member.roles.add(config.boostRoleId);
      logger.info('Animation', `Rôle boost attribué à ${member.displayName}`);
    } catch (err) {
      logger.error('Animation', 'Erreur attribution rôle boost', err);
    }
  }

  if (!config?.boostChannelId) return;

  const channel = member.guild.channels.cache.get(config.boostChannelId);
  if (!channel) return;

  // XP bonus boost
  if (config?.boostXpBonus) {
    const { addXP } = require('./xp');
    await addXP(member.id, guildId, config.boostXpBonus).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF73FA)
    .setTitle('💜 Nouveau Boost !')
    .setDescription(
      `**${member.displayName}** vient de booster le serveur ! 🚀\n\n` +
      `Merci infiniment pour ton soutien ! 💜\n` +
      (config?.boostXpBonus ? `> Tu reçois **+${config.boostXpBonus} XP** en cadeau ! 🎁` : `> Grâce à toi le serveur grandit ! 🌟`)
    )
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .setTimestamp();

  // GIF de remerciement configurable
  if (config?.boostGifUrl) embed.setImage(config.boostGifUrl);

  const staffMention = config?.staffRoleId ? `<@&${config.staffRoleId}>` : '';
  await channel.send({
    content: `${config?.boostPingRoleId ? '<@&' + config.boostPingRoleId + '> ' : ''}💜 **${member.displayName}** vient de booster le serveur !`,
    embeds: [embed],
    allowedMentions: { roles: config?.boostPingRoleId ? [config.boostPingRoleId] : [] },
  });

  logger.info('Animation', `Boost de ${member.displayName}`);
}

// ── Épinglage auto des meilleurs conseils ─────────────────────────────────────
async function checkPinMessage(reaction, config) {
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (!['⭐', '✅'].includes(reaction.emoji.name)) return;

  const pinThreshold = config?.pinStarThreshold || 5;
  if (reaction.count < pinThreshold) return;

  const msg = reaction.message;
  if (msg.pinned) return;

  // Vérifier que c'est dans un salon conseil
  const conseilChannelId = config?.conseilChannelId;
  if (conseilChannelId && msg.channel.id !== conseilChannelId) return;

  await msg.pin().catch(() => {});
  logger.info('Animation', `Message épinglé automatiquement (${reaction.count} ⭐)`);
}

module.exports = { runRoiDuJour, postAnnonce, handleBoost, checkPinMessage };
