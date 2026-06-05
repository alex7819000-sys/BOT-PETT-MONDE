// src/systems/chatrevive/index.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

const REVIVE_MESSAGES = [
  '💬 Le chat est silencieux... quelqu\'un a quelque chose à dire ? 👀',
  '🔔 Ça fait un moment qu\'on n\'entend personne ! Venez papoter 💬',
  '👋 Hey ! Le chat s\'ennuie, animez tout ça !',
  '🌐 PETIT MONDE est là mais le chat est vide... 😴 Réveillez-vous !',
  '🎤 Micro ouvert, personne ne parle... quelqu\'un ? 👀',
  '💭 Et si on parlait de quelque chose ? Le chat attend ! 🔥',
  '🐒 Même le singe se demande pourquoi c\'est si calme ici...',
  '👑 Le roi attend que ses sujets parlent ! Animez le chat !',
];

async function checkChatRevive(client, guildId) {
  const now  = new Date();
  const hour = now.getHours();
  if (hour < 16 || hour >= 22) return;

  const config = await Config.findOne({ guildId });
  if (!config?.chatReviveChannelId) return;

  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.chatReviveChannelId);
  if (!channel) return;

  const intervalMin = config.chatReviveIntervalMin || 90;
  const lastMsg     = config.chatReviveLastMessage;

  if (lastMsg) {
    const elapsedMin = (now - new Date(lastMsg)) / 60000;
    if (elapsedMin < intervalMin) return;
  } else {
    try {
      const messages = await channel.messages.fetch({ limit: 1 });
      const last = messages.first();
      if (last) {
        const elapsedMin = (now - last.createdAt) / 60000;
        if (elapsedMin < intervalMin) {
          await Config.updateOne({ guildId }, { chatReviveLastMessage: last.createdAt });
          return;
        }
      }
    } catch (_) {}
  }

  const text  = REVIVE_MESSAGES[Math.floor(Math.random() * REVIVE_MESSAGES.length)];
  const embed = new EmbedBuilder()
    .setColor(0xFF9800)
    .setDescription(text)
    .setFooter({ text: 'Chat Revive • Venez discuter !' });

  await channel.send({ embeds: [embed] });
  await Config.updateOne({ guildId }, { chatReviveLastMessage: now });
  logger.info('ChatRevive', 'Ping envoyé');
}

module.exports = { checkChatRevive };
