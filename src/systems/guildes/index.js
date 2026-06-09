// src/systems/guildes/index.js — Guildes dynamiques
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Guilde = require('../../db/models/Guilde');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS, EMOJIS, GUILDES } = require('../../config/constants');
const { getLevelFromXP } = require('../../systems/xp');
const { safeReply } = require('../../utils/permissions');

const GUILD_COLORS = [0x7C4DFF, 0xFF5252, 0x00BFA5, 0xFF9800, 0x2196F3];

async function createGuilde(interaction, name, emoji, description) {
  const gid = interaction.guild.id;
  const uid = interaction.user.id;

  // Vérifier niveau 10+
  const userData = await User.findOne({ userId: uid, guildId: gid });
  const level = getLevelFromXP(userData?.totalXp || 0);
  if (level < GUILDES.GUILD_CREATE_LEVEL) {
    return safeReply(interaction, {
      content: `❌ Tu dois être niveau **${GUILDES.GUILD_CREATE_LEVEL}** pour créer une guilde. Tu es niveau **${level}**.`,
      ephemeral: true,
    });
  }

  // Déjà dans une guilde
  if (userData?.guildeId) {
    return safeReply(interaction, { content: '❌ Tu es déjà dans une guilde. Quitte-la d\'abord.', ephemeral: true });
  }

  // Limite 5 guildes
  const count = await Guilde.countDocuments({ guildId: gid, active: true });
  if (count >= GUILDES.MAX) {
    return safeReply(interaction, {
      content: `❌ Limite de ${GUILDES.MAX} guildes atteinte ! Défie le chef d'une guilde inactive avec \`/guilde defier\`.`,
      ephemeral: true,
    });
  }

  // Slug unique
  const guildeId = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20) + '-' + Date.now().toString(36);

  // Créer rôle Discord
  const color = GUILD_COLORS[count % GUILD_COLORS.length];
  let role;
  try {
    role = await interaction.guild.roles.create({
      name: `${emoji} ${name}`,
      color,
      reason: `Guilde créée par ${interaction.user.tag}`,
    });
  } catch (err) {
    logger.error('Guildes', 'Création rôle échouée', err);
  }

  // Créer salon privé
  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: `🏰︱${name.toLowerCase()}`,
      type: 0, // GuildText
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        ...(role ? [{ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ],
    });
  } catch (err) {
    logger.error('Guildes', 'Création salon échouée', err);
  }

  const guilde = await Guilde.create({
    guildId: gid, guildeId, name, emoji: emoji || '🏰', description: description || '',
    leaderId: uid, members: [uid], color,
    roleId: role?.id || null, channelId: channel?.id || null,
  });

  await User.updateOne({ userId: uid, guildId: gid }, { guildeId });
  if (role) await interaction.member.roles.add(role).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🏰 Guilde créée — ${emoji} ${name}`)
    .setDescription(description || '*Pas de description*')
    .addFields(
      { name: 'Chef', value: `<@${uid}>`, inline: true },
      { name: 'Membres', value: '1', inline: true },
      ...(role    ? [{ name: 'Rôle',  value: `<@&${role.id}>`,    inline: true }] : []),
      ...(channel ? [{ name: 'Salon', value: `<#${channel.id}>`,  inline: true }] : []),
    )
    .setTimestamp();

  await safeReply(interaction, { embeds: [embed] });
  if (channel) await channel.send(`🏰 Bienvenue dans **${name}** ! Cette guilde vient d'être fondée par <@${uid}>.`);
  logger.info('Guildes', `Nouvelle guilde : ${name} par ${uid}`);
}

async function joinGuilde(interaction, guildeId) {
  const gid = interaction.guild.id;
  const uid = interaction.user.id;

  const userData = await User.findOne({ userId: uid, guildId: gid });
  if (userData?.guildeId) {
    return safeReply(interaction, { content: '❌ Tu es déjà dans une guilde.', ephemeral: true });
  }

  const guilde = await Guilde.findOne({ guildId: gid, guildeId, active: true });
  if (!guilde) return safeReply(interaction, { content: '❌ Guilde introuvable.', ephemeral: true });

  guilde.members.push(uid);
  await guilde.save();
  await User.updateOne({ userId: uid, guildId: gid }, { guildeId }, { upsert: true });
  if (guilde.roleId) await interaction.member.roles.add(guilde.roleId).catch(() => {});
  if (guilde.channelId) {
    const ch = interaction.guild.channels.cache.get(guilde.channelId);
    if (ch) await ch.permissionOverwrites.edit(uid, { ViewChannel: true, SendMessages: true }).catch(() => {});
  }

  await safeReply(interaction, { content: `✅ Tu as rejoint **${guilde.emoji} ${guilde.name}** !`, ephemeral: false });
}

async function leaveGuilde(interaction) {
  const gid = interaction.guild.id;
  const uid = interaction.user.id;

  const userData = await User.findOne({ userId: uid, guildId: gid });
  if (!userData?.guildeId) return safeReply(interaction, { content: '❌ Tu n\'es dans aucune guilde.', ephemeral: true });

  const guilde = await Guilde.findOne({ guildId: gid, guildeId: userData.guildeId });
  if (!guilde) return safeReply(interaction, { content: '❌ Guilde introuvable.', ephemeral: true });

  if (guilde.leaderId === uid) {
    return safeReply(interaction, { content: '❌ Tu es le chef. Transfère la guilde avant de quitter.', ephemeral: true });
  }

  guilde.members = guilde.members.filter(m => m !== uid);
  await guilde.save();
  await User.updateOne({ userId: uid, guildId: gid }, { guildeId: null });
  if (guilde.roleId) await interaction.member.roles.remove(guilde.roleId).catch(() => {});

  await safeReply(interaction, { content: `✅ Tu as quitté **${guilde.name}**.`, ephemeral: true });
}

async function getGuildeInfo(interaction, guildeId) {
  const gid    = interaction.guild.id;
  const guilde = guildeId
    ? await Guilde.findOne({ guildId: gid, guildeId, active: true })
    : await Guilde.findOne({ guildId: gid, members: interaction.user.id, active: true });

  if (!guilde) return safeReply(interaction, { content: '❌ Guilde introuvable.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(guilde.color || COLORS.PURPLE)
    .setTitle(`${guilde.emoji} ${guilde.name}`)
    .setDescription(guilde.description || '*Pas de description*')
    .addFields(
      { name: 'Chef',       value: `<@${guilde.leaderId}>`, inline: true },
      { name: 'Membres',    value: `${guilde.members.length}`, inline: true },
      { name: 'Victoires',  value: `${guilde.victories}`, inline: true },
      { name: 'XP total',   value: `${guilde.totalXp.toLocaleString()}`, inline: true },
      { name: 'XP semaine', value: `${guilde.weekXp.toLocaleString()}`, inline: true },
      ...(guilde.isDominant ? [{ name: '👑 Statut', value: 'Guilde Dominante !', inline: true }] : []),
    )
    .setTimestamp();

  await safeReply(interaction, { embeds: [embed] });
}

async function getGuildesClassement(interaction) {
  const gid    = interaction.guild.id;
  const guildes = await Guilde.find({ guildId: gid, active: true }).sort({ weekXp: -1 }).limit(10);

  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('🏆 Classement des Guildes')
    .setDescription(
      guildes.length
        ? guildes.map((g, i) => `**${i + 1}.** ${g.emoji} ${g.name} — ${g.weekXp.toLocaleString()} XP | ${g.victories} victoires`).join('\n')
        : '*Aucune guilde*'
    )
    .setTimestamp();

  await safeReply(interaction, { embeds: [embed] });
}

async function runGuildeCeremony(client, guildId) {
  const config  = await Config.findOne({ guildId });
  const guild   = client.guilds.cache.get(guildId);
  if (!guild) return;

  const guildes = await Guilde.find({ guildId, active: true }).sort({ weekXp: -1 });
  if (!guildes.length) return;

  const winner = guildes[0];

  // Retirer rôle dominante ancien
  const oldDominant = guildes.find(g => g.isDominant && g.guildeId !== winner.guildeId);
  if (oldDominant) {
    if (oldDominant.roleId && config.guildeDominanteRoleId) {
      const role = guild.roles.cache.get(config.guildeDominanteRoleId);
      if (role) {
        for (const uid of oldDominant.members) {
          try { await (await guild.members.fetch(uid)).roles.remove(role); } catch (_) {}
        }
      }
    }
    await Guilde.updateOne({ guildeId: oldDominant.guildeId, guildId }, { isDominant: false, dominantUntil: null });
  }

  // Nouveau dominant
  const dominantUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await Guilde.updateOne({ guildeId: winner.guildeId, guildId }, {
    isDominant: true, dominantUntil, $inc: { victories: 1 },
  });

  // Donner rôle dominante
  if (config.guildeDominanteRoleId) {
    for (const uid of winner.members) {
      try {
        const m = await guild.members.fetch(uid);
        await m.roles.add(config.guildeDominanteRoleId);
        // Bonus x2 XP 24h
        await User.updateOne({ userId: uid, guildId }, { xpBoostUntil: new Date(Date.now() + 24 * 3600 * 1000) });
      } catch (_) {}
    }
  }

  // Annonce
  const channel = guild.channels.cache.get(config.announceChannelId);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`🏆 Guilde Dominante — ${winner.emoji} ${winner.name} !`)
      .setDescription(`La guilde **${winner.name}** domine PETIT MONDE cette semaine !\n\n🎁 **Bonus XP ×2** pour tous ses membres pendant **24h** !`)
      .addFields(
        { name: 'XP cette semaine', value: `${winner.weekXp.toLocaleString()}`, inline: true },
        { name: 'Victoires totales', value: `${winner.victories + 1}`, inline: true },
        { name: 'Membres', value: `${winner.members.length}`, inline: true },
      )
      .setTimestamp();

    await channel.send({ content: `${config?.announceRoleId ? '<@&' + config.announceRoleId + '> ' : ''}🏆 La Guilde Dominante est élue !`, embeds: [embed] });
  }

  // Reset XP hebdo toutes les guildes
  await Guilde.updateMany({ guildId }, { weekXp: 0 });
  logger.info('Guildes', `Dominante : ${winner.name}`);
}

module.exports = { createGuilde, joinGuilde, leaveGuilde, getGuildeInfo, getGuildesClassement, runGuildeCeremony };
