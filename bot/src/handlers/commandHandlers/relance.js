'use strict';
// commandHandlers/relance.js

const { EmbedBuilder } = require('discord.js');
const { relanceMembers, relanceTous, COLORS } = require('../../systems/relance');

async function handle(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const sub     = interaction.options.getSubcommand();
  const guild   = interaction.guild;

  // ── /relance membre ──────────────────────────────────────────────────────
  if (sub === 'membre') {
    const target  = interaction.options.getMember('cible');
    const couleur = interaction.options.getString('couleur');

    if (!target) return interaction.editReply({ content: '❌ Membre introuvable.' });

    const res = await relanceMembers(guild, { userId: target.id, couleur });

    if (res.envoyes) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ECC71)
            .setDescription(`✅ DM de bienvenue renvoyé à <@${target.id}> !${couleur ? ` (couleur : ${couleur})` : ''}`)
        ]
      });
    } else {
      return interaction.editReply({ content: `❌ Impossible d'envoyer un DM à <@${target.id}> (DMs fermés ?).` });
    }
  }

  // ── /relance tous ────────────────────────────────────────────────────────
  if (sub === 'tous') {
    const couleur = interaction.options.getString('couleur');

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setDescription(`⏳ Envoi du DM de bienvenue à **tous les membres** du serveur...\nÇa peut prendre plusieurs minutes !`)
      ]
    });

    const res = await relanceTous(guild, { couleur });

    return interaction.followUp({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('📬 Relance terminée')
          .addFields(
            { name: '✅ DMs envoyés', value: String(res.envoyes), inline: true },
            { name: '❌ Échecs',       value: String(res.echecs),  inline: true },
          )
          .setFooter({ text: 'Membres avec DMs fermés comptabilisés en échecs' })
      ]
    });
  }
  if (sub === 'inactifs') {
    const jours   = interaction.options.getInteger('jours') ?? 7;
    const couleur = interaction.options.getString('couleur');

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setDescription(`⏳ Envoi en cours aux membres inactifs depuis **${jours} jours**...\nÇa peut prendre quelques minutes !`)
      ]
    });

    const res = await relanceMembers(guild, { couleur, joursInactif: jours });

    return interaction.followUp({
      ephemeral: true,
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📬 Relance terminée')
          .addFields(
            { name: '✅ DMs envoyés',  value: String(res.envoyes),  inline: true },
            { name: '❌ Échecs',        value: String(res.echecs),   inline: true },
            { name: '⏭️ Ignorés',      value: String(res.ignores),  inline: true },
          )
          .setFooter({ text: `Membres actifs depuis moins de ${jours} jours ignorés` })
      ]
    });
  }
}

module.exports = { handle };
