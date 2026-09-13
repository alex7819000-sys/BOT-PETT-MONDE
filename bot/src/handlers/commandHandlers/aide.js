// src/handlers/commandHandlers/aide.js — /aide : liste toutes les commandes du bot,
// générée dynamiquement depuis buildCommands() (la vraie source de vérité envoyée à
// Discord). Toujours à jour automatiquement — pas de liste à maintenir à la main.
'use strict';
const { EmbedBuilder } = require('discord.js');

async function handle(interaction) {
  const { buildCommands } = require('../commands');
  const commands = buildCommands(); // déjà du JSON brut (.map(cmd => cmd.toJSON()) fait dans commands.js)

  const lines = [];
  for (const json of commands) {
    if (json.name === 'aide') continue; // pas la peine de se citer soi-même

    const locked = json.default_member_permissions ? ' 🔒' : '';
    const subcommands = (json.options || []).filter(o => o.type === 1); // SUB_COMMAND

    if (subcommands.length) {
      const subList = subcommands.map(s => `\`/${json.name} ${s.name}\` — ${s.description}`).join('\n');
      lines.push(`**/${json.name}**${locked}\n${subList}`);
    } else {
      lines.push(`**/${json.name}**${locked} — ${json.description}`);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📖 Commandes disponibles')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: '🔒 = réservé au staff/admin' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { handle };
