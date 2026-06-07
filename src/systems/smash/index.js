// src/systems/smash/index.js — Smash or Pass unifié — v5
'use strict';
const xpSys = require('../xp');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios   = require('axios');
const Vote    = require('../../db/models/Vote');
const Config  = require('../../db/models/Config');
const logger  = require('../../utils/logger');
const { COLORS, EMOJIS, ANIMAL_APIS, ANIMAL_KEYS } = require('../../config/constants');

async function fetchAnimeCharacter() {
  try {
    const { data } = await axios.get('https://api.jikan.moe/v4/random/characters', { timeout: 8000 });
    const char  = data.data;
    const image = char.images?.jpg?.image_url;
    if (!image) return null;
    const anime = char.anime?.[0]?.anime?.title || 'Anime inconnu';
    return { name: char.name, imageUrl: image, extra: anime };
  } catch (err) {
    logger.error('Smash', 'Jikan API failed', err);
    return null;
  }
}

async function fetchRandomAnimal() {
  const key = ANIMAL_KEYS[Math.floor(Math.random() * ANIMAL_KEYS.length)];
  try {
    const result = await ANIMAL_APIS[key]();
    return { name: result.name, imageUrl: result.image, extra: `${result.emoji} ${key}` };
  } catch (err) {
    logger.error('Smash', `Animal API (${key}) failed`, err);
    return null;
  }
}

async function postSmash(client, guildId, mode) {
  const config = await Config.findOne({ guildId });
  if (!config) return;

  const channelId = getChannelForMode(config, mode);
  if (!channelId) return logger.warn('Smash', `Salon non configuré pour mode ${mode}`);

  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  let subject;
  if (mode === 'anime-auto')    subject = await fetchAnimeCharacter();
  else if (mode === 'animals-auto') subject = await fetchRandomAnimal();
  if (!subject) return;

  const embed = buildEmbed(subject, mode, [], []);
  const row   = buildButtons();

  const msg = await channel.send({ embeds: [embed], components: [row] });

  try {
    const thread = await msg.startThread({ name: `${subject.name} — Smash ou Pass ?`, autoArchiveDuration: 1440 });
    await thread.send(`💬 Discutez ici de **${subject.name}** !`);
    await Vote.create({ guildId, mode, subject, messageId: msg.id, channelId, threadId: thread.id });
  } catch (_) {
    await Vote.create({ guildId, mode, subject, messageId: msg.id, channelId });
  }

  logger.info('Smash', `[${mode}] Posté : ${subject.name}`);
}

async function handleVote(interaction, choice, voteId) {
  await interaction.deferUpdate();
  const vote = voteId
    ? await Vote.findById(voteId).catch(() => null)
    : await Vote.findOne({ guildId: interaction.guild.id, messageId: interaction.message.id });

  if (!vote || vote.closed) {
    return interaction.followUp({ content: '❌ Ce vote est fermé.', ephemeral: true });
  }

  const uid = interaction.user.id;

  if (choice === 'smash') {
    vote.passes  = vote.passes.filter(u => u !== uid);
    if (!vote.smashes.includes(uid)) vote.smashes.push(uid);
  } else {
    vote.smashes = vote.smashes.filter(u => u !== uid);
    if (!vote.passes.includes(uid)) vote.passes.push(uid);
  }

  await vote.save();
  // Bonus première action du jour
  try {
    const bonus = await xpSys.checkDailyGameBonus(uid, interaction.guildId, interaction.channelId, interaction.guild);
    if (bonus) await interaction.followUp({ content: `🎯 **+${bonus} XP bonus** — première action du jour dans Smash or Pass ! 💚`, ephemeral: true });
  } catch {}

  // Mission smash
  try {
    const { completeMission } = require('../missions');
    await completeMission(interaction.user.id, interaction.guildId, 'smash', interaction.guild);
  } catch {}

  const embed = buildEmbed(vote.subject, vote.mode, vote.smashes, vote.passes);
  await interaction.editReply({ embeds: [embed], components: interaction.message.components });
}

async function submitCommunity(client, guildId, mode, subject) {
  const config    = await Config.findOne({ guildId });
  const channelId = getChannelForMode(config, mode);
  if (!channelId) return false;

  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return false;

  const embed = buildEmbed(subject, mode, [], []);
  const row   = buildButtons();
  const msg   = await channel.send({ embeds: [embed], components: [row] });

  try {
    const thread = await msg.startThread({ name: `${subject.name} — Smash ou Pass ?`, autoArchiveDuration: 1440 });
    await Vote.create({ guildId, mode, subject, messageId: msg.id, channelId, threadId: thread.id });
  } catch (_) {
    await Vote.create({ guildId, mode, subject, messageId: msg.id, channelId });
  }
  return true;
}

async function getLeaderboard(guildId, mode, limit = 10) {
  const votes = await Vote.find({ guildId, mode, closed: false })
    .sort({ 'smashes': -1 })
    .limit(limit);

  return votes.map((v, i) => {
    const total = v.smashes.length + v.passes.length;
    const pct   = total ? Math.round((v.smashes.length / total) * 100) : 0;
    return { rank: i + 1, name: v.subject.name, smash: v.smashes.length, pass: v.passes.length, pct };
  });
}

function getChannelForMode(config, mode) {
  const map = {
    'anime-auto':        config?.animeChannelId,
    'anime-community':   config?.waifuChannelId,
    'animals-auto':      config?.animalsAutoChannelId,
    'animals-community': config?.animalsCommunityChannelId,
    'face-reveal':       config?.faceRevealChannelId,
  };
  return map[mode];
}

// ── Build embed avec vraies barres séparées ────────────────────────────────
function buildEmbed(subject, mode, smashes, passes) {
  const s = smashes.length;
  const p = passes.length;
  const total = s + p;
  const smashPct = total > 0 ? Math.round((s / total) * 100) : 0;
  const passPct  = total > 0 ? Math.round((p / total) * 100) : 0;

  const barLen   = 12;
  const smashBar = '█'.repeat(Math.round(smashPct / 100 * barLen)) + '░'.repeat(barLen - Math.round(smashPct / 100 * barLen));
  const passBar  = '█'.repeat(Math.round(passPct  / 100 * barLen)) + '░'.repeat(barLen - Math.round(passPct  / 100 * barLen));

  const modeNames = {
    'anime-auto':        '🎌 Anime Auto',
    'anime-community':   '🗳️ Waifu Communauté',
    'animals-auto':      '🐾 Animaux Auto',
    'animals-community': '🐶 Animaux Communauté',
    'face-reveal':       '💅 Face Reveal',
  };

  const embed = new EmbedBuilder()
    .setColor(COLORS.PINK)
    .setTitle(`${EMOJIS.SMASH} Smash or Pass — ${subject.name}`)
    .setImage(subject.imageUrl)
    .setFooter({ text: modeNames[mode] || mode });

  if (subject.extra) embed.setDescription(`*${subject.extra}*`);

  if (total === 0) {
    embed.addFields(
      { name: '💚 Smash', value: '`░░░░░░░░░░░░` 0 vote',  inline: true },
      { name: '💔 Pass',  value: '`░░░░░░░░░░░░` 0 vote',  inline: true },
    );
  } else {
    embed.addFields(
      { name: `💚 Smash — ${smashPct}%`, value: `\`${smashBar}\` **${s}** vote${s !== 1 ? 's' : ''}`, inline: true },
      { name: `💔 Pass — ${passPct}%`,   value: `\`${passBar}\` **${p}** vote${p !== 1 ? 's' : ''}`,   inline: true },
      { name: `📊 Total`,                value: `**${total}** vote${total !== 1 ? 's' : ''}`,             inline: true },
    );
  }

  return embed;
}

function buildButtons(voteId) {
  const suffix = voteId ? `:${voteId}` : '';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sop:smash${suffix}`).setLabel('💚 Smash').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sop:pass${suffix}`).setLabel('💔 Pass').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`sop:stats${suffix}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
  );
}

module.exports = { postSmash, handleVote, submitCommunity, getLeaderboard, fetchAnimeCharacter, fetchRandomAnimal, buildEmbed, buildButtons };
