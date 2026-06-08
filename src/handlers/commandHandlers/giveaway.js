// src/handlers/commandHandlers/giveaway.js — v5
'use strict';
const { createGiveaway, endGiveaway } = require('../../systems/giveaway');
const Giveaway = require('../../db/models/Giveaway');

// Parse "2h30m", "1j", "30m", "1h", "120" (minutes par défaut)
function parseDuration(str) {
  if (!str) return null;
  str = str.trim().toLowerCase();
  let total = 0;
  const regex = /(\d+)\s*(j|h|m|s|jour|heure|minute|seconde)?/gi;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const val  = parseInt(match[1]);
    const unit = (match[2] || 'm')[0];
    if (unit === 'j') total += val * 1440;
    else if (unit === 'h') total += val * 60;
    else if (unit === 'm') total += val;
    else if (unit === 's') total += val / 60;
    else total += val; // fallback minutes
  }
  return total > 0 ? total : null;
}

async function handle(interaction) {
  const isAdmin = interaction.memberPermissions?.has('ManageGuild') ||
                  interaction.memberPermissions?.has('Administrator');
  if (!isAdmin) {
    return interaction.reply({ content: '❌ Tu dois avoir la permission Gérer le serveur.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  // ── /giveaway creer ───────────────────────────────────────────────────
  if (sub === 'creer') {
    const prize    = interaction.options.getString('lot');
    const dureeStr = interaction.options.getString('duree');
    const winners  = interaction.options.getInteger('gagnants') || 1;

    const minutes = parseDuration(dureeStr);
    if (!minutes || minutes < 1) {
      return interaction.reply({
        content: '❌ Durée invalide. Exemples : `30m`, `2h`, `1j`, `1h30m`',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await createGiveaway(interaction, prize, minutes, winners);

    return result.success
      ? interaction.editReply({ content: `✅ Giveaway créé dans <#${result.channel.id}> !` })
      : interaction.editReply({ content: '❌ Erreur lors de la création.' });
  }

  // ── /giveaway terminer ────────────────────────────────────────────────
  if (sub === 'terminer') {
    const msgId = interaction.options.getString('message_id');
    const gw    = await Giveaway.findOne({ guildId: interaction.guildId, messageId: msgId, ended: false });
    if (!gw) {
      return interaction.reply({ content: '❌ Giveaway introuvable ou déjà terminé.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await endGiveaway(gw._id, interaction.guild);
    return interaction.editReply({ content: '✅ Giveaway terminé manuellement !' });
  }
}

module.exports = { handle };
