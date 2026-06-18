// src/handlers/commandHandlers/warn.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const { safeReply, requireLevel } = require('../../utils/permissions');
const { addWarn, deleteWarn, clearWarns, getWarns, getEscaladeMessage } = require('../../systems/warn');
const Config           = require('../../db/models/Config');

const COLORS = { WARN: 0xFFAA00, GREEN: 0x57F287, INFO: 0x5865F2, RED: 0xFF0000 };

module.exports = async function handleWarn(interaction) {
  const sub     = interaction.options.getSubcommand();

  // Reset réservé Admin+
  if (sub === 'reset') {
    const ok = await requireLevel(interaction, 'warn_reset');
    if (!ok) return;
  } else {
    const ok = await requireLevel(interaction, 'warn');
    if (!ok) return;
  }
  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });

  // ── /warn ajouter ──────────────────────────────────────────────────────────
  if (sub === 'ajouter') {
    const target = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');

    if (!target) return safeReply(interaction, { content: '❌ Membre introuvable.', ephemeral: true });
    if (target.user?.bot) return safeReply(interaction, { content: '❌ Impossible de warn un bot.', ephemeral: true });
    if (target.id === interaction.user.id) return safeReply(interaction, { content: '❌ Tu ne peux pas te warn toi-même.', ephemeral: true });
    if (target.permissions?.has('Administrator')) return safeReply(interaction, { content: '❌ Impossible de warn un administrateur.', ephemeral: true });
    // Vérifier que le modo ne warn pas quelqu'un de niveau supérieur ou égal
    const { getMemberLevel } = require('../../systems/hierarchy');
    const modLevel    = await getMemberLevel(interaction.member, interaction.guild.id);
    const targetLevel = await getMemberLevel(target, interaction.guild.id);
    if (targetLevel >= modLevel) return safeReply(interaction, { content: '❌ Tu ne peux pas warn un membre de rang égal ou supérieur au tien.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const { warn, totalWarns } = await addWarn(interaction.guild, target, interaction.member, reason, config);

    const embed = new EmbedBuilder()
      .setColor(COLORS.WARN)
      .setTitle('⚠️ Avertissement envoyé')
      .addFields(
        { name: '👤 Membre',        value: `<@${target.id}>`,       inline: true },
        { name: '🔢 Warn n°',       value: `**${totalWarns}**`,      inline: true },
        { name: '📋 Raison',        value: reason,                   inline: false },
        { name: '⚡ Prochain seuil', value: getEscaladeMessage(totalWarns), inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `ID: ${warn._id}` });

    return safeReply(interaction, { embeds: [embed] });
  }

  // ── /warn liste ────────────────────────────────────────────────────────────
  if (sub === 'liste') {
    const target     = interaction.options.getMember('membre');
    const showAll    = interaction.options.getBoolean('tout') || false;
    if (!target) return safeReply(interaction, { content: '❌ Membre introuvable.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const warns = await getWarns(guildId, target.id, !showAll);
    if (!warns.length) {
      return safeReply(interaction, {
        embeds: [new EmbedBuilder().setColor(COLORS.GREEN).setDescription(`✅ <@${target.id}> n'a aucun warn actif.`)],
      });
    }

    const lines = warns.slice(0, 20).map((w, i) => {
      const date = w.createdAt.toLocaleDateString('fr-FR');
      const status = w.active ? '🔴' : '✅';
      return `${status} **#${i + 1}** \`${w._id.toString().slice(-6).toUpperCase()}\` — ${w.reason} — par <@${w.moderatorId}> — *${date}*`;
    });

    const activeCount = warns.filter(w => w.active).length;

    const embed = new EmbedBuilder()
      .setColor(activeCount > 0 ? COLORS.WARN : COLORS.GREEN)
      .setTitle(`📋 Warns de ${target.displayName}`)
      .setDescription(lines.join('\n'))
      .addFields(
        { name: '🔴 Actifs',   value: `${activeCount}`,              inline: true },
        { name: '📊 Total',    value: `${warns.length}`,             inline: true },
        { name: '⚡ Escalade', value: getEscaladeMessage(activeCount), inline: true },
      )
      .setThumbnail(target.displayAvatarURL({ size: 64 }))
      .setTimestamp();

    return safeReply(interaction, { embeds: [embed] });
  }

  // ── /warn supprimer ────────────────────────────────────────────────────────
  if (sub === 'supprimer') {
    const warnId = interaction.options.getString('id');
    await interaction.deferReply({ ephemeral: true });

    const warn = await deleteWarn(interaction.guild, warnId, interaction.member, config);
    if (!warn) {
      return safeReply(interaction, { content: `❌ Warn \`${warnId}\` introuvable ou déjà supprimé.`, ephemeral: true });
    }

    return safeReply(interaction, {
      embeds: [new EmbedBuilder()
        .setColor(COLORS.GREEN)
        .setDescription(`✅ Warn \`${warnId}\` supprimé pour <@${warn.userId}>.\nRaison initiale : *${warn.reason}*`)
        .setTimestamp()],
    });
  }

  // ── /warn reset ────────────────────────────────────────────────────────────
  if (sub === 'reset') {
    const target = interaction.options.getMember('membre');
    if (!target) return safeReply(interaction, { content: '❌ Membre introuvable.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const count = await clearWarns(interaction.guild, target.id, interaction.member, config);

    return safeReply(interaction, {
      embeds: [new EmbedBuilder()
        .setColor(COLORS.GREEN)
        .setDescription(`✅ **${count}** warn${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''} pour <@${target.id}>.`)
        .setTimestamp()],
    });
  }
};
