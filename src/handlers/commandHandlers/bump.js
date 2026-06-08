// src/handlers/commandHandlers/bump.js — Classement + stats perso multi-sources
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getBumpLeaderboard, getUserBumpStats } = require('../../systems/bump');
const { COLORS, EMOJIS } = require('../../config/constants');

// ── /bumpstats — classement global ───────────────────────────────────────
async function handle(interaction) {
  await interaction.deferReply();

  const top   = await getBumpLeaderboard(interaction.guild.id, 10);
  if (!top.length) {
    return interaction.followUp({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.BLUE)
        .setTitle(`${EMOJIS.BUMP} Classement Bumps`)
        .setDescription('*Personne n\'a encore bumped !*')
    ]});
  }

  const medals = ['🥇', '🥈', '🥉'];

  const lines = await Promise.all(top.map(async (u, i) => {
    const m      = await interaction.guild.members.fetch(u.userId).catch(() => null);
    const name   = m?.displayName || `<@${u.userId}>`;
    const medal  = medals[i] || `**${i + 1}.**`;
    const detail = formatSources(u);
    return `${medal} ${name} — **${u.bumpCount}** total${detail}`;
  }));

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${EMOJIS.BUMP} Classement des Bumpeurs`)
    .setDescription(lines.join('\n'))
    .addFields({
      name: '📊 Sources comptabilisées',
      value: '🔵 Disboard  •  🟢 DiscordList Bump  •  🟡 DiscordList Vote  •  🔴 Top.gg',
      inline: false,
    })
    .setFooter({ text: `Serveur : ${interaction.guild.name}` })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

// ── /mabump — stats personnelles ─────────────────────────────────────────
async function handleMaBump(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('membre') || interaction.user;
  const u      = await getUserBumpStats(target.id, interaction.guild.id);

  if (!u || u.bumpCount === 0) {
    return interaction.followUp({
      content: `${target.id === interaction.user.id ? 'Tu n\'as' : `<@${target.id}> n\'a`} encore jamais bumped !`,
      ephemeral: true,
    });
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  const name   = member?.displayName || target.username;

  // Rang dans le classement
  const top = await getBumpLeaderboard(interaction.guild.id, 100);
  const rank = top.findIndex(x => x.userId === target.id) + 1;

  const embed = new EmbedBuilder()
    .setColor(COLORS.BLUE)
    .setTitle(`${EMOJIS.BUMP} Stats de ${name}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: '🏆 Total all-time', value: `**${u.bumpCount}** bumps/votes`, inline: true },
      { name: '📅 Cette semaine',  value: `**${u.bumpWeek || 0}**`,          inline: true },
      { name: '🎖️ Classement',    value: rank ? `**#${rank}**` : '*Non classé*', inline: true },
      {
        name: '📊 Détail par source',
        value: [
          `🔵 **Disboard** : ${u.bumpDisboard || 0}`,
          `🟢 **DiscordList Bump** : ${u.bumpDiscordList || 0}`,
          `🟡 **DiscordList Vote** : ${u.bumpDiscordListVote || 0}`,
          `🔴 **Top.gg** : ${u.bumpTopgg || 0}`,
        ].join('\n'),
        inline: false,
      }
    )
    .setTimestamp();

  await interaction.followUp({ embeds: [embed], ephemeral: true });
}

// ── Helper ────────────────────────────────────────────────────────────────
function formatSources(u) {
  const parts = [];
  if (u.bumpDisboard > 0)          parts.push(`🔵${u.bumpDisboard}`);
  if (u.bumpDiscordList > 0)       parts.push(`🟢${u.bumpDiscordList}`);
  if (u.bumpDiscordListVote > 0)   parts.push(`🟡${u.bumpDiscordListVote}`);
  if (u.bumpTopgg > 0)             parts.push(`🔴${u.bumpTopgg}`);
  return parts.length ? `  (${parts.join(' ')})` : '';
}

module.exports = { handle, handleMaBump };
