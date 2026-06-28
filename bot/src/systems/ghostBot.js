// src/systems/ghostBot.js — Ghost Bot : connexion vocale silencieuse 24/7
// Le bot rejoint un salon vocal et y reste, sans jamais parler ni jouer de son.
// Sert juste à occuper une place dans le vocal (présence visuelle, "salon actif"...).
'use strict';

const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const logger = require('../utils/logger');

// guildId → VoiceConnection — pour retrouver/fermer la connexion existante
const connections = new Map();

async function joinGhost(client, guildId, channelId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, reason: 'Serveur introuvable.' };

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased?.()) {
    return { ok: false, reason: 'Ce salon n\'est pas un salon vocal.' };
  }

  const me = guild.members.me;
  if (!channel.permissionsFor(me)?.has('Connect')) {
    return { ok: false, reason: `Je n'ai pas la permission de me connecter à ${channel.name}.` };
  }

  // Si déjà connecté ailleurs sur cette guild → on ferme avant de rejoindre le nouveau salon
  leaveGhost(guildId);

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,  // n'écoute jamais l'audio des autres
    selfMute: true,  // ne parle jamais
  });

  connections.set(guildId, connection);

  // Auto-reconnexion si Discord nous déconnecte (changement de région, redémarrage du salon...)
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // ça se reconnecte tout seul, rien à faire
    } catch {
      // Vraie déconnexion → on retente un join propre depuis la config
      connections.delete(guildId);
      connection.destroy();
      const Config = require('../db/models/Config');
      const cfg = await Config.findOne({ guildId }).lean().catch(() => null);
      if (cfg?.ghostBotChannelId) {
        logger.warn('GhostBot', `Déconnecté de ${guildId}, tentative de reconnexion...`);
        setTimeout(() => joinGhost(client, guildId, cfg.ghostBotChannelId).catch(() => {}), 5000);
      }
    }
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (err) {
    connections.delete(guildId);
    connection.destroy();
    return { ok: false, reason: 'Connexion au vocal impossible (timeout). Réessaie.' };
  }

  return { ok: true, channelName: channel.name };
}

function leaveGhost(guildId) {
  const existing = connections.get(guildId) || getVoiceConnection(guildId);
  if (existing) {
    existing.destroy();
    connections.delete(guildId);
    return true;
  }
  return false;
}

// Appelé au démarrage du bot — rejoint automatiquement tous les salons configurés,
// pour que la connexion survive à un redémarrage/redeploy (Render, crash, etc.)
async function reconnectAll(client) {
  const Config = require('../db/models/Config');
  const configs = await Config.find({ ghostBotChannelId: { $ne: null } }).lean().catch(() => []);
  for (const cfg of configs) {
    if (!cfg.ghostBotChannelId) continue;
    const result = await joinGhost(client, cfg.guildId, cfg.ghostBotChannelId).catch((e) => ({ ok: false, reason: e.message }));
    if (result.ok) {
      logger.info('GhostBot', `Reconnecté automatiquement dans ${result.channelName} (guild ${cfg.guildId})`);
    } else {
      logger.warn('GhostBot', `Échec reconnexion auto guild ${cfg.guildId} : ${result.reason}`);
    }
  }
}

function isConnected(guildId) {
  const conn = connections.get(guildId) || getVoiceConnection(guildId);
  return !!conn && conn.state.status !== VoiceConnectionStatus.Destroyed;
}

module.exports = { joinGhost, leaveGhost, reconnectAll, isConnected };
