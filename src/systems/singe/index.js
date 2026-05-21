// src/systems/singe/index.js — Singe du serveur
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Nomination = require('../../db/models/Nomination');
const Election   = require('../../db/models/Election');
const User       = require('../../db/models/User');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS, EMOJIS, SINGE } = require('../../config/constants');
const { getWeekNumber, getCurrentYear, safeReply } = require('../../utils/permissions');

// ── Nominer ───────────────────────────────────────────────────────────────

async function nominate(interaction, target) {
  const gid   = interaction.guild.id;
  const uid   = interaction.user.id;
  const week  = getWeekNumber();
  const year  = getCurrentYear();

  if (target.id === uid) return safeReply(interaction, { content: '❌ Tu ne peux pas te nominer toi-même.', ephemeral: true });
  if (target.bot)        return safeReply(interaction, { content: '❌ Impossible de nominer un bot.', ephemeral: true });

  try {
    await Nomination.create({ guildId: gid, type: 'singe', nominatorId: uid, targetId: target.id, week, year });
  } catch (err) {
    if (err.code === 11000) return safeReply(interaction, { content: '❌ Tu as déjà nomiéné quelqu\'un cette semaine.', ephemeral: true });
    logger.error('Singe', 'nominate error', err);
    return safeReply(interaction, { content: '❌ Erreur lors de la nomination.', ephemeral: true });
  }

  const count = await Nomination.countDocuments({ guildId: gid, type: 'singe', targetId: target.id, week, year });
  await safeReply(interaction, {
    content: `${EMOJIS.SINGE} **${target.displayName}** a été nominé ! Il a maintenant **${count}** nomination(s) cette semaine.`,
    ephemeral: false,
  });
}

// ── Lancer le vote jeudi soir ─────────────────────────────────────────────

async function startVote(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.announceChannelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  const week = getWeekNumber();
  const year = getCurrentYear();

  // Top 3 nominés
  const agg = await Nomination.aggregate([
    { $match: { guildId, type: 'singe', week, year } },
    { $group: { _id: '$targetId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 3 },
  ]);

  if (!agg.length) return logger.info('Singe', 'Aucune nomination cette semaine');

  const candidates = await Promise.all(agg.map(async a => {
    let member;
    try { member = await guild.members.fetch(a._id); } catch (_) { return null; }
    return { key: a._id, userId: a._id, nominations: a.count, votes: [], display: member.displayName };
  }));

  const valid = candidates.filter(Boolean);
  if (!valid.length) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.RED)
    .setTitle(`${EMOJIS.SINGE} Vote — Qui sera le Singe ?`)
    .setDescription('Votez pour élire le Singe de la semaine !\nIl devra dire **"singe"** dans chaque message pendant 7 jours 🐒')
    .addFields(valid.map((c, i) => ({
      name: `Candidat ${i + 1}`,
      value: `<@${c.userId}> — ${c.nominations} nomination(s)`,
      inline: true,
    })))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    valid.map((c, i) =>
      new ButtonBuilder()
        .setCustomId(`singe:vote:${c.userId}`)
        .setLabel(`${['1️⃣','2️⃣','3️⃣'][i]} ${c.display}`)
        .setStyle(ButtonStyle.Danger)
    )
  );

  const msg = await channel.send({ content: '@everyone 🚨 Le vote pour le Singe commence !', embeds: [embed], components: [row] });

  await Election.create({ guildId, type: 'singe', phase: 'vote', candidates: valid, messageId: msg.id, channelId: channel.id, week, year });
  logger.info('Singe', 'Vote lancé');
}

// ── Voter ─────────────────────────────────────────────────────────────────

async function handleVote(interaction, targetId) {
  await interaction.deferUpdate();
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const election = await Election.findOne({ guildId: gid, type: 'singe', active: true });
  if (!election) return;

  // Vérifier vote existant
  const alreadyVoted = election.candidates.some(c => c.votes.includes(uid));
  if (alreadyVoted) return interaction.followUp({ content: '❌ Tu as déjà voté.', ephemeral: true });

  const cand = election.candidates.find(c => c.userId === targetId);
  if (!cand) return;
  cand.votes.push(uid);
  await election.save();

  await interaction.followUp({ content: `✅ Vote enregistré pour <@${targetId}> !`, ephemeral: true });
}

// ── Cérémonie vendredi ────────────────────────────────────────────────────

async function runSingeCeremony(client, guildId) {
  const config   = await Config.findOne({ guildId });
  const guild    = client.guilds.cache.get(guildId);
  const election = await Election.findOne({ guildId, type: 'singe', active: true });
  if (!election || !guild) return;

  const sorted   = election.candidates.sort((a, b) => b.votes.length - a.votes.length);
  const winner   = sorted[0];
  if (!winner) return;

  // Libérer l'ancien singe
  if (config.currentMonkeyId && config.currentMonkeyId !== winner.userId) {
    await releaseMonkey(guild, config, config.currentMonkeyId);
  }

  // Nouveau singe
  let member;
  try { member = await guild.members.fetch(winner.userId); } catch (_) { return; }

  if (config.singeRoleId) await member.roles.add(config.singeRoleId).catch(() => {});

  await User.updateOne({ userId: winner.userId, guildId }, {
    isMonkey: true,
    monkeyFaults: 0,
    monkeyWeek: getWeekNumber(),
  });
  await Config.updateOne({ guildId }, { currentMonkeyId: winner.userId });

  election.active = false;
  election.winners = [winner.userId];
  await election.save();

  const channel = guild.channels.cache.get(config.announceChannelId);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.RED)
      .setTitle(`${EMOJIS.SINGE} Le Singe de la Semaine est élu !`)
      .setDescription(`**${member.displayName}** est le Singe du serveur cette semaine ! 🐒`)
      .addFields(
        { name: 'Sa punition', value: 'Il doit dire **"singe"** dans chaque message pendant 7 jours.', inline: false },
        { name: 'S\'il oublie', value: '→ Message honteux public\n→ Perte de XP\n→ Timeout automatique', inline: false },
      )
      .setThumbnail(member.displayAvatarURL())
      .setTimestamp();
    await channel.send({ content: `@everyone ${EMOJIS.SINGE} Le singe est élu !`, embeds: [embed] });
  }

  // DM au singe
  try {
    await member.send({
      content: `${EMOJIS.SINGE} Tu es le **Singe de PETIT MONDE** cette semaine !\n\nRègle : tu dois écrire le mot **"singe"** dans **chaque message** pendant 7 jours.\nSi tu oublies → punition publique ! 😈`,
    });
  } catch (_) {}

  logger.info('Singe', `Nouveau singe : ${member.displayName}`);
}

// ── Check règle singe ─────────────────────────────────────────────────────

async function checkMonkeyRule(message, client) {
  const uid = message.author.id;
  const gid = message.guild.id;
  const user = await User.findOne({ userId: uid, guildId: gid });
  if (!user?.isMonkey) return;

  if (message.content.toLowerCase().includes('singe')) return; // OK

  user.monkeyFaults = (user.monkeyFaults || 0) + 1;
  const faults = user.monkeyFaults;
  await user.save();

  const SHAME = [
    `🙈 <@${uid}> a cru qu'il pouvait parler sans dire **singe**... RATÉ ! (${faults} fautes)`,
    `🐒 <@${uid}> a oublié le mot magique... HONTE ! (${faults} fautes)`,
    `🍌 <@${uid}> singe ou pas singe ? T'as oublié... (${faults} fautes)`,
    `😂 Le singe <@${uid}> a oublié d'être un singe ! (${faults} fautes)`,
  ];

  const config = await Config.findOne({ guildId: gid });

  if (faults >= SINGE.FAULT_TIMEOUT_THRESHOLD) {
    await message.member.timeout(SINGE.TIMEOUT_DURATION_MS, 'Singe : trop de fautes').catch(() => {});
    await message.reply(`⛔ <@${uid}> a ${faults} fautes ! TIMEOUT 1H ! 🐒`);
  } else if (faults >= SINGE.FAULT_XP_THRESHOLD) {
    const xpSys = require('../xp');
    await xpSys.addXP(uid, gid, -100);
    await message.reply(`💸 <@${uid}> perd **100 XP** pour avoir oublié "singe" ! (${faults} fautes)`);
  } else if (faults >= SINGE.FAULT_PING_THRESHOLD) {
    const ch = config?.announceChannelId ? message.guild.channels.cache.get(config.announceChannelId) : null;
    const target = ch || message.channel;
    await target.send(`🚨 @here **Le singe <@${uid}> a oublié de dire singe pour la ${faults}ème fois !** 🐒`);
  } else {
    await message.reply(SHAME[Math.floor(Math.random() * SHAME.length)]);
  }
}

async function releaseMonkey(guild, config, userId) {
  try {
    const old = await guild.members.fetch(userId);
    if (config.singeRoleId) await old.roles.remove(config.singeRoleId).catch(() => {});
    await old.timeout(null).catch(() => {});
    await User.updateOne({ userId, guildId: guild.id }, { isMonkey: false, monkeyFaults: 0 });
  } catch (_) {}
}

module.exports = { nominate, startVote, handleVote, runSingeCeremony, checkMonkeyRule };
