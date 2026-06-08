// src/systems/dailymissions/index.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

// ── Pool de missions par difficulté ──────────────────────────────────────────
const MISSIONS_POOL = {
  facile: [
    { id: 'msg_10',     label: '💬 Envoyer 10 messages',          type: 'messages', target: 10,  xp: 30,  kakera: 50  },
    { id: 'msg_15',     label: '💬 Envoyer 15 messages',          type: 'messages', target: 15,  xp: 40,  kakera: 75  },
    { id: 'connect',    label: '🌅 Se connecter aujourd\'hui',     type: 'connect',  target: 1,   xp: 20,  kakera: 30  },
    { id: 'react_3',    label: '❤️ Réagir à 3 messages',          type: 'reactions', target: 3,  xp: 25,  kakera: 40  },
    { id: 'vocal_5',    label: '🎙️ 5 minutes en vocal',           type: 'vocal',    target: 5,   xp: 30,  kakera: 50  },
  ],
  moyen: [
    { id: 'msg_40',     label: '💬 Envoyer 40 messages',          type: 'messages', target: 40,  xp: 80,  kakera: 150 },
    { id: 'bump_1',     label: '🚀 Bumper le serveur 1 fois',     type: 'bumps',    target: 1,   xp: 70,  kakera: 120 },
    { id: 'vocal_20',   label: '🎙️ 20 minutes en vocal',          type: 'vocal',    target: 20,  xp: 90,  kakera: 160 },
    { id: 'msg_game',   label: '🎮 30 messages dans les salons jeux', type: 'messages_game', target: 30, xp: 85, kakera: 140 },
    { id: 'invite_1',   label: '📩 Inviter 1 membre',             type: 'invites',  target: 1,   xp: 100, kakera: 200 },
  ],
  difficile: [
    { id: 'msg_100',    label: '💬 Envoyer 100 messages',         type: 'messages', target: 100, xp: 200, kakera: 400 },
    { id: 'bump_3',     label: '🚀 Bumper le serveur 3 fois',     type: 'bumps',    target: 3,   xp: 180, kakera: 350 },
    { id: 'vocal_60',   label: '🎙️ 1 heure en vocal',             type: 'vocal',    target: 60,  xp: 220, kakera: 450 },
    { id: 'invite_3',   label: '📩 Inviter 3 membres',            type: 'invites',  target: 3,   xp: 250, kakera: 500 },
    { id: 'msg_200',    label: '💬 Envoyer 200 messages',         type: 'messages', target: 200, xp: 300, kakera: 600 },
  ],
};

// ── Générer les 3 missions du jour (seed basé sur la date) ───────────────────
function getDailyMissions(date = new Date()) {
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const seed    = hashCode(dateKey);
  return {
    facile:    MISSIONS_POOL.facile[Math.abs(seed)    % MISSIONS_POOL.facile.length],
    moyen:     MISSIONS_POOL.moyen[Math.abs(seed + 1) % MISSIONS_POOL.moyen.length],
    difficile: MISSIONS_POOL.difficile[Math.abs(seed + 2) % MISSIONS_POOL.difficile.length],
  };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getTodayKey() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Vérifier et compléter les missions quotidiennes ──────────────────────────
async function checkDailyMissions(user, guild, client, extra = {}) {
  try {
    const todayKey = getTodayKey();
    const missions = getDailyMissions();
    const config   = await Config.findOne({ guildId: guild.id });

    // Reset si nouveau jour
    if (!user.dailyMissionsDate || user.dailyMissionsDate !== todayKey) {
      user.dailyMissionsDate = todayKey;
      user.dailyMissionsDone = [];
      user.dailyMissionsBonus = false;
    }

    const done       = user.dailyMissionsDone || [];
    let   newDone    = [];
    let   bonusXp    = 0;
    let   bonusKakera = 0;

    const allMissions = [
      { ...missions.facile,    tier: 'facile' },
      { ...missions.moyen,     tier: 'moyen' },
      { ...missions.difficile, tier: 'difficile' },
    ];

    for (const mission of allMissions) {
      if (done.includes(mission.id)) continue;
      if (!isCompleted(mission, user, extra)) continue;

      done.push(mission.id);
      bonusXp     += mission.xp;
      bonusKakera += mission.kakera;
      newDone.push(mission);
    }

    if (newDone.length === 0) return;

    user.dailyMissionsDone = done;
    user.totalXp  = (user.totalXp  || 0) + bonusXp;
    user.weekXp   = (user.weekXp   || 0) + bonusXp;
    user.dailyXp  = (user.dailyXp  || 0) + bonusXp;

    // ── Bonus si les 3 missions complétées ───────────────────────────────────
    const allDone = done.length >= 3 && !user.dailyMissionsBonus;
    if (allDone) {
      user.dailyMissionsBonus = true;

      // Rôle bonus temporaire 24h
      if (config?.dailyBonusRoleId) {
        try {
          const member = await guild.members.fetch(user.userId);
          await member.roles.add(config.dailyBonusRoleId);

          // Retirer le rôle après 24h
          setTimeout(async () => {
            try {
              const m = await guild.members.fetch(user.userId);
              await m.roles.remove(config.dailyBonusRoleId).catch(() => {});
            } catch (_) {}
          }, 24 * 60 * 60 * 1000);
        } catch (_) {}
      }

      // Boost XP +50% pendant 24h
      const boostUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      user.defiXpBoostUntil = boostUntil;

      bonusXp     += 100; // XP bonus pour avoir tout complété
      bonusKakera += 200;
      user.totalXp = (user.totalXp || 0) + 100;
      user.weekXp  = (user.weekXp  || 0) + 100;
    }

    await user.save();

    // ── DM au membre ─────────────────────────────────────────────────────────
    try {
      const member = await guild.members.fetch(user.userId);
      const tierEmojis = { facile: '🟢', moyen: '🟡', difficile: '🔴' };

      const embed = new EmbedBuilder()
        .setColor(allDone ? 0xFFD700 : 0x57F287)
        .setTitle(allDone ? '🏆 TOUTES LES MISSIONS DU JOUR !' : '✅ Mission quotidienne accomplie !')
        .setDescription(
          newDone.map(m => `${tierEmojis[m.tier]} **${m.label}** — +${m.xp} XP · ${m.kakera} 💎`).join('\n') +
          (allDone ? '\n\n🎉 **BONUS** — +100 XP · +200 💎 · **+50% XP pendant 24h** !' : '')
        )
        .addFields({
          name: '📊 Missions du jour',
          value: `${done.length}/3 complétées`,
          inline: true,
        })
        .setTimestamp();

      await member.send({ embeds: [embed] }).catch(() => {});

      // Kakera via Mudae si configuré
      if (bonusKakera > 0 && config?.mudaeChannelId) {
        try {
          const mudaeCh = guild.channels.cache.get(config.mudaeChannelId);
          if (mudaeCh) await mudaeCh.send(`$give ${member.user.username} ${bonusKakera}`);
        } catch (_) {}
      }
    } catch (_) {}

    logger.info('DailyMissions', `${user.userId} a complété ${newDone.map(m => m.id).join(', ')}`);

  } catch (err) {
    logger.error('DailyMissions', 'checkDailyMissions error', err);
  }
}

// ── Vérifier si une mission est complétée ────────────────────────────────────
function isCompleted(mission, user, extra = {}) {
  switch (mission.type) {
    case 'messages':      return (user.dailyMessages || 0) >= mission.target;
    case 'messages_game': return (user.dailyMessagesGame || 0) >= mission.target;
    case 'bumps':         return (user.bumpDay || 0) >= mission.target;
    case 'invites':       return (user.invitesToday || 0) >= mission.target;
    case 'vocal':         return (user.vocalMinutesToday || 0) >= mission.target;
    case 'connect':       return true; // connecté = fait
    case 'reactions':     return (user.reactionsToday || 0) >= mission.target;
    default:              return false;
  }
}

// ── Embed des missions du jour ────────────────────────────────────────────────
async function getDailyMissionsEmbed(userId, guildId) {
  const todayKey = getTodayKey();
  const missions = getDailyMissions();
  const user     = await User.findOne({ userId, guildId });
  const done     = (user?.dailyMissionsDate === todayKey) ? (user.dailyMissionsDone || []) : [];

  const tierEmojis = { facile: '🟢', moyen: '🟡', difficile: '🔴' };
  const tierLabels = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

  const lines = Object.entries(missions).map(([tier, m]) => {
    const isDone = done.includes(m.id);
    const bar    = isDone ? '`████████████ 100%`' : '`░░░░░░░░░░░░   0%`';
    return `${isDone ? '✅' : tierEmojis[tier]} **[${tierLabels[tier]}]** ${m.label}\n${bar} — +${m.xp} XP · ${m.kakera} 💎`;
  });

  const allDone   = done.length >= 3;
  const bonusDone = user?.dailyMissionsBonus && user?.dailyMissionsDate === todayKey;

  const embed = new EmbedBuilder()
    .setColor(allDone ? 0xFFD700 : 0x5865F2)
    .setTitle('📅 Missions quotidiennes')
    .setDescription(lines.join('\n\n'))
    .addFields(
      { name: '📊 Progression', value: `${done.length}/3 complétées`, inline: true },
      { name: '🎁 Bonus si 3/3', value: '+100 XP · +200 💎 · +50% XP 24h', inline: true },
      { name: '⏰ Reset', value: 'Chaque jour à minuit', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: bonusDone ? '🏆 Bonus du jour réclamé !' : allDone ? '🏆 Toutes les missions complétées !' : 'Complete les 3 pour le bonus !' });

  return embed;
}

// ── Reset minuit (appelé par le cron) ────────────────────────────────────────
async function resetDailyMissions(guildId) {
  // Le reset est géré par getTodayKey() — automatique à minuit
  // On reset juste les compteurs daily sur les users
  await User.updateMany({ guildId }, {
    dailyMessages:      0,
    dailyMessagesGame:  0,
    bumpDay:            0,
    reactionsToday:     0,
    invitesToday:       0,
    vocalMinutesToday:  0,
  });
  logger.info('DailyMissions', `Reset quotidien effectué pour ${guildId}`);
}

// ── Poster le recap des missions du jour dans le salon ────────────────────────
async function postDailyMissionsBoard(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.missionsChannelId) return;

  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.missionsChannelId);
  if (!channel) return;

  const missions = getDailyMissions();
  const tierEmojis = { facile: '🟢', moyen: '🟡', difficile: '🔴' };
  const tierLabels = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

  const lines = Object.entries(missions).map(([tier, m]) =>
    `${tierEmojis[tier]} **[${tierLabels[tier]}]** ${m.label}\n> +${m.xp} XP · ${m.kakera} 💎`
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📅 Missions du jour — Nouvelles missions disponibles !')
    .setDescription(lines.join('\n\n'))
    .addFields({ name: '🎁 Bonus si 3/3 complétées', value: '+100 XP · +200 💎 · **+50% XP pendant 24h** 🔥', inline: false })
    .setTimestamp()
    .setFooter({ text: 'Utilisez /missions pour voir votre progression • Reset à minuit' });

  // Ping @King of the day + @Membre
  const pingRoi    = config?.roiDuJourRoleId ? `<@&${config.roiDuJourRoleId}>` : '';
  const pingMembre = config?.membreRoleId    ? `<@&${config.membreRoleId}>`    : '';
  const mention    = [pingRoi, pingMembre].filter(Boolean).join(' ');

  await channel.send({
    content: mention
      ? `${mention} 📅 **Nouvelles missions quotidiennes disponibles !**`
      : '📅 **Nouvelles missions quotidiennes disponibles !**',
    embeds: [embed],
  });
}

module.exports = {
  checkDailyMissions,
  getDailyMissionsEmbed,
  resetDailyMissions,
  postDailyMissionsBoard,
  getDailyMissions,
};
