// src/systems/reglement.js — Acceptation du règlement
'use strict';
const { COLORS } = require('../config/constants');
const Config = require('../db/models/Config');

async function handleAccepterReglement(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const cfg = await Config.findOne({ guildId: gid });

  if (!cfg?.confirmedRoleId) {
    return interaction.editReply({ content: '❌ Rôle membre non configuré. Utilisez `/setup role`.' });
  }

  const member = await interaction.guild.members.fetch(uid).catch(() => null);
  if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

  if (member.roles.cache.has(cfg.confirmedRoleId)) {
    return interaction.editReply({ content: '✅ Tu as déjà accepté le règlement !' });
  }

  await member.roles.add(cfg.confirmedRoleId).catch(() => {});
  return interaction.editReply({ content: '✅ Règlement accepté ! Bienvenue sur le serveur 🎉' });
}

module.exports = { handleAccepterReglement };
