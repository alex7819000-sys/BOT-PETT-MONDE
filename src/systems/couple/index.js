// src/systems/couple/index.js — Meilleur Couple
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Nomination = require('../../db/models/Nomination');
const Election   = require('../../db/models/Election');
const User       = require('../../db/models/User');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');
const { COLORS, EMOJIS } = require('../../config/constants');
const { getWeekNumber, getCurrentYear, safeReply } = require('../../utils/permissions');

async function nominate(interaction, target1, target2) {
  const gid  = interaction.guild.id;
  const uid  = interaction.user.id;
  const week = getWeekNumber();
  const year = getCurrentYear();

  if (target1.id === target2.id) return safeReply(interaction, { content: '❌ Les deux membres doivent être différents.', ephemeral: true });
  const key = [target1.id, target2.id].sort().join('-');

  try {
    await Nomination.create({ guildId: gid, type: 'couple', nominatorId: uid, targetId: target1.id, target2Id: target2.id, week, year });
  } catch (err) {
    if (err.code === 11000) return safeReply(interaction, { content: '❌ Tu as déjà nominé un couple cette semaine.', ephemeral: true });
    logger.error('Couple', 'nominate error', err);
    return safeReply(interaction, { content: '❌ Erreur.', ephemeral: true });
  }

  const count = await Nomination.countDocuments({ guildId: gid, type: 'couple', targetId: target1.id, target2Id: target2.id, week, year });
  await safeReply(interaction, {
    content: `${EMOJIS.COUPLE} **${target1.displayName}** & **${target2.displayName}** nominés ! (${count} nom.)`,
  });
}

async function startVote(client, guildId) {
  const config  = await Config.findOne({ guildId });
  if (!config?.announceChannelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  const week = getWeekNumber();
  const year = getCurrentYear();

  const agg = await Nomination.aggregate([
    { $match: { guildId, type: 'couple', week, year } },
    { $group: { _id: { t1: '$targetId', t2: '$target2Id' }, count: { $sum: 1 }, t1: { $first: '$targetId' }, t2: { $first: '$target2Id' } } },
    { $sort: { count: -1 } },
    { $limit: 3 },
  ]);

  if (!agg.length) return logger.info('Couple', 'Aucune nomination cette semaine');

  const candidates = await Promise.all(agg.map(async a => {
    try {
      const m1 = await guild.members.fetch(a.t1);
      const m2 = await guild.members.fetch(a.t2);
      return { key: `${a.t1}-${a.t2}`, userId: a.t1, userId2: a.t2, nominations: a.count, votes: [], display: `${m1.displayName} & ${m2.displayName}` };
    } catch (_) { return null; }
  }));
  const valid = candidates.filter(Boolean);
  if (!valid.length) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PINK)
    .setTitle(`${EMOJIS.COUPLE} Vote — Meilleur Couple`)
    .setDescription('Votez pour le meilleur couple de la semaine !')
    .addFields(valid.map((c, i) => ({
      name: `Couple ${i + 1}`,
      value: `<@${c.userId}> & <@${c.userId2}> — ${c.nominations} nom.`,
      inline: true,
    })))
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    valid.map((c, i) =>
      new ButtonBuilder()
        .setCustomId(`couple:vote:${c.key}`)
        .setLabel(`${'💑'} ${c.display}`)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const msg = await channel.send({ content: '@everyone 💑 Votez pour le meilleur couple !', embeds: [embed], components: [row] });
  await Election.create({ guildId, type: 'couple', phase: 'vote', candidates: valid, messageId: msg.id, channelId: channel.id, week: getWeekNumber(), year: getCurrentYear() });
}

async function handleVote(interaction, key) {
  await interaction.deferUpdate();
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const election = await Election.findOne({ guildId: gid, type: 'couple', active: true });
  if (!election) return;

  const alreadyVoted = election.candidates.some(c => c.votes.includes(uid));
  if (alreadyVoted) return interaction.followUp({ content: '❌ Tu as déjà voté.', ephemeral: true });

  const cand = election.candidates.find(c => c.key === key);
  if (cand) { cand.votes.push(uid); await election.save(); }

  await interaction.followUp({ content: '✅ Vote enregistré !', ephemeral: true });
}

async function runCoupleCeremony(client, guildId) {
  const config   = await Config.findOne({ guildId });
  const guild    = client.guilds.cache.get(guildId);
  const election = await Election.findOne({ guildId, type: 'couple', active: true });
  if (!election || !guild) return;

  const sorted = election.candidates.sort((a, b) => b.votes.length - a.votes.length);
  const winner = sorted[0];
  if (!winner) return;

  // Retirer rôle ancien couple
  if (config.currentCoupleIds?.length && config.coupleRoleId) {
    for (const id of config.currentCoupleIds) {
      try {
        const m = await guild.members.fetch(id);
        await m.roles.remove(config.coupleRoleId);
      } catch (_) {}
    }
  }

  const newCouple = [winner.userId, winner.userId2];
  if (config.coupleRoleId) {
    for (const id of newCouple) {
      try {
        const m = await guild.members.fetch(id);
        await m.roles.add(config.coupleRoleId);
      } catch (_) {}
    }
  }

  await Config.updateOne({ guildId }, { currentCoupleIds: newCouple });
  election.active  = false;
  election.winners = newCouple;
  await election.save();

  const channel = guild.channels.cache.get(config.announceChannelId);
  if (!channel) return;

  const m1 = await guild.members.fetch(winner.userId).catch(() => null);
  const m2 = await guild.members.fetch(winner.userId2).catch(() => null);
  const n1  = m1?.displayName || `<@${winner.userId}>`;
  const n2  = m2?.displayName || `<@${winner.userId2}>`;

  const embed = new EmbedBuilder()
    .setColor(COLORS.PINK)
    .setTitle(`${EMOJIS.COUPLE} Meilleur Couple de la Semaine !`)
    .setDescription(`**${n1}** & **${n2}** sont le meilleur couple de PETIT MONDE ! 💕`)
    .addFields({ name: 'Votes reçus', value: `**${winner.votes.length}** votes`, inline: true })
    .setTimestamp();

  await channel.send({ content: `@everyone ${EMOJIS.COUPLE} Annonce du meilleur couple !`, embeds: [embed] });
  logger.info('Couple', `Gagnants : ${n1} & ${n2}`);
}

module.exports = { nominate, startVote, handleVote, runCoupleCeremony };
