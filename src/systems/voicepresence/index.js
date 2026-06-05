// src/systems/voicepresence/index.js — Ghost Bot vocal silencieux 24/7
'use strict';
const { joinVoiceChannel, VoiceConnectionStatus, entersState, createAudioPlayer, NoSubscriberBehavior } = require('@discordjs/voice');
const logger = require('../../utils/logger');

let connection = null;
let reconnectTimer = null;
let targetChannelId = null;
let targetGuildId   = null;
let clientRef       = null;

async function startVoicePresence(client, guildId, channelId) {
  clientRef       = client;
  targetGuildId   = guildId;
  targetChannelId = channelId;
  await connect();
}

async function connect() {
  if (!clientRef || !targetGuildId || !targetChannelId) return;

  const guild   = clientRef.guilds.cache.get(targetGuildId);
  const channel = guild?.channels.cache.get(targetChannelId);
  if (!channel) return logger.warn('GhostBot', 'Canal vocal introuvable');

  try {
    connection = joinVoiceChannel({
      channelId:      targetChannelId,
      guildId:        targetGuildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf:       true,
      selfMute:       true,
    });

    // Lecteur audio silencieux (évite le timeout de déconnexion)
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    connection.subscribe(player);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      logger.warn('GhostBot', 'Déconnecté — tentative reconnexion dans 5s');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(), 5000);
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      connection = null;
      logger.warn('GhostBot', 'Connexion détruite — reconnexion dans 10s');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(), 10000);
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    logger.info('GhostBot', `Connecté au canal vocal ${targetChannelId}`);
  } catch (err) {
    logger.error('GhostBot', 'Connexion échouée', err);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(), 15000);
  }
}

function stopVoicePresence() {
  clearTimeout(reconnectTimer);
  if (connection) {
    connection.destroy();
    connection = null;
  }
  targetChannelId = null;
  logger.info('GhostBot', 'Présence vocale arrêtée');
}

module.exports = { startVoicePresence, stopVoicePresence };
