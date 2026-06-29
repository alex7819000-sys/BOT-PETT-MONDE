// commandHandlers/faction.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const {
  createFaction, deleteFaction, listFactions,
  MAX_CUSTOM_FACTIONS, XP_COST_CREATE,
} = require('../../systems/faction');
const { COLORS } = require('../../config/constants');

module.exports = async function handleFaction(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const userId  = interaction.user.id;
  const isAdmin = interaction.member.permissions.has('Administrator');

  await interaction.deferReply({ ephemeral: true });

  // ── /faction liste ─────────────────────────────────────────────────────
  if (sub === 'liste') {
    const factions = await listFactions(guildId);
    if (!factions.length) {
      return interaction.editReply('Aucune faction active pour l\'instant.');
    }
    const lines = factions.map(f =>
      `${f.emoji} **${f.name}** — mot-clé : \`${f.keyword}\` — ${f.points} pts cette semaine${f.totalWins ? ` *(${f.totalWins} victoire${f.totalWins > 1 ? 's' : ''})*` : ''}${f.isDefault ? ' 🔒' : ''}`
    );
    const custom = factions.filter(f => !f.isDefault).length;
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('⚔️ Factions actives')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${custom}/${MAX_CUSTOM_FACTIONS} slots custom utilisés • Crée la tienne pour ${XP_COST_CREATE} XP` });
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /faction créer ─────────────────────────────────────────────────────
  if (sub === 'créer') {
    const name     = interaction.options.getString('nom');
    const keyword  = interaction.options.getString('motcle');
    const imageUrl = interaction.options.getString('image') || null;
    const emoji    = interaction.options.getString('emoji') || '⚔️';

    const result = await createFaction({ guildId, userId, name, keyword, imageUrl, emoji });
    if (!result.ok) return interaction.editReply(`❌ ${result.reason}`);

    return interaction.editReply(
      `✅ Faction **${name}** créée ! Mot-clé : \`${keyword.toLowerCase()}\`\n` +
      `Écris \`${keyword.toLowerCase()}\` dans le salon bataille pour rejoindre ta faction et lui donner des points.`
    );
  }

  // ── /faction supprimer ─────────────────────────────────────────────────
  if (sub === 'supprimer') {
    const keyword = interaction.options.getString('motcle');
    const result  = await deleteFaction({ guildId, userId, keyword, isAdmin });
    if (!result.ok) return interaction.editReply(`❌ ${result.reason}`);
    return interaction.editReply(`✅ Faction **${keyword}** supprimée.`);
  }
};
