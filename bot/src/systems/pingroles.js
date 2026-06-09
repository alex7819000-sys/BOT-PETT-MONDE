// src/systems/pingroles.js — Toggle rôles de ping
'use strict';
const Config = require('../db/models/Config');

async function handlePingRoleToggle(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const gid = interaction.guild.id;
  const uid = interaction.user.id;
  const [, , roleKey] = interaction.customId.split(':'); // pingrole:toggle:ANNOUNCE
  const cfg = await Config.findOne({ guildId: gid });

  const roleMap = {
    ANNOUNCE: cfg?.announcePingRoleId,
    BOOST:    cfg?.boostPingRoleId,
    PARTNER:  cfg?.partnerPingRoleId,
    GIVEAWAY: cfg?.giveawayRoleId,
  };

  const roleId = roleMap[roleKey];
  if (!roleId) return interaction.editReply({ content: '❌ Rôle de ping non configuré.' });

  const member = await interaction.guild.members.fetch(uid).catch(() => null);
  if (!member) return interaction.editReply({ content: '❌ Membre introuvable.' });

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId).catch(() => {});
    return interaction.editReply({ content: `🔕 Tu ne seras plus pingé pour **${roleKey.toLowerCase()}**.` });
  } else {
    await member.roles.add(roleId).catch(() => {});
    return interaction.editReply({ content: `🔔 Tu seras maintenant pingé pour **${roleKey.toLowerCase()}**.` });
  }
}

module.exports = { handlePingRoleToggle };
