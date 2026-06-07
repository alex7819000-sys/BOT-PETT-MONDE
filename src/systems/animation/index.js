// src/systems/animation/index.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const User    = require('../../db/models/User');
const Config  = require('../../db/models/Config');
const logger  = require('../../utils/logger');

// ── Roi du jour — personne la plus active ─────────────────────────────────────
async function runRoiDuJour(client, guildId) {
  const config  = await Config.findOne({ guildId });
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(config?.roiDuJourChannelId || config?.announceChannelId);
  if (!channel) return;

  const guild = channel.guild;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Top 5 basé sur dailyXp
  const topUsers = await User.find({ guildId, dailyXp: { $gt: 0 } })
    .sort({ dailyXp: -1 }).limit(5);

  if (!topUsers.length) return;

  const topUser = topUsers[0];
  let topMember;
  try { topMember = await guild.members.fetch(topUser.userId); } catch { return; }

  // Rôle Roi du jour
  if (config?.roiDuJourRoleId) {
    const oldRoi = guild.members.cache.filter(m => m.roles.cache.has(config.roiDuJourRoleId));
    for (const [, m] of oldRoi) await m.roles.remove(config.roiDuJourRoleId).catch(() => {});
    await topMember.roles.add(config.roiDuJourRoleId).catch(() => {});
  }

  // Classement top 5
  const medals = ['👑', '🥈', '🥉', '4️⃣', '5️⃣'];
  const lines = [];
  for (let i = 0; i < topUsers.length; i++) {
    const u = topUsers[i];
    let name;
    try { name = (await guild.members.fetch(u.userId)).displayName; }
    catch { name = `<@${u.userId}>`; }
    lines.push(`${medals[i]} **${name}** — ${u.dailyXp} XP · ${u.dailyMessages || 0} msgs`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`🏴‍☠️ Classement XP du ${today.toLocaleDateString('fr-FR')}`)
    .setDescription(
      `👑 **${topMember.displayName}** est le Roi du jour !\n\n` +
      `**🏆 Top 5 :**\n` +
      lines.join('\n') +
      `\n\n> Reset demain à 20h30 — 0 pénalité pour les autres 🔄`
    )
    .setThumbnail(topMember.displayAvatarURL({ size: 128 }))
    .setTimestamp()
    .setFooter({ text: 'Classement quotidien XP · Reviens demain !' });

  await channel.send({ embeds: [embed] });

  // Reset stats du jour
  await User.updateMany({ guildId }, { dailyXp: 0, dailyMessages: 0 });

  logger.info('Animation', `Roi du jour : ${topMember.displayName} (${topUser.dailyXp} XP)`);
}

// ── Commande /annonce — template standardisé ─────────────────────────────────
async function postAnnonce(interaction, client) {
  const { safeReply } = require('../../utils/permissions');
  const { checkPermission } = require('../hierarchy');

  const ok = await checkPermission(interaction, 'announce');
  if (!ok) return;

  const config  = await Config.findOne({ guildId: interaction.guild.id });
  const contenu = interaction.options.getString('contenu');
  const ping    = interaction.options.getRole('ping');
  const salon   = interaction.options.getChannel('salon') ||
    interaction.guild.channels.cache.get(config?.announceChannelId);

  if (!salon) return safeReply(interaction, { content: '❌ Salon d\'annonce non configuré. Utilise `/setup` ou précise un salon.', ephemeral: true });

  const pingText   = ping ? `<@&${ping.id}>` : (config?.announcePingRoleId ? `<@&${config.announcePingRoleId}>` : '@everyone');
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
    allowedMentions: { roles: ping ? [ping.id] : [], everyone: !ping },
  });

  await safeReply(interaction, { content: `✅ Annonce publiée dans <#${salon.id}> !`, ephemeral: true });
}

// ── Auto-remerciement boost ───────────────────────────────────────────────────
async function handleBoost(member, client) {
  const guildId = member.guild.id;
  const config  = await Config.findOne({ guildId });
  if (!config?.boostChannelId) return;

  const channel = member.guild.channels.cache.get(config.boostChannelId);
  if (!channel) return;

  // XP bonus boost
  if (config?.boostXpBonus) {
    const { addXP } = require('../xp');
    await addXP(member.id, guildId, config.boostXpBonus, null, member.guild).catch(() => {});
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
    content: `${staffMention ? staffMention + ' ' : ''}@everyone 💜 **${member.displayName}** vient de booster le serveur !`,
    embeds: [embed],
    allowedMentions: { everyone: true, roles: config?.staffRoleId ? [config.staffRoleId] : [] },
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
