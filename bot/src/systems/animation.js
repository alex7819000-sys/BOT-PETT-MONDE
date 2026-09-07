// src/systems/animation/index.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const User    = require('../db/models/User');
const Config  = require('../db/models/Config');
const logger  = require('../utils/logger');

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

module.exports = { postAnnonce, checkPinMessage };
