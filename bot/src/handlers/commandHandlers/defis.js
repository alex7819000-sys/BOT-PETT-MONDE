// src/handlers/commandHandlers/defis.js
'use strict';
const { EmbedBuilder } = require('discord.js');
const { createDefi, getDefisListEmbed, lancerDefiVert, lancerGrosDefi, DEFI_TEMPLATES } = require('../../systems/defis');
const { requireAdmin } = require('../../utils/permissions');

// Parseur durée : "2h", "3j", "30m", "1j12h"
function parseDuration(str) {
  if (!str) return 168; // 7j par défaut
  let hours = 0;
  const days    = str.match(/(\d+)\s*j/i);
  const hrs     = str.match(/(\d+)\s*h/i);
  const minutes = str.match(/(\d+)\s*m/i);
  if (days)    hours += parseInt(days[1]) * 24;
  if (hrs)     hours += parseInt(hrs[1]);
  if (minutes) hours += parseInt(minutes[1]) / 60;
  return hours > 0 ? hours : 168;
}

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();

  // ── /defis vert ───────────────────────────────────────────────────────
  if (sub === 'vert') {
    if (!requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });
    const defi = await lancerDefiVert(interaction.guild, interaction.client);
    if (!defi) return interaction.editReply({ content: '❌ Configure d\'abord le salon défis dans `/setup animation`.' });
    return interaction.editReply({ content: `✅ Défi vert lancé ! Double XP activé pour tous jusqu\'à minuit.` });
  }

  // ── /defis gros ───────────────────────────────────────────────────────
  if (sub === 'gros') {
    if (!requireAdmin(interaction)) return;
    await interaction.deferReply({ ephemeral: true });
    const defi = await lancerGrosDefi(interaction.guild, interaction.client);
    if (!defi) return interaction.editReply({ content: '❌ Configure d\'abord le salon défis dans `/setup animation`.' });
    return interaction.editReply({ content: `🔥 Gros défi lancé ! Double XP activé pour tous jusqu\'à minuit.` });
  }

  // ── /defis creer ─────────────────────────────────────────────────────
  if (sub === 'creer') {
    if (!requireAdmin(interaction)) return;

    const type         = interaction.options.getString('type') || 'custom';
    const titre        = interaction.options.getString('titre');
    const description  = interaction.options.getString('description');
    const target       = interaction.options.getInteger('objectif');
    const duree        = interaction.options.getString('duree') || '7j';
    const rewardXp     = interaction.options.getInteger('xp')     ?? null;
    const rewardKakera = interaction.options.getInteger('kakera') ?? null;
    const rewardRole   = interaction.options.getRole('role');

    const durationHours = parseDuration(duree);

    const tmpl = DEFI_TEMPLATES.find(t => t.type === type) || DEFI_TEMPLATES[4];

    const result = await createDefi(interaction, {
      type,
      title:         titre || tmpl.title,
      description:   description || tmpl.description,
      target:        target ?? tmpl.defaultTarget,
      durationHours,
      rewardXp:      rewardXp  ?? tmpl.defaultXp,
      rewardKakera:  rewardKakera ?? tmpl.defaultKakera,
      rewardRoleId:  rewardRole?.id || null,
    });

    if (result.success) {
      return interaction.reply({
        content: `✅ Défi **${titre || tmpl.title}** créé dans <#${result.channel.id}> ! Durée : ${duree}`,
        ephemeral: true,
      });
    } else {
      return interaction.reply({ content: '❌ Erreur lors de la création du défi.', ephemeral: true });
    }
  }

  // ── /defis liste ─────────────────────────────────────────────────────
  if (sub === 'liste') {
    const embed = await getDefisListEmbed(interaction.guildId);
    return interaction.reply({ embeds: [embed] });
  }
}

module.exports = { handle };
