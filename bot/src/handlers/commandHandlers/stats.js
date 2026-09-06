// src/handlers/commandHandlers/stats.js — /stats croissance|actifs|vocal|salons
'use strict';
const { EmbedBuilder } = require('discord.js');
const { getGrowthStats, getDailyBreakdown } = require('../../systems/inviteTracker');
const { buildGrowthChartAttachment } = require('../../systems/growthChart');
const User = require('../../db/models/User');
const ChannelActivity = require('../../db/models/ChannelActivity');

const MEDALS = ['🥇', '🥈', '🥉'];

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

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

  if (sub === 'actifs') {
    const top = await User.find({ guildId: gid, totalXp: { $gt: 0 } })
      .sort({ totalXp: -1 }).limit(10).lean();

    const lines = top.length
      ? top.map((u, i) => `${MEDALS[i] || `**${i + 1}.**`} <@${u.userId}> — **${u.totalXp.toLocaleString('fr-FR')} XP**`)
      : ['Personne n\'a encore d\'XP.'];

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Top membres les plus actifs')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Classé sur l\'XP total (messages + vocal + bumps + confessions + quêtes...)' });

    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'vocal') {
    const top = await User.find({ guildId: gid, vocalMinutes: { $gt: 0 } })
      .sort({ vocalMinutes: -1 }).limit(10).lean();

    const fmtDuration = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
    };

    const lines = top.length
      ? top.map((u, i) => `${MEDALS[i] || `**${i + 1}.**`} <@${u.userId}> — **${fmtDuration(u.vocalMinutes)}**`)
      : ['Personne n\'a encore été en vocal.'];

    const embed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🎙️ Top membres les plus présents en vocal')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Cumul depuis toujours' });

    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'salons') {
    const top = await ChannelActivity.find({ guildId: gid, messageCount: { $gt: 0 } })
      .sort({ messageCount: -1 }).limit(10).lean();

    const lines = top.length
      ? top.map((c, i) => `${MEDALS[i] || `**${i + 1}.**`} <#${c.channelId}> — **${c.messageCount.toLocaleString('fr-FR')} messages**`)
      : ['Pas encore assez de messages enregistrés.'];

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('💬 Salons les plus actifs')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Suivi lancé récemment — les chiffres montent avec le temps' });

    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
