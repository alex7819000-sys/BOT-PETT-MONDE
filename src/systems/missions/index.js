'use strict';
const { EmbedBuilder } = require('discord.js');
const User = require('../../db/models/User');
const logger = require('../../utils/logger');

// Définition des missions hebdo — trackées automatiquement
const MISSIONS = [
  { id: 'messages',   label: '💬 Envoyer 20 messages',       xp: 40,  check: u => u.messageCount >= 20 },
  { id: 'top10',      label: '🏆 Être dans le top 10 hebdo', xp: 100, check: null }, // vérifié au reset
  { id: 'bump',       label: '🚀 Bumper le serveur 2 fois',  xp: 30,  check: u => u.bumpWeek >= 2 },
  { id: 'smash',      label: '💘 Voter sur un Smash or Pass', xp: 20, check: null }, // flaggé depuis smash
  { id: 'bataille',   label: '⚔️ Poster dans #bataille',     xp: 15,  check: null }, // flaggé depuis guerre
];

function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return { week, year: now.getFullYear() };
}

// Appelé pour vérifier et attribuer les missions auto-vérifiables
async function checkMissions(user, guild, client) {
  try {
    const { week, year } = getWeekKey();

    // Reset missions si nouvelle semaine
    if (user.missionsWeek !== week || user.missionsYear !== year) {
      user.missionsWeek = week;
      user.missionsYear = year;
      user.missionsDone = [];
      user.giveawayTickets = 0;
    }

    let bonusXp = 0;
    let newDone = [];

    for (const mission of MISSIONS) {
      if (!mission.check) continue; // missions manuelles, skip
      if (user.missionsDone.includes(mission.id)) continue;
      if (mission.check(user)) {
        user.missionsDone.push(mission.id);
        bonusXp += mission.xp;
        newDone.push(mission);
      }
    }

    if (newDone.length > 0) {
      user.totalXp += bonusXp;
      user.giveawayTickets = user.missionsDone.length;
      await user.save();

      // Notif DM
      try {
        const member = await guild.members.fetch(user.userId);
        const embed = new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('✅ Mission(s) accomplie(s) !')
          .setDescription(newDone.map(m => `${m.label} — **+${m.xp} XP King**`).join('\n'))
          .setFooter({ text: `Tu as maintenant ${user.missionsDone.length} ticket(s) de giveaway 🎟️` });
        await member.send({ embeds: [embed] }).catch(() => {});
      } catch {}
    }
  } catch (err) {
    logger.error('[Missions] checkMissions:', err);
  }
}

// Appelé manuellement depuis d'autres systèmes pour flagguer une mission
async function completeMission(userId, guildId, missionId, guild) {
  try {
    const { week, year } = getWeekKey();
    const user = await User.findOne({ userId, guildId });
    if (!user) return;

    if (user.missionsWeek !== week || user.missionsYear !== year) {
      user.missionsWeek = week;
      user.missionsYear = year;
      user.missionsDone = [];
      user.giveawayTickets = 0;
    }

    if (user.missionsDone.includes(missionId)) return;

    const mission = MISSIONS.find(m => m.id === missionId);
    if (!mission) return;

    user.missionsDone.push(missionId);
    user.totalXp += mission.xp;
    user.giveawayTickets = user.missionsDone.length;
    await user.save();

    try {
      const member = await guild.members.fetch(userId);
      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('✅ Mission accomplie !')
        .setDescription(`${mission.label} — **+${mission.xp} XP King**`)
        .setFooter({ text: `Tu as maintenant ${user.missionsDone.length} ticket(s) de giveaway 🎟️` });
      await member.send({ embeds: [embed] }).catch(() => {});
    } catch {}
  } catch (err) {
    logger.error('[Missions] completeMission:', err);
  }
}

// Afficher les missions d'un user
async function getMissionsEmbed(userId, guildId) {
  const { week, year } = getWeekKey();
  const user = await User.findOne({ userId, guildId });
  const done = (user && user.missionsWeek === week && user.missionsYear === year)
    ? user.missionsDone : [];

  const lines = MISSIONS.map(m => {
    const isDone = done.includes(m.id);
    return `${isDone ? '✅' : '⬜'} ${m.label} — **+${m.xp} XP**`;
  });

  const tickets = user ? user.giveawayTickets : 0;

  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('📋 Missions de la semaine')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${done.length}/${MISSIONS.length} missions • ${tickets} ticket(s) giveaway 🎟️` })
    .setTimestamp();
}

// Vérifier top 10 (appelé au reset hebdo)
async function checkTop10Mission(guildId, guild) {
  try {
    const { week, year } = getWeekKey();
    const top10 = await User.find({ guildId }).sort({ weekXp: -1 }).limit(10);
    for (const user of top10) {
      await completeMission(user.userId, guildId, 'top10', guild);
    }
  } catch (err) {
    logger.error('[Missions] checkTop10Mission:', err);
  }
}

module.exports = { checkMissions, completeMission, getMissionsEmbed, checkTop10Mission, MISSIONS };
