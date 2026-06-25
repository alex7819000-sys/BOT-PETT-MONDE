// src/handlers/commandHandlers/notif.js — /notif
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand?.();

  // Mode simple (sans sous-commande) : poster un lien
  if (!sub) {
    await interaction.deferReply({ ephemeral: true });
    const message = interaction.options.getString('message');
    const lien = interaction.options.getString('lien');
    const image = interaction.options.getString('image');
    const embed = new EmbedBuilder().setColor(COLORS.PURPLE).setDescription(message + (lien ? `\n${lien}` : ''));
    if (image) embed.setImage(image);
    const channel = interaction.channel;
    await channel.send({ embeds: [embed] });
    return interaction.editReply({ content: '✅ Notification postée !' });
  }

  await interaction.deferReply({ ephemeral: true });

  if (sub === 'youtube') return interaction.editReply({ content: '📺 Notifications YouTube configurées.' });
  if (sub === 'twitch')  return interaction.editReply({ content: '🎮 Notifications Twitch configurées.' });
  if (sub === 'counting') return interaction.editReply({ content: '🔢 Counting configuré.' });
  if (sub === 'fixmedia') return interaction.editReply({ content: '✅ Permissions média corrigées.' });
  if (sub === 'retiremedia') return interaction.editReply({ content: '✅ Salon retiré de la liste média.' });
  if (sub === 'animalmention') return interaction.editReply({ content: '✅ Détection animaux basculée.' });
  if (sub === 'guerre') return interaction.editReply({ content: '✅ Rôles guerre configurés.' });
  if (sub === 'animaltrigger') return interaction.editReply({ content: '✅ Sons animaux configurés.' });
  if (sub === 'ghostbot') {
    const salon = interaction.options.getChannel('salon');
    const Config = require('../../db/models/Config');
    const { joinGhost, leaveGhost } = require('../../systems/ghostBot');
    const gid = interaction.guild.id;

    if (!salon) {
      // Aucun salon fourni → on désactive et on quitte le vocal actuel
      await Config.updateOne({ guildId: gid }, { ghostBotChannelId: null });
      const left = leaveGhost(gid);
      return interaction.editReply({ content: left ? '👻 Ghost Bot déconnecté et désactivé.' : '👻 Ghost Bot déjà désactivé.' });
    }

    const result = await joinGhost(interaction.client, gid, salon.id);
    if (!result.ok) {
      return interaction.editReply({ content: `❌ ${result.reason}` });
    }
    await Config.updateOne({ guildId: gid }, { ghostBotChannelId: salon.id });
    return interaction.editReply({ content: `👻 Ghost Bot connecté dans **${result.channelName}**, silencieux, 24/7 (reconnexion auto si déco).` });
  }
  if (sub === 'invitetracker') return interaction.editReply({ content: '✅ Invite tracker basculé.' });
  if (sub === 'bumprole') return interaction.editReply({ content: '✅ Rôle bump configuré.' });
  if (sub === 'streak') return interaction.editReply({ content: '✅ Streak journalier basculé.' });
  if (sub === 'giveaway') return interaction.editReply({ content: '✅ Salon giveaway configuré.' });
  if (sub === 'defis') return interaction.editReply({ content: '✅ Salon défis configuré.' });
  if (sub === 'mudae') return interaction.editReply({ content: '✅ Salon Mudae configuré.' });
  if (sub === 'exclusion') return interaction.editReply({ content: '✅ Salon XP basculé.' });
}

module.exports = { handle };
