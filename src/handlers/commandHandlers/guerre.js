// src/handlers/commandHandlers/guerre.js
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getWarStats } = require('../../systems/guerre');
const User = require('../../db/models/User');
const { COLORS } = require('../../config/constants');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'stats') {
    await interaction.deferReply();
    const { dogs, cats, dogPct, catPct } = await getWarStats(interaction.guild.id);
    const bar = pct => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    const embed = new EmbedBuilder().setColor(COLORS.BLUE).setTitle('⚔️ Guerre Chien vs Chat — Semaine en cours')
      .addFields(
        { name: '🐶 Chiens', value: `\`${bar(dogPct)}\` ${dogs} pts (${dogPct}%)`, inline: false },
        { name: '🐱 Chats',  value: `\`${bar(catPct)}\` ${cats} pts (${catPct}%)`, inline: false },
      ).setTimestamp();
    return interaction.followUp({ embeds: [embed] });
  }

  if (sub === 'equipe') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('war:join:dog').setLabel('🐶 Chiens').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('war:join:cat').setLabel('🐱 Chats').setStyle(ButtonStyle.Success),
    );
    return interaction.reply({ content: 'Choisis ton équipe !', components: [row], ephemeral: true });
  }

  if (sub === 'membres') {
    await interaction.deferReply();
    const gid  = interaction.guild.id;
    const dogs = await User.find({ guildId: gid, team: 'dog' });
    const cats = await User.find({ guildId: gid, team: 'cat' });
    const embed = new EmbedBuilder().setColor(COLORS.BLUE).setTitle('⚔️ Membres de la Guerre')
      .addFields(
        { name: `🐶 Chiens (${dogs.length})`, value: dogs.slice(0,15).map(u => `<@${u.userId}>`).join(' ') || '*Aucun*', inline: true },
        { name: `🐱 Chats (${cats.length})`,  value: cats.slice(0,15).map(u => `<@${u.userId}>`).join(' ') || '*Aucun*', inline: true },
      );
    return interaction.followUp({ embeds: [embed] });
  }
}

module.exports = { handle };
