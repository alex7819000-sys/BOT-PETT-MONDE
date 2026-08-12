// handlers/commandHandlers/counting.js — Commandes counting
'use strict';
const CountingError = require('../../db/models/CountingError');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

module.exports = {
  handle: async (interaction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'stats') {
      // /counting stats [@user]
      const target = interaction.options.getUser('user') || interaction.user;
      const gid = interaction.guild.id;

      const countingError = await CountingError.findOne({
        userId: target.id,
        guildId: gid
      });

      if (!countingError || countingError.errorCount === 0) {
        return interaction.reply({
          content: `✅ **${target.username}** n'a pas d'erreurs counting. C'est un champion ! 🏆`,
          ephemeral: true
        });
      }

      // Compter les erreurs récentes (24h)
      const day24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = countingError.errorLog.filter(e => new Date(e.timestamp) > day24).length;

      // Construire l'embed
      const embed = {
        color: 0xFF6B6B,
        title: `📊 Stats Counting — ${target.username}`,
        fields: [
          {
            name: '🔴 Erreurs totales',
            value: `**${countingError.errorCount}**`,
            inline: true
          },
          {
            name: '⏰ Erreurs (24h)',
            value: `**${recent}**`,
            inline: true
          },
          {
            name: '💥 Meilleure séquence cassée',
            value: countingError.errorLog.length > 0
              ? `**${Math.max(...countingError.errorLog.map(e => e.streakBroken || 0))}**`
              : 'N/A',
            inline: true
          }
        ],
        description: ''
      };

      // Ajouter dernières erreurs
      if (countingError.errorLog.length > 0) {
        const last3 = countingError.errorLog.slice(-3).reverse();
        const errorsStr = last3.map((e, i) => {
          const date = new Date(e.timestamp).toLocaleString('fr-FR', { 
            day: '2-digit', 
            month: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          return `#${countingError.errorCount - i}: Attendu ${e.expected}, a écrit ${e.given} (cassa ${e.streakBroken}) — ${date}`;
        }).join('\n');
        
        embed.fields.push({
          name: '🔍 Dernières erreurs',
          value: `\`\`\`${errorsStr}\`\`\``,
          inline: false
        });
      }

      // Mute actif?
      if (countingError.muteActive && countingError.muteUntil) {
        const remaining = new Date(countingError.muteUntil) - new Date();
        if (remaining > 0) {
          embed.fields.push({
            name: '🔇 Mute actif',
            value: `Encore **${Math.ceil(remaining / 1000)}s** de silence`,
            inline: false
          });
          embed.color = 0xFFA500; // Orange
        }
      }

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'reset') {
      // /counting reset [@user] — ADMIN ONLY
      const { hasPermission } = require('../../utils/permissions');
      if (!await hasPermission(interaction.member, 'ADMIN')) {
        return interaction.reply({
          content: '❌ Permission insuffisante (Admin+ requis)',
          ephemeral: true
        });
      }

      const target = interaction.options.getUser('user');
      const gid = interaction.guild.id;

      await CountingError.updateOne(
        { userId: target.id, guildId: gid },
        { errorCount: 0, errorLog: [], muteActive: false, muteUntil: null }
      );

      logger.info('Counting', `${interaction.user.tag} reset errors for ${target.tag}`);

      return interaction.reply({
        content: `✅ Erreurs de counting de **${target.username}** réinitialisées.`,
        ephemeral: true
      });
    }
  }
};
