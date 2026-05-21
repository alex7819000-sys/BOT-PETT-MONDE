// src/utils/permissions.js
'use strict';
const { PermissionFlagsBits } = require('discord.js');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function requireAdmin(interaction) {
  if (!isAdmin(interaction.member)) {
    interaction.reply({ content: '❌ Commande réservée aux administrateurs.', ephemeral: true });
    return false;
  }
  return true;
}

function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getCurrentYear() { return new Date().getFullYear(); }

function safeReply(interaction, opts) {
  try {
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(opts);
    }
    return interaction.reply(opts);
  } catch (_) {}
}

module.exports = { isAdmin, requireAdmin, getWeekNumber, getCurrentYear, safeReply };
