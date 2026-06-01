// src/handlers/commandHandlers/singe.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { nominate } = require('../../systems/singe');
const Nomination   = require('../../db/models/Nomination');
const User         = require('../../db/models/User');
const Config       = require('../../db/models/Config');
const { COLORS, EMOJIS } = require('../../config/constants');
const { getWeekNumber, getCurrentYear } = require('../../utils/permissions');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'nominer') {
    const target = interaction.options.getMember('membre');
    return nominate(interaction, target);
  }

  if (sub === 'stats') {
    await interaction.deferReply();
    const week = getWeekNumber(), year = getCurrentYear();
    const agg = await Nomination.aggregate([
      { $match: { guildId: gid, type: 'singe', week, year } },
      { $group: { _id: '$targetId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 5 },
    ]);
    const lines = await Promise.all(agg.map(async (a, i) => {
      const m = await interaction.guild.members.fetch(a._id).catch(() => null);
      return `**${i + 1}.** ${m?.displayName || `<@${a._id}>`} — ${a.count} nomination(s)`;
    }));
    const embed = new EmbedBuilder().setColor(COLORS.RED).setTitle(`${EMOJIS.SINGE} Nominations Singe — Semaine en cours`)
      .setDescription(lines.join('\n') || '*Aucune nomination*').setTimestamp();
    return interaction.followUp({ embeds: [embed] });
  }

  if (sub === 'actuel') {
    await interaction.deferReply();
    const config = await Config.findOne({ guildId: gid });
    if (!config?.currentMonkeyId) return interaction.followUp({ content: '*Aucun singe élu cette semaine*' });
    const m = await interaction.guild.members.fetch(config.currentMonkeyId).catch(() => null);
    const user = await User.findOne({ userId: config.currentMonkeyId, guildId: gid });
    const embed = new EmbedBuilder().setColor(COLORS.RED).setTitle(`${EMOJIS.SINGE} Singe actuel`)
      .setDescription(`**${m?.displayName || 'Inconnu'}** est le singe cette semaine !`)
      .addFields({ name: 'Fautes', value: `${user?.monkeyFaults || 0}`, inline: true })
      .setThumbnail(m?.displayAvatarURL() || null);
    return interaction.followUp({ embeds: [embed] });
  }
}

module.exports = { handle };
