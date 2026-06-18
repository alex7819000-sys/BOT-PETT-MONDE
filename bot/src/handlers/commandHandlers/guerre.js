// src/handlers/commandHandlers/guerre.js — Guerre Chien vs Chat
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const User = require('../../db/models/User');
const Config = require('../../db/models/Config');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'stats') {
    const [dogs, cats] = await Promise.all([
      User.aggregate([{ $match: { guildId: gid, team: 'dog' } }, { $group: { _id: null, xp: { $sum: '$teamXp' }, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { guildId: gid, team: 'cat' } }, { $group: { _id: null, xp: { $sum: '$teamXp' }, count: { $sum: 1 } } }]),
    ]);
    const dogXp = dogs[0]?.xp || 0, catXp = cats[0]?.xp || 0;
    const total = dogXp + catXp || 1;
    const dogBar = Math.floor((dogXp / total) * 20), catBar = 20 - dogBar;
    const embed = new EmbedBuilder()
      .setColor(COLORS.ORANGE)
      .setTitle('⚔️ Guerre — Chien vs Chat')
      .setDescription(`**🐶 Team Chien** ${'█'.repeat(dogBar)}${'░'.repeat(catBar)} **🐱 Team Chat**`)
      .addFields(
        { name: '🐶 Chiens', value: `${dogXp.toLocaleString()} XP — ${dogs[0]?.count || 0} membres`, inline: true },
        { name: '🐱 Chats', value: `${catXp.toLocaleString()} XP — ${cats[0]?.count || 0} membres`, inline: true },
      ).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'equipe') {
    const user = await User.findOne({ userId: interaction.user.id, guildId: gid });
    if (user?.team) return interaction.editReply({ content: `Tu es déjà dans la team **${user.team === 'dog' ? '🐶 Chien' : '🐱 Chat'}** !` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guerre:join:dog').setLabel('🐶 Team Chien').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('guerre:join:cat').setLabel('🐱 Team Chat').setStyle(ButtonStyle.Success),
    );
    return interaction.editReply({ content: '⚔️ Choisis ton camp !', components: [row] });
  }

  if (sub === 'membres') {
    const [dogs, cats] = await Promise.all([
      User.find({ guildId: gid, team: 'dog' }).sort({ teamXp: -1 }).limit(5),
      User.find({ guildId: gid, team: 'cat' }).sort({ teamXp: -1 }).limit(5),
    ]);
    const fmt = async (list) => (await Promise.all(list.map(async (u, i) => {
      const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
      return `${i + 1}. ${m?.displayName || `<@${u.userId}>`} — ${u.teamXp || 0} XP`;
    }))).join('\n') || 'Aucun';
    const embed = new EmbedBuilder().setColor(COLORS.ORANGE).setTitle('⚔️ Membres par équipe')
      .addFields(
        { name: '🐶 Top Chiens', value: await fmt(dogs), inline: true },
        { name: '🐱 Top Chats', value: await fmt(cats), inline: true },
      );
    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
