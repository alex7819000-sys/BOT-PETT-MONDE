// src/systems/smash.js — Smash or Pass : juste 2 emoji en réaction (configurables via /setup)
'use strict';
const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const { COLORS } = require('../config/constants');

// Poste un Smash or Pass : embed avec l'image + les 2 emoji configurés en réaction. C'est tout.
async function postSmashOrPass(channel, guildId, { title, imageUrl, footer }) {
  const cfg = await Config.findOne({ guildId }).lean().catch(() => null);
  const smashEmoji = cfg?.smashEmoji || '🔥';
  const passEmoji = cfg?.passEmoji || '💀';

  const embed = new EmbedBuilder()
    .setColor(COLORS.PINK)
    .setTitle(title)
    .setImage(imageUrl);
  if (footer) embed.setFooter({ text: footer });

  const msg = await channel.send({ embeds: [embed] });
  await msg.react(smashEmoji).catch(() => {});
  await msg.react(passEmoji).catch(() => {});
  return msg;
}

module.exports = { postSmashOrPass };
