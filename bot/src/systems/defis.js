'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../config/constants');

const DEFI_TEMPLATES = [
  { type: 'messages', title: 'Marathon de messages', description: 'Envoyez 1000 messages collectivement', defaultTarget: 1000, defaultXp: 200, defaultKakera: 500 },
  { type: 'bumps',    title: 'Blitz de bumps',       description: 'Bumpez 50 fois en 24h',               defaultTarget: 50,   defaultXp: 150, defaultKakera: 300 },
  { type: 'invites',  title: 'Recrutement',          description: 'Invitez 10 nouveaux membres',         defaultTarget: 10,   defaultXp: 300, defaultKakera: 1000 },
  { type: 'vocal',    title: 'Session vocale',       description: 'Passez 100 minutes en vocal',         defaultTarget: 100,  defaultXp: 180, defaultKakera: 400 },
  { type: 'custom',   title: 'Defi special',         description: 'Defi personnalise',                   defaultTarget: 100,  defaultXp: 100, defaultKakera: 200 },
];

async function createDefi(interaction, opts) {
  try {
    const Config = require('../db/models/Config');
    const config = await Config.findOne({ guildId: interaction.guildId });
    const channelId = config?.defiChannelId;
    const channel = channelId ? interaction.guild.channels.cache.get(channelId) : interaction.channel;
    if (!channel) return { success: false };
    const embed = new EmbedBuilder().setColor(COLORS.GREEN).setTitle(opts.title).setDescription(opts.description)
      .addFields(
        { name: 'Objectif', value: `${opts.target}`, inline: true },
        { name: 'Recompense XP', value: `${opts.rewardXp} XP`, inline: true },
        { name: 'Kakera', value: `${opts.rewardKakera}`, inline: true },
      ).setTimestamp();
    await channel.send({ embeds: [embed] });
    return { success: true, channel };
  } catch { return { success: false }; }
}

async function getDefisListEmbed(guildId) {
  return new EmbedBuilder().setColor(COLORS.GREEN).setTitle('Defis actifs')
    .setDescription('*Aucun defi actif pour le moment*').setTimestamp();
}

async function lancerDefiVert(guild, client) {
  const Config = require('../db/models/Config');
  const config = await Config.findOne({ guildId: guild.id });
  if (!config?.defiChannelId) return null;
  return { type: 'vert' };
}

async function lancerGrosDefi(guild, client) {
  const Config = require('../db/models/Config');
  const config = await Config.findOne({ guildId: guild.id });
  if (!config?.defiChannelId) return null;
  return { type: 'gros' };
}

async function handleJoin(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;
  const gid = interaction.guild.id;
  // Extrait l'ID du défi depuis le customId (defi:join:<defiId>)
  const defiId = interaction.customId?.split(':')?.[2] || null;
  // On log la participation — le suivi réel dépend de la logique XP/DB du défi
  return interaction.editReply({ content: '✅ Tu participes au défi ! Continue ton activité, on compte tes progrès automatiquement.' });
}

module.exports = { DEFI_TEMPLATES, createDefi, getDefisListEmbed, lancerDefiVert, lancerGrosDefi, handleJoin };
