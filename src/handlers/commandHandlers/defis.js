// src/handlers/commandHandlers/defis.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const {
  createDefi,
  getDefisListEmbed,
  lancerDefiQuotidien,
  lancerKingChallenge,
  KING_CHALLENGES,
  DAILY_DEFIS,
} = require('../../systems/defis');
const { requireAdmin } = require('../../utils/permissions');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── /defis liste ─────────────────────────────────────────────────────
  if (sub === 'liste') {
    await interaction.deferReply({ ephemeral: true });
    const embed = await getDefisListEmbed(interaction.guildId);
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /defis quotidien ──────────────────────────────────────────────────
  if (sub === 'quotidien') {
    if (!requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });
    const defi = await lancerDefiQuotidien(interaction.guild, interaction.client);
    if (!defi) return interaction.editReply({ content: '❌ Configure le salon défis : `/setup animation` → 🟢 Salon défis.' });
    return interaction.editReply({ content: `✅ Défi quotidien lancé : **${defi.title}**` });
  }

  // ── /defis king ───────────────────────────────────────────────────────
  if (sub === 'king') {
    if (!requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });
    const defi = await lancerKingChallenge(interaction.guild, interaction.client);
    if (!defi) return interaction.editReply({ content: '❌ Configure le salon défis : `/setup animation` → 🟢 Salon défis.' });
    return interaction.editReply({ content: `✅ King Challenge lancé : **${defi.title}**\n👑 Récompense : +${defi.rewardXp} XP + ${defi.rewardKakera} kakera` });
  }

  // ── /defis nioui ──────────────────────────────────────────────────────
  if (sub === 'nioui') {
    if (!requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });
    // Lancer le King Challenge Ni Oui Ni Non spécifiquement
    const defi = await lancerKingChallenge(interaction.guild, interaction.client, 'king_nioui');
    if (!defi) return interaction.editReply({ content: '❌ Configure le salon défis.' });
    return interaction.editReply({ content: `✅ Défi **Ni Oui Ni Non** lancé !\n> La surveillance est active dans tout le serveur.` });
  }

  // ── /defis creer ──────────────────────────────────────────────────────
  if (sub === 'creer') {
    if (!requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });
    const type     = interaction.options.getString('type') || 'custom';
    const titre    = interaction.options.getString('titre');
    const desc     = interaction.options.getString('description');
    const objectif = interaction.options.getInteger('objectif');
    const xp       = interaction.options.getInteger('xp') ?? 100;
    const kakera   = interaction.options.getInteger('kakera') ?? 300;
    const isKing   = interaction.options.getBoolean('king') ?? false;
    const role     = interaction.options.getRole('role');

    const result = await createDefi(interaction, {
      type,
      title:           titre,
      description:     desc,
      target:          objectif,
      rewardXp:        xp,
      rewardKakera:    kakera,
      rewardRoleId:    role?.id || null,
      isKingChallenge: isKing,
      durationHours:   24,
    });

    if (!result.success) return interaction.editReply({ content: '❌ Erreur lors de la création du défi.' });
    return interaction.editReply({ content: `✅ Défi créé dans ${result.channel}` });
  }
}

module.exports = { handle };
