// src/handlers/commandHandlers/guerre.js — Guerre Chien vs Chat (stats + top membres)
// Pas de clan à rejoindre : tout le monde participe librement en écrivant "chien"/"chat" dans #bataille
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const User = require('../../db/models/User');
const Faction = require('../../db/models/Faction');

async function handle(interaction) {
  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'stats') {
    const [chien, chat] = await Promise.all([
      Faction.findOne({ guildId: gid, keyword: 'chien' }).lean(),
      Faction.findOne({ guildId: gid, keyword: 'chat' }).lean(),
    ]);
    const chienPts = chien?.points || 0, chatPts = chat?.points || 0;
    const total = chienPts + chatPts || 1;
    const chienBar = Math.floor((chienPts / total) * 20), chatBar = 20 - chienBar;
    const embed = new EmbedBuilder()
      .setColor(COLORS.ORANGE)
      .setTitle('⚔️ Guerre — Chien vs Chat')
      .setDescription(`**🐶 Chien** ${'█'.repeat(chienBar)}${'░'.repeat(chatBar)} **🐱 Chat**`)
      .addFields(
        { name: '🐶 Chien', value: `${chienPts.toLocaleString()} points`, inline: true },
        { name: '🐱 Chat',  value: `${chatPts.toLocaleString()} points`, inline: true },
      ).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'membres') {
    const users = await User.find({ guildId: gid, $or: [{ battleChienCount: { $gt: 0 } }, { battleChatCount: { $gt: 0 } }] }).lean();
    const sorted = users
      .map(u => ({ ...u, total: (u.battleChienCount || 0) + (u.battleChatCount || 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const lines = sorted.length
      ? await Promise.all(sorted.map(async (u, i) => {
          const m = await interaction.guild.members.fetch(u.userId).catch(() => null);
          return `${i + 1}. ${m?.displayName || `<@${u.userId}>`} — 🐶 ${u.battleChienCount || 0} · 🐱 ${u.battleChatCount || 0}`;
        }))
      : ['Personne n\'a encore participé.'];

    const embed = new EmbedBuilder()
      .setColor(COLORS.ORANGE)
      .setTitle('⚔️ Top membres — Bataille Chien vs Chat')
      .setDescription(lines.join('\n'));
    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
