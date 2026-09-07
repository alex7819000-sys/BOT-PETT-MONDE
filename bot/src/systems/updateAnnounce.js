// src/systems/updateAnnounce.js — Annonce automatiquement dans le salon configuré
// quand le bot redémarre avec une nouvelle version. Ne poste qu'UNE SEULE FOIS
// par version (même si Render redémarre le bot 50 fois dans la journée, sans
// que le code ait changé, chaque guilde garde en mémoire la dernière version
// déjà annoncée). Format changelog pro : Nouveautés / Modifié / Corrigé / Retiré.
'use strict';

const { EmbedBuilder } = require('discord.js');
const Config = require('../db/models/Config');
const { CURRENT_VERSION, CHANGELOG } = require('../config/changelog');
const logger = require('../utils/logger');

const CATEGORY_LABELS = {
  added:   '🆕 Nouveautés',
  changed: '♻️ Modifié',
  fixed:   '🔧 Corrigé',
  removed: '🗑️ Retiré',
};

// Découpe une liste de bullets en un ou plusieurs champs d'embed, en restant
// sous la limite de 1024 caractères par champ (Discord).
function buildFieldsForCategory(label, items) {
  const fields = [];
  let current = '';
  for (const item of items) {
    const line = `• ${item}\n`;
    if ((current + line).length > 1000) {
      fields.push({ name: label, value: current, inline: false });
      current = '';
      label = `${label} (suite)`;
    }
    current += line;
  }
  if (current) fields.push({ name: label, value: current, inline: false });
  return fields;
}

function buildChangelogEmbed(version, entry) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🤖 Mise à jour du bot — ${version}${entry.title ? ` : ${entry.title}` : ''}`)
    .setTimestamp();

  for (const key of ['added', 'changed', 'fixed', 'removed']) {
    const items = entry[key];
    if (items?.length) {
      embed.addFields(...buildFieldsForCategory(CATEGORY_LABELS[key], items));
    }
  }

  return embed;
}

async function announceUpdatesIfNeeded(client) {
  const configs = await Config.find({ botUpdatesChannelId: { $ne: null } }).lean().catch(() => []);

  for (const cfg of configs) {
    try {
      if (cfg.lastAnnouncedVersion === CURRENT_VERSION) continue; // déjà annoncé, rien à faire

      const guild = client.guilds.cache.get(cfg.guildId);
      if (!guild) continue;
      const channel = guild.channels.cache.get(cfg.botUpdatesChannelId);
      if (!channel) continue;

      const entry = CHANGELOG[CURRENT_VERSION];
      if (entry) {
        const embed = buildChangelogEmbed(CURRENT_VERSION, entry);
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
