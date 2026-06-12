// src/systems/warn/index.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const Warn   = require('../../db/models/Warn');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

// ── Seuils d'escalade ────────────────────────────────────────────────────────
const ESCALADE = {
  3: 'singe',   // rôle Singe automatique
  5: 'kick',    // kick automatique
  7: 'ban',     // ban automatique
};

const COLORS = {
  WARN:  0xFFAA00,
  KICK:  0xFF6600,
  BAN:   0xFF0000,
  INFO:  0x5865F2,
  GREEN: 0x57F287,
};

// ── Poster dans le salon logs ─────────────────────────────────────────────────
async function postLog(guild, config, embed) {
  try {
    const logChannelId = config?.logChannelId || config?.logsChannelId;
    if (!logChannelId) return;
    const channel = guild.channels.cache.get(logChannelId);
    if (channel) await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('Warn', 'postLog failed', err);
  }
}

// ── Envoyer un DM au membre ───────────────────────────────────────────────────
async function dmMember(member, embed) {
  try { await member.send({ embeds: [embed] }); } catch (_) {}
}

// ── Ajouter un warn ───────────────────────────────────────────────────────────
async function addWarn(guild, target, moderator, reason, config) {
  const guildId = guild.id;

  // Compter les warns actifs existants
  const activeWarns = await Warn.countDocuments({ guildId, userId: target.id, active: true });
  const newWarnNumber = activeWarns + 1;

  // Créer le warn
  const warn = await Warn.create({
    guildId,
    userId:      target.id,
    moderatorId: moderator.id,
    reason,
    warnNumber:  newWarnNumber,
  });

  // Mise à jour monkeyFaults sur le User
  await User.updateOne(
    { userId: target.id, guildId },
    { $inc: { monkeyFaults: 1 } },
    { upsert: true }
  );

  const totalWarns = newWarnNumber;

  // ── Embed DM au membre ──────────────────────────────────────────────────────
  const dmEmbed = new EmbedBuilder()
    .setColor(COLORS.WARN)
    .setTitle(`⚠️ Avertissement sur ${guild.name}`)
    .setDescription(
      `Tu as reçu un avertissement.\n\n` +
      `**Raison :** ${reason}\n` +
      `**Warn n°${totalWarns}**\n\n` +
      `> ${getEscaladeMessage(totalWarns)}`
    )
    .setTimestamp();

  await dmMember(target, dmEmbed);

  // ── Embed log ───────────────────────────────────────────────────────────────
  const logEmbed = new EmbedBuilder()
    .setColor(COLORS.WARN)
    .setTitle(`⚠️ Warn #${warn._id.toString().slice(-6).toUpperCase()}`)
    .addFields(
      { name: '👤 Membre',      value: `<@${target.id}> \`${target.user?.tag || target.id}\``, inline: true },
      { name: '🛡️ Modérateur', value: `<@${moderator.id}>`,                                  inline: true },
      { name: '📋 Raison',      value: reason,                                                inline: false },
      { name: '🔢 Total warns', value: `**${totalWarns}** warn${totalWarns > 1 ? 's' : ''} actif${totalWarns > 1 ? 's' : ''}`, inline: true },
      { name: '⚡ Escalade',    value: getEscaladeMessage(totalWarns),                         inline: true },
    )
    .setThumbnail(target.displayAvatarURL?.({ size: 64 }) || null)
    .setTimestamp()
    .setFooter({ text: `ID Warn: ${warn._id}` });

  await postLog(guild, config, logEmbed);

  // ── Score staff : +5 pts pour le modo qui a warn ─────────────────────────
  try {
    const { addStaffPoints } = require('../kingstaff');
    await addStaffPoints(moderator.id, guild.id, 'WARN_DONNE');
  } catch (_) {}

  // ── Escalade automatique ────────────────────────────────────────────────────
  const action = ESCALADE[totalWarns];
  if (action) await applyEscalade(guild, target, moderator, totalWarns, action, reason, config);

  return { warn, totalWarns };
}

// ── Escalade automatique ──────────────────────────────────────────────────────
async function applyEscalade(guild, target, moderator, totalWarns, action, reason, config) {
  if (action === 'singe') {
    // Donner le rôle Singe
    if (config?.singeRoleId) {
      try {
        await target.roles.add(config.singeRoleId);
        await User.updateOne({ userId: target.id, guildId: guild.id }, { isMonkey: true });
      } catch (_) {}
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('🐒 Rôle Singe automatique')
      .setDescription(
        `<@${target.id}> a atteint **${totalWarns} warns** et reçoit automatiquement le rôle Singe.\n` +
        `**Malus :** -50% XP gagné sur chaque message.`
      )
      .addFields(
        { name: '🛡️ Déclenché par', value: `Système automatique (warn #${totalWarns})`, inline: true },
        { name: '👤 Cible',         value: `<@${target.id}>`,                           inline: true },
      )
      .setTimestamp();
    await postLog(guild, config, embed);

  } else if (action === 'kick') {
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.KICK)
      .setTitle(`👢 Tu as été expulsé de ${guild.name}`)
      .setDescription(`**Raison :** ${totalWarns} avertissements atteints.\n**Détail :** ${reason}`)
      .setTimestamp();
    await dmMember(target, dmEmbed);

    try { await target.kick(`${totalWarns} warns — automatique`); } catch (_) {}

    const logEmbed = new EmbedBuilder()
      .setColor(COLORS.KICK)
      .setTitle('👢 Kick automatique')
      .addFields(
        { name: '👤 Membre',        value: `<@${target.id}> \`${target.user?.tag || target.id}\``, inline: true },
        { name: '🛡️ Modérateur',  value: `Système automatique`,                                  inline: true },
        { name: '📋 Raison',        value: `${totalWarns} avertissements atteints`,               inline: false },
      )
      .setTimestamp();
    await postLog(guild, config, logEmbed);

  } else if (action === 'ban') {
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.BAN)
      .setTitle(`🔨 Tu as été banni de ${guild.name}`)
      .setDescription(`**Raison :** ${totalWarns} avertissements atteints.\n**Détail :** ${reason}`)
      .setTimestamp();
    await dmMember(target, dmEmbed);

    try { await target.ban({ reason: `${totalWarns} warns — automatique`, deleteMessageSeconds: 0 }); } catch (_) {}

    const logEmbed = new EmbedBuilder()
      .setColor(COLORS.BAN)
      .setTitle('🔨 Ban automatique')
      .addFields(
        { name: '👤 Membre',       value: `<@${target.id}> \`${target.user?.tag || target.id}\``, inline: true },
        { name: '🛡️ Modérateur', value: `Système automatique`,                                   inline: true },
        { name: '📋 Raison',       value: `${totalWarns} avertissements atteints`,                inline: false },
      )
      .setTimestamp();
    await postLog(guild, config, logEmbed);
  }
}

// ── Supprimer un warn ─────────────────────────────────────────────────────────
async function deleteWarn(guild, warnId, moderator, config) {
  const warn = await Warn.findOne({ _id: warnId, guildId: guild.id });
  if (!warn) return null;

  warn.active    = false;
  warn.deletedBy = moderator.id;
  warn.deletedAt = new Date();
  await warn.save();

  // Décrémenter monkeyFaults
  await User.updateOne(
    { userId: warn.userId, guildId: guild.id },
    { $inc: { monkeyFaults: -1 } }
  );

  const logEmbed = new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle('✅ Warn supprimé')
    .addFields(
      { name: '👤 Membre',       value: `<@${warn.userId}>`,   inline: true },
      { name: '🛡️ Supprimé par', value: `<@${moderator.id}>`, inline: true },
      { name: '📋 Raison initiale', value: warn.reason,        inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `ID Warn: ${warn._id}` });

  await postLog(guild, config, logEmbed);
  return warn;
}

// ── Reset tous les warns ──────────────────────────────────────────────────────
async function clearWarns(guild, userId, moderator, config) {
  const result = await Warn.updateMany(
    { guildId: guild.id, userId, active: true },
    { active: false, deletedBy: moderator.id, deletedAt: new Date() }
  );

  await User.updateOne(
    { userId, guildId: guild.id },
    { monkeyFaults: 0 }
  );

  const logEmbed = new EmbedBuilder()
    .setColor(COLORS.GREEN)
    .setTitle('🗑️ Warns effacés')
    .addFields(
      { name: '👤 Membre',          value: `<@${userId}>`,       inline: true },
      { name: '🛡️ Par',            value: `<@${moderator.id}>`, inline: true },
      { name: '🔢 Warns supprimés', value: `${result.modifiedCount}`,          inline: true },
    )
    .setTimestamp();
  await postLog(guild, config, logEmbed);

  return result.modifiedCount;
}

// ── Récupérer les warns d'un membre ──────────────────────────────────────────
async function getWarns(guildId, userId, onlyActive = true) {
  const filter = { guildId, userId };
  if (onlyActive) filter.active = true;
  return Warn.find(filter).sort({ createdAt: -1 });
}

// ── Message d'escalade ────────────────────────────────────────────────────────
function getEscaladeMessage(n) {
  if (n >= 7) return '🔨 **BAN automatique déclenché**';
  if (n >= 5) return '👢 **KICK automatique déclenché**';
  if (n >= 3) return '🐒 **Rôle Singe automatique déclenché** (-50% XP)';
  if (n === 2) return `⚠️ Encore **1 warn** → rôle Singe automatique`;
  return `⚠️ **${3 - n} warn${3 - n > 1 ? 's' : ''}** avant le rôle Singe`;
}

// ── Log action manuelle staff (kick/ban manuel) ───────────────────────────────
async function logModAction(guild, config, action, target, moderator, reason) {
  const colors = { kick: COLORS.KICK, ban: COLORS.BAN, unban: COLORS.GREEN, mute: COLORS.WARN };
  const icons  = { kick: '👢', ban: '🔨', unban: '✅', mute: '🔇' };

  const embed = new EmbedBuilder()
    .setColor(colors[action] || COLORS.INFO)
    .setTitle(`${icons[action] || '⚡'} ${action.toUpperCase()} — Action staff`)
    .addFields(
      { name: '👤 Membre',       value: `<@${target.id}> \`${target.user?.tag || target.id}\``, inline: true },
      { name: '🛡️ Modérateur', value: `<@${moderator.id}>`,                                    inline: true },
      { name: '📋 Raison',       value: reason || 'Aucune raison fournie',                      inline: false },
    )
    .setThumbnail(target.displayAvatarURL?.({ size: 64 }) || null)
    .setTimestamp();

  await postLog(guild, config, embed);
}

module.exports = { addWarn, deleteWarn, clearWarns, getWarns, logModAction, postLog, getEscaladeMessage };
