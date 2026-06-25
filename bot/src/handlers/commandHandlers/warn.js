// src/handlers/commandHandlers/warn.js — /warn (complet)
'use strict';
const { safeReply }              = require('../../utils/permissions');
const { addWarn, deleteWarn, clearWarns, getWarns } = require('../../systems/warn');
const { EmbedBuilder }           = require('discord.js');
const Config                     = require('../../db/models/Config');
const { COLORS }                 = require('../../config/constants');

module.exports = async function handleWarn(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });

  if (sub === 'ajouter') {
    const target = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison');
    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });
    if (target.id === interaction.user.id) return interaction.editReply({ content: '❌ Tu ne peux pas te warn toi-même.' });
    if (target.user.bot) return interaction.editReply({ content: '❌ Tu ne peux pas warn un bot.' });

    const { warn, totalWarns } = await addWarn(interaction.guild, target, interaction.member, raison, config);

    const embed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('⚠️ Avertissement ajouté')
      .addFields(
        { name: '👤 Membre',      value: `<@${target.id}>`,                  inline: true },
        { name: '🔢 Warn n°',     value: `${totalWarns}`,                    inline: true },
        { name: '📋 Raison',      value: raison,                             inline: false },
        { name: '🆔 ID Warn',     value: `\`${warn._id.toString().slice(-8).toUpperCase()}\``, inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'liste') {
    const target = interaction.options.getMember('membre');
    const tout   = interaction.options.getBoolean('tout') || false;
    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });

    const warns = await getWarns(guildId, target.id, !tout);
    if (!warns.length) {
      return interaction.editReply({ content: `✅ **${target.displayName}** n'a aucun warn${tout ? '' : ' actif'}.` });
    }

    const lines = warns.map((w, i) => {
      const date = w.createdAt.toLocaleDateString('fr-FR');
      const status = w.active ? '🔴' : '✅';
      return `${status} \`${w._id.toString().slice(-6).toUpperCase()}\` — **${w.reason}** — par <@${w.moderatorId}> — *${date}*`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📋 Warns de ${target.displayName}`)
      .setDescription(lines.join('\n').slice(0, 2000))
      .setFooter({ text: `${warns.filter(w => w.active).length} warn(s) actif(s) / ${warns.length} total` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'supprimer') {
    const id = interaction.options.getString('id');
    const warn = await deleteWarn(interaction.guild, id, interaction.member, config);
    if (!warn) return interaction.editReply({ content: `❌ Warn \`${id}\` introuvable ou déjà supprimé.` });
    return interaction.editReply({ content: `✅ Warn \`${id.slice(-6).toUpperCase()}\` supprimé. Le membre a été notifié.` });
  }

  if (sub === 'reset') {
    const target = interaction.options.getMember('membre');
    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });
    const count = await clearWarns(interaction.guild, target.id, interaction.member, config);
    return interaction.editReply({ content: `✅ **${count}** warn(s) supprimé(s) pour **${target.displayName}**.` });
  }
};
