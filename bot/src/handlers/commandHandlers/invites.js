// src/handlers/commandHandlers/invites.js — /invites top | membre : qui a invité qui
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getInviteLeaderboard, getMemberInviteStats } = require('../../systems/inviteTracker');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'top') {
    const rows = await getInviteLeaderboard(gid, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.length
      ? rows.map((r, i) => `${medals[i] || `**${i + 1}.**`} <@${r.inviterId}> — **${r.stillHere}** encore là *(${r.total} au total, ${r.left} parti(s))*`)
      : ['Personne n\'a encore invité qui que ce soit.'];

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Top inviteurs')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Classé par nombre d\'invités toujours présents' });

    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'membre') {
    const target = interaction.options.getUser('membre') || interaction.user;
    const stats = await getMemberInviteStats(gid, target.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📨 Invitations de ${target.username}`)
      .addFields(
        { name: 'Total invités', value: `${stats.total}`, inline: true },
        { name: 'Encore présents', value: `${stats.stillHere}`, inline: true },
        { name: 'Repartis', value: `${stats.left}`, inline: true },
      );

    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
