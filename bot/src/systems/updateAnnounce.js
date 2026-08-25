// src/systems/updateAnnounce.js — Annonce automatiquement dans le salon configuré
// quand le bot redémarre avec une nouvelle version. Ne poste qu'UNE SEULE FOIS
// par version (même si Render redémarre le bot 50 fois dans la journée, sans
// que le code ait changé, chaque guilde garde en mémoire la dernière version
// déjà annoncée).
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const { CURRENT_VERSION, CHANGELOG } = require('../config/changelog');
const logger = require('../utils/logger');

async function announceUpdatesIfNeeded(client) {
  const configs = await Config.find({ botUpdatesChannelId: { $ne: null } }).lean().catch(() => []);

  for (const cfg of configs) {
    try {
      if (cfg.lastAnnouncedVersion === CURRENT_VERSION) continue; // déjà annoncé, rien à faire

      const guild = client.guilds.cache.get(cfg.guildId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(cfg.botUpdatesChannelId);
      if (!channel) continue;

      const bullets = CHANGELOG[CURRENT_VERSION];
      if (bullets?.length) {
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🤖 Mise à jour du bot — ${CURRENT_VERSION}`)
          .setDescription(bullets.map(b => `• ${b}`).join('\n'))
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
        logger.info('UpdateAnnounce', `${CURRENT_VERSION} annoncé sur ${guild.name}`);
      }

      await Config.updateOne({ guildId: cfg.guildId }, { lastAnnouncedVersion: CURRENT_VERSION });
    } catch (err) {
      logger.error('UpdateAnnounce', `Erreur guild ${cfg.guildId}`, err);
    }
  }
}

module.exports = { announceUpdatesIfNeeded };
