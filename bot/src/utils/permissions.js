'use strict';
const { PermissionFlagsBits } = require('discord.js');

function requireAdmin(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    interaction.reply({ content: 'Commande reservee aux Administrateurs.', ephemeral: true });
    return false;
  }
  return true;
}
async function safeReply(interaction, options) {
  try {
    if (interaction.replied || interaction.deferred) return interaction.followUp(options);
    return interaction.reply(options);
  } catch { return null; }
}
function getWeekNumber() {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + 4 - (d.getDay()||7));
  const y = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d-y)/86400000)+1)/7);
}
function getCurrentYear() { return new Date().getFullYear(); }
module.exports = { requireAdmin, safeReply, getWeekNumber, getCurrentYear };
