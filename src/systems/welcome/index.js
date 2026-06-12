// src/systems/welcome/index.js — Message de bienvenue automatique
'use strict';
const { EmbedBuilder } = require('discord.js');
const Config = require('../../db/models/Config');
const User   = require('../../db/models/User');
const logger = require('../../utils/logger');

async function handleWelcome(member) {
  try {
    const config = await Config.findOne({ guildId: member.guild.id });
    if (!config?.welcomeChannelId) return;

    const channel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!channel) return;

    // Compter les membres (humains seulement)
    const memberCount = member.guild.memberCount;

    // Compter les invitations de ce membre si inviteTracker actif
    let inviterText = '';
    try {
      const userDoc = await User.findOne({ guildId: member.guild.id, userId: member.id });
      if (userDoc?.invitedBy) {
        inviterText = `\nInvité(e) par <@${userDoc.invitedBy}> 🎉`;
      }
    } catch (_) {}

    // Message custom ou message par défaut
    const customMsg = config.welcomeMessage;

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('✨ Nouveau membre !')
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription(
        customMsg
          ? customMsg
              .replace('{user}', `<@${member.id}>`)
              .replace('{server}', member.guild.name)
              .replace('{count}', memberCount)
          : `Bienvenue <@${member.id}> ! 🎉\nGrâce à toi on est **${memberCount}** 👥`
      )
      .addFields(
        { name: '👤 Membre', value: `<@${member.id}>`, inline: true },
        { name: '🔢 Numéro', value: `#${memberCount}`, inline: true },
      )
      .setFooter({ text: member.guild.name, iconURL: member.guild.iconURL() })
      .setTimestamp();

    if (inviterText) {
      embed.addFields({ name: '📨 Invitation', value: inviterText.trim(), inline: false });
    }

    await channel.send({ embeds: [embed] });
    logger.info('Welcome', `Bienvenue envoyé pour ${member.user.tag}`);
  } catch (err) {
    logger.error('Welcome', 'Erreur bienvenue', err);
  }
}

module.exports = { handleWelcome };
