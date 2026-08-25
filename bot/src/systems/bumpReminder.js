// src/systems/bumpReminder.js — Ping le rôle @Bumper pile 2h après le dernier bump réussi
// (et non plus sur un horaire fixe qui pouvait tomber en avance ou en retard selon
// le moment réel où quelqu'un avait bumpé).
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../config/constants');
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const cron = require('node-cron');

const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h — le vrai cooldown Disboard

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

async function sendBumpReminder(guild) {
  try {
    const cfg = await Config.findOne({ guildId: guild.id }).lean().catch(() => null);
    if (!cfg?.bumpChannelId || !cfg?.bumpReminder) return; // Bump disabled or no channel set

    const channel = guild.channels.cache.get(cfg.bumpChannelId);
    if (!channel || !channel.isTextBased()) return;

    // Récupère le rôle Bumper — priorité au rôle configuré via /notif bumprole,
    // sinon on retombe sur la recherche par nom (comportement historique)
    const bumperRole = (cfg.bumperRoleId && guild.roles.cache.get(cfg.bumperRoleId))
      || guild.roles.cache.find(r => r.name.toLowerCase().includes('bumper'));
    if (!bumperRole) return; // Aucun rôle Bumper configuré ni trouvé par nom

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
      .setDescription(`Hey ${bumperRole}! C'est l'heure de bumper le serveur!\n\n**Récompenses:**\n💥 **+500 XP** par bump\n🏆 Ça compte pour la course au **Champion Textuel du jour**\n👑 **Classements globaux** par plateforme`)
      .addFields(
        {
          name: '📋 Commandes de Bump',
          value: `**🎮 Disboard:** \`/bump\` (2h de cooldown)\n**⭐ Top.gg:** \`/vote\` (12h)\n**🤖 DBL:** \`/vote\` (12h)\n**🗳️ Voting:** \`/vote\` (24h)`,
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

// ── Vérifie si le cooldown de 2h est terminé pour cette guilde, et ping si oui ──
async function checkAndSendBumpReminder(guild) {
  const cfg = await Config.findOne({ guildId: guild.id }).lean().catch(() => null);
  if (!cfg?.bumpChannelId || !cfg?.bumpReminder) return;
  if (cfg.bumpReminderSent) return; // déjà pingé pour ce cycle — on attend le prochain bump avant de reping

  const now = Date.now();
  const lastBumpAt = cfg.lastBumpAt ? new Date(cfg.lastBumpAt).getTime() : null;

  // Jamais bumpé sur ce serveur ? On considère qu'il est temps tout de suite —
  // pas la peine d'attendre 2h de plus pour un tout premier bump.
  const readyAt = lastBumpAt ? lastBumpAt + BUMP_COOLDOWN_MS : now;
  if (now < readyAt) return; // cooldown pas encore terminé

  await sendBumpReminder(guild);
  await Config.updateOne({ guildId: guild.id }, { bumpReminderSent: true });
}

function startBumpReminder(client) {
  // Vérifie toutes les 5 minutes si le cooldown de 2h est terminé quelque part —
  // le ping part dans les 5 minutes qui suivent la vraie fin du cooldown, pas sur
  // un horaire fixe qui pouvait tomber en avance ou en retard.
  cron.schedule('*/5 * * * *', async () => {
    for (const guild of client.guilds.cache.values()) {
      await checkAndSendBumpReminder(guild).catch(() => {});
    }
  });

  console.log('✅ Bump reminder : vérifie toutes les 5min si le cooldown de 2h est terminé (précis, plus d\'horaire fixe)');
}

module.exports = { startBumpReminder, sendBumpReminder };
