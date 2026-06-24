// src/systems/bumpReminder.js — Ping le rôle @Bumper toutes les 2h avec les infos de bump
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../config/constants');
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const cron = require('node-cron');

const BUMP_COMMANDS = {
  disboard: '/bump',
  topgg: '/vote (Top.gg)',
  dbl: '/vote (Discord Bot List)',
  voting: '/vote (Voting.com)',
};

const BUMP_PLATFORMS = {
  disboard: { name: 'Disboard', emoji: '🎮', field: 'bumpDisboard' },
  topgg: { name: 'Top.gg', emoji: '⭐', field: 'bumpTopgg' },
  dbl: { name: 'Discord Bot List', emoji: '🤖', field: 'bumpDBL' },
  voting: { name: 'Voting.com', emoji: '🗳️', field: 'bumpVoting' },
};

async function sendBumpReminder(guild, client) {
  try {
    const cfg = await Config.findOne({ guildId: guild.id }).lean().catch(() => null);
    if (!cfg?.bumpChannelId || !cfg?.bumpReminder) return; // Bump disabled or no channel set

    const channel = guild.channels.cache.get(cfg.bumpChannelId);
    if (!channel || !channel.isTextBased()) return;

    // Récupère le rôle Bumper
    const bumperRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('bumper'));
    if (!bumperRole) return; // Rôle Bumper non trouvé

    // Récupère le top 5 des bumpers du jour par plateforme
    const topToday = await User.find({ guildId: guild.id, bumpDay: { $gt: 0 } })
      .sort({ bumpDay: -1 })
      .limit(5)
      .lean();

    const topTodayLines = await Promise.all(
      topToday.map(async (u, i) => {
        const m = await guild.members.fetch(u.userId).catch(() => null);
        const disboardEmoji = u.bumpDisboard > 0 ? '🎮' : '';
        const name = m?.displayName || `<@${u.userId}>`;
        return `${i + 1}. ${name} ${disboardEmoji} **${u.bumpDay}** bumps`;
      })
    );

    // Embed principal avec les commandes
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`${EMOJIS.BUMP} Bump Time! 🚀`)
      .setDescription(`Hey ${bumperRole}! C'est l'heure de bumper le serveur!\n\n**Récompenses:**\n💥 **+500 XP** par bump\n⭐ **Top 10 des meilleurs bumpers** (King of the Day bonus!)\n👑 **Classements globaux** par plateforme`)
      .addFields(
        {
          name: '📋 Commandes de Bump',
          value: `**🎮 Disboard:** \`/bump\` (2 min de cooldown)\n**⭐ Top.gg:** \`/vote\` (12h)\n**🤖 DBL:** \`/vote\` (12h)\n**🗳️ Voting:** \`/vote\` (24h)`,
          inline: false,
        },
        {
          name: `📊 Top Bumpers Aujourd'hui`,
          value: topTodayLines.length > 0 ? topTodayLines.join('\n') : '*Aucun bump encore*',
          inline: false,
        }
      )
      .setThumbnail(guild.iconURL() || null)
      .setFooter({ text: 'Plus tu bumps, plus tu gagnes d\'XP! 💪' })
      .setTimestamp();

    // Ping du rôle
    await channel.send({
      content: `${bumperRole}`,
      embeds: [embed],
    }).catch(() => {});

  } catch (error) {
    console.error('Erreur bumpReminder:', error);
  }
}

function startBumpReminder(client) {
  // Toutes les 2 heures
  cron.schedule('0 */2 * * *', async () => {
    for (const guild of client.guilds.cache.values()) {
      await sendBumpReminder(guild, client).catch(() => {});
    }
  });

  console.log('✅ Bump reminder cron lancé (toutes les 2h)');
}

module.exports = { startBumpReminder, sendBumpReminder };
