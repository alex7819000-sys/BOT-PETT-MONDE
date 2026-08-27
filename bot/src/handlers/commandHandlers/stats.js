// src/handlers/commandHandlers/stats.js — /stats croissance : vue détaillée
// (résumé 24h/7j/30j + jour par jour + graphique visuel)
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getGrowthStats, getDailyBreakdown } = require('../../systems/inviteTracker');
const { buildGrowthChartAttachment } = require('../../systems/growthChart');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();

  if (sub === 'croissance') {
    const periodeOpt = interaction.options.getString('periode') || '14';
    const days = parseInt(periodeOpt, 10);

    const [stats, daily] = await Promise.all([
      getGrowthStats(interaction.guild.id),
      getDailyBreakdown(interaction.guild.id, days),
    ]);

    const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

    // Meilleur jour / pire jour sur la période affichée
    const bestDay = [...daily].sort((a, b) => b.net - a.net)[0];
    const worstDay = [...daily].sort((a, b) => a.net - b.net)[0];
    const totalJoins = daily.reduce((s, d) => s + d.joins, 0);
    const totalLeaves = daily.reduce((s, d) => s + d.leaves, 0);
    const avgPerDay = (totalJoins / daily.length).toFixed(1);
    const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📈 Croissance — ${interaction.guild.name}`)
      .addFields(
        { name: '👥 Membres actuels', value: `**${interaction.guild.memberCount}**`, inline: false },
        { name: '📅 24h', value: `📥 ${stats['24h'].joins}\n📤 ${stats['24h'].leaves}\n📊 ${fmt(stats['24h'].net)}`, inline: true },
        { name: '📅 7 jours', value: `📥 ${stats['7j'].joins}\n📤 ${stats['7j'].leaves}\n📊 ${fmt(stats['7j'].net)}`, inline: true },
        { name: '📅 30 jours', value: `📥 ${stats['30j'].joins}\n📤 ${stats['30j'].leaves}\n📊 ${fmt(stats['30j'].net)}`, inline: true },
        {
          name: `📊 Détail sur ${days} jours`,
          value: [
            `Moyenne : **${avgPerDay} arrivées/jour**`,
            `Total période : **${totalJoins} arrivées**, **${totalLeaves} départs**`,
            bestDay ? `🟢 Meilleur jour : **${fmtDate(bestDay.date)}** (${fmt(bestDay.net)})` : null,
            worstDay && worstDay.net < 0 ? `🔴 Pire jour : **${fmtDate(worstDay.date)}** (${fmt(worstDay.net)})` : null,
          ].filter(Boolean).join('\n'),
          inline: false,
        },
      )
      .setImage('attachment://croissance.png')
      .setFooter({ text: `Graphique sur les ${days} derniers jours` })
      .setTimestamp();

    const attachment = await buildGrowthChartAttachment(daily, `Arrivées / départs — ${days} derniers jours`);

    return interaction.editReply({ embeds: [embed], files: [attachment] });
  }
}

module.exports = { handle };
