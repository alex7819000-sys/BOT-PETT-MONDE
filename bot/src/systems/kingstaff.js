// src/systems/kingstaff/index.js
'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const StaffScore  = require('../db/models/StaffScore');
const Config      = require('../db/models/Config');
const { postLog } = require('./warn');
const logger      = require('../utils/logger');

// ── Points par action ─────────────────────────────────────────────────────────
const POINTS = {
  TICKET_TRAITE:       10,
  WARN_DONNE:           5,
  CANDIDATURE_TRAITEE: 15,
  STAGIAIRE_VALIDE:    30,
  MESSAGE_STAFF:        1,
  FAST_RESPONSE:        5,   // ticket répondu < 30min
  TICKET_IGNORE:       -20,  // ticket non traité > 24h
  INACTIVITE_JOUR:     -10,  // par jour d'inactivité après 3 jours
};

const GRADE_THRESHOLDS = {
  junior:   100,
  confirme: 300,
  senior:   700,
  elite:    1500,
};

// ── Obtenir ou créer un score staff ──────────────────────────────────────────
async function getOrCreateScore(userId, guildId) {
  let score = await StaffScore.findOne({ userId, guildId });
  if (!score) {
    const now = new Date();
    const week = getWeekNumber(now);
    score = await StaffScore.create({
      userId, guildId,
      weekNumber: week.week,
      weekYear:   week.year,
      lastActionAt: now,
    });
  }
  return score;
}

// ── Ajouter des points à un staff ─────────────────────────────────────────────
async function addStaffPoints(userId, guildId, action, client) {
  const points = POINTS[action];
  if (!points || points === 0) return;

  const score = await getOrCreateScore(userId, guildId);
  const now   = new Date();
  const week  = getWeekNumber(now);

  // Reset si nouvelle semaine
  if (score.weekNumber !== week.week || score.weekYear !== week.year) {
    score.weekScore          = 0;
    score.ticketsTraited     = 0;
    score.warnsGiven         = 0;
    score.candidaturesTraited = 0;
    score.stagiairesValidated = 0;
    score.messagesStaff      = 0;
    score.fastResponses      = 0;
    score.inactivityPenalty  = 0;
    score.weekNumber         = week.week;
    score.weekYear           = week.year;
    score.inactivityWarned   = false;
  }

  // Appliquer les points
  score.weekScore  = Math.max(0, score.weekScore  + points);
  score.totalScore = Math.max(0, score.totalScore + (points > 0 ? points : 0));
  score.gradeXp    = Math.max(0, score.gradeXp    + (points > 0 ? points : 0));
  score.lastActionAt = now;
  score.inactivityWarned = false;

  // Incrémenter les compteurs
  const counters = {
    TICKET_TRAITE:       'ticketsTraited',
    WARN_DONNE:          'warnsGiven',
    CANDIDATURE_TRAITEE: 'candidaturesTraited',
    STAGIAIRE_VALIDE:    'stagiairesValidated',
    MESSAGE_STAFF:       'messagesStaff',
    FAST_RESPONSE:       'fastResponses',
  };
  if (counters[action]) score[counters[action]]++;

  // Vérifier la montée de grade
  await checkGradeUp(score, userId, guildId, client);

  await score.save();
  return score;
}

// ── Vérifier montée de grade all-time ────────────────────────────────────────
async function checkGradeUp(score, userId, guildId, client) {
  const grades = ['stagiaire', 'junior', 'confirme', 'senior', 'elite'];
  const currentIdx = grades.indexOf(score.grade);
  const nextGrade  = grades[currentIdx + 1];
  if (!nextGrade) return;

  const threshold = GRADE_THRESHOLDS[nextGrade];
  if (score.gradeXp >= threshold) {
    score.grade = nextGrade;
    // Notifier dans le salon staff
    try {
      const config = await Config.findOne({ guildId });
      const guild  = client?.guilds.cache.get(guildId);
      if (guild && config?.staffClassementChannelId) {
        const ch = guild.channels.cache.get(config.staffClassementChannelId);
        if (ch) {
          const gradeEmojis = { junior: '🥉', confirme: '🥈', senior: '🥇', elite: '💎' };
          await ch.send({ embeds: [new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle(`${gradeEmojis[nextGrade] || '⭐'} Montée de grade !`)
            .setDescription(`<@${userId}> passe au grade **${nextGrade.toUpperCase()}** ! 🎉\n*(${score.gradeXp} XP staff total)*`)
            .setTimestamp()
          ]});
        }
      }
    } catch (_) {}
  }
}

// ── Vérification inactivité (appelée par le cron quotidien) ──────────────────
async function checkInactivity(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config) return;

  const guild    = client.guilds.cache.get(guildId);
  if (!guild) return;

  // Récupérer tous les IDs staff actifs
  const staffRoleIds = [
    config.staffRoleId,
    config.moderateurRoleId, config.animateurRoleId, config.technicienRoleId,
    config.moderateurStagiaireRoleId, config.animateurStagiaireRoleId, config.technicienStagiaireRoleId,
  ].filter(Boolean);

  if (!staffRoleIds.length) return;

  await guild.members.fetch();
  const staffMembers = guild.members.cache.filter(m =>
    staffRoleIds.some(rid => m.roles.cache.has(rid)) &&
    !m.user.bot
  );

  const now = Date.now();

  for (const [, member] of staffMembers) {
    const score = await getOrCreateScore(member.id, guildId);
    const lastAction = score.lastActionAt?.getTime() || score.createdAt?.getTime() || now;
    const daysSince  = Math.floor((now - lastAction) / 86400000);

    // Vérifier si en absence programmée (à implémenter plus tard)

    if (daysSince >= 21) {
      // Retrait automatique du rôle staff
      for (const rid of staffRoleIds) {
        if (member.roles.cache.has(rid)) await member.roles.remove(rid).catch(() => {});
      }
      try {
        const dm = await member.createDM();
        await dm.send({ embeds: [new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⚠️ Rôle Staff retiré — Inactivité')
          .setDescription(
            `Ton rôle staff sur **${guild.name}** a été retiré suite à **${daysSince} jours d'inactivité**.\n\n` +
            `> Tu peux recandidater quand tu es de nouveau disponible.`
          )
          .setTimestamp()
        ]});
      } catch (_) {}

      await postLog(guild, config, new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🚨 Rôle staff retiré — Inactivité 21j')
        .addFields(
          { name: '👤 Membre', value: `<@${member.id}>`, inline: true },
          { name: '📅 Jours inactif', value: `${daysSince}`, inline: true },
        ).setTimestamp()
      );

      logger.info('KingStaff', `Rôle staff retiré à ${member.user.tag} (${daysSince}j inactif)`);

    } else if (daysSince >= 10 && !score.inactivityWarned) {
      // Ping dans le salon staff
      if (config?.staffClassementChannelId) {
        const ch = guild.channels.cache.get(config.staffClassementChannelId);
        if (ch) {
          await ch.send({ embeds: [new EmbedBuilder()
            .setColor(0xFF6600)
            .setTitle('⚠️ Inactivité Staff')
            .setDescription(
              `<@${member.id}> est inactif depuis **${daysSince} jours**.\n` +
              `**Attention :** dans ${21 - daysSince} jours, le rôle staff sera retiré automatiquement.`
            )
            .setTimestamp()
          ]});
        }
      }
      // DM d'avertissement
      try {
        const dm = await member.createDM();
        await dm.send({ embeds: [new EmbedBuilder()
          .setColor(0xFF6600)
          .setTitle('⚠️ Inactivité Staff')
          .setDescription(
            `Tu es inactif depuis **${daysSince} jours** sur **${guild.name}**.\n\n` +
            `📌 **Dans ${21 - daysSince} jours**, ton rôle staff sera retiré automatiquement.\n\n` +
            `> Si tu pars en vacances, utilise \`/staff absence\` pour te mettre en pause.`
          )
          .setTimestamp()
        ]});
      } catch (_) {}

      score.inactivityWarned   = true;
      score.inactivityWarnedAt = new Date();
      await score.save();

    } else if (daysSince >= 7) {
      // DM privé discret
      if (!score.inactivityWarned) {
        try {
          const dm = await member.createDM();
          await dm.send({ embeds: [new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('💤 Petit rappel')
            .setDescription(
              `Tu n'as eu aucune activité staff sur **${guild.name}** depuis **${daysSince} jours**.\n` +
              `> Pense à traiter les tickets ou à te manifester ! 👋`
            )
            .setTimestamp()
          ]});
        } catch (_) {}
      }

      // Pénalité XP hebdo
      score.weekScore = Math.max(0, score.weekScore - 10);
      score.inactivityPenalty++;
      await score.save();
    }
  }
}

// ── Cérémonie King of the Staff (dimanche 20h, même moment que King membres) ──
async function runKingStaffCeremony(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.staffClassementChannelId) return;

  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(config.staffClassementChannelId);
  if (!channel) return;

  const week    = getWeekNumber(new Date());
  const scores  = await StaffScore.find({ guildId, weekNumber: week.week, weekYear: week.year, weekScore: { $gt: 0 } })
    .sort({ weekScore: -1 }).limit(10);

  if (!scores.length) return logger.info('KingStaff', 'Aucun staff actif cette semaine');

  const members = await Promise.all(scores.map(async (s, i) => {
    try {
      const m = await guild.members.fetch(s.userId);
      return { score: s, member: m, rank: i + 1 };
    } catch { return null; }
  }));
  const valid = members.filter(Boolean);
  if (!valid.length) return;

  const king = valid[0];

  // Retirer l'ancien King Staff
  if (config.currentKingStaffId && config.kingStaffRoleId) {
    try {
      const old = await guild.members.fetch(config.currentKingStaffId);
      await old.roles.remove(config.kingStaffRoleId).catch(() => {});
      await StaffScore.updateOne({ userId: config.currentKingStaffId, guildId }, { isKingStaff: false });
    } catch (_) {}
  }

  // Couronner le nouveau King Staff
  if (config.kingStaffRoleId) await king.member.roles.add(config.kingStaffRoleId).catch(() => {});
  await StaffScore.updateOne(
    { userId: king.score.userId, guildId },
    { isKingStaff: true, $inc: { kingStaffCount: 1 } }
  );
  await Config.updateOne({ guildId }, { currentKingStaffId: king.score.userId });

  // Embed cérémonie
  const medals = ['👑', '🥈', '🥉'];
  const gradeEmojis = { stagiaire: '🎓', junior: '🥉', confirme: '🥈', senior: '🥇', elite: '💎' };

  const lines = valid.map(({ score, member, rank }) => {
    const medal = medals[rank - 1] || `**${rank}.**`;
    const grade = gradeEmojis[score.grade] || '';
    return `${medal} ${grade} **${member.displayName}** — ${score.weekScore} pts *(${score.ticketsTraited} tickets · ${score.warnsGiven} warns · ${score.candidaturesTraited} candidatures)*`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 King of the Staff — Cérémonie hebdo !')
    .setDescription(
      `**${king.member.displayName}** est couronné **King of the Staff** cette semaine ! 👑\n\n` +
      `**📊 Classement final :**\n${lines.join('\n')}`
    )
    .setThumbnail(king.member.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '⭐ Score',       value: `${king.score.weekScore} pts`,          inline: true },
      { name: '🎫 Tickets',     value: `${king.score.ticketsTraited}`,          inline: true },
      { name: '⚠️ Warns',      value: `${king.score.warnsGiven}`,              inline: true },
      { name: '👑 Total couronnes', value: `${king.score.kingStaffCount + 1}`,  inline: true },
      { name: '🎓 Grade',       value: king.score.grade.toUpperCase(),          inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Scores remis à 0 pour la semaine suivante' });

  await channel.send({ embeds: [embed] });

  // Reset scores hebdo
  await StaffScore.updateMany({ guildId }, { weekScore: 0, weekNumber: 0 });

  logger.info('KingStaff', `King of the Staff : ${king.member.displayName}`);
}

// ── Live classement staff (mis à jour régulièrement) ─────────────────────────
async function updateStaffLiveBoard(guild, config) {
  if (!config?.staffClassementChannelId || !config?.staffLiveBoardMessageId) return;

  const channel = guild.channels.cache.get(config.staffClassementChannelId);
  if (!channel) return;

  const week   = getWeekNumber(new Date());
  const scores = await StaffScore.find({ guildId: guild.id, weekNumber: week.week, weekYear: week.year })
    .sort({ weekScore: -1 }).limit(10);

  if (!scores.length) return;

  const gradeEmojis = { stagiaire: '🎓', junior: '🥉', confirme: '🥈', senior: '🥇', elite: '💎' };
  const medals = ['👑', '🥈', '🥉'];

  const lines = await Promise.all(scores.map(async (s, i) => {
    try {
      const m = await guild.members.fetch(s.userId);
      const medal = medals[i] || `**${i+1}.**`;
      const grade = gradeEmojis[s.grade] || '';
      const bar   = '█'.repeat(Math.min(Math.round(s.weekScore / 10), 10)) + '░'.repeat(Math.max(0, 10 - Math.min(Math.round(s.weekScore / 10), 10)));
      return `${medal} ${grade} **${m.displayName}** \`${bar}\` ${s.weekScore} pts`;
    } catch { return null; }
  }));

  const validLines = lines.filter(Boolean);
  if (!validLines.length) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🏆 Classement Staff — Live')
    .setDescription(validLines.join('\n'))
    .setFooter({ text: 'Mis à jour automatiquement • Soyez actifs !' })
    .setTimestamp();

  try {
    const msg = await channel.messages.fetch(config.staffLiveBoardMessageId);
    await msg.edit({ embeds: [embed] });
  } catch {
    try {
      const newMsg = await channel.send({ embeds: [embed] });
      await newMsg.pin().catch(() => {});
      await Config.updateOne({ guildId: guild.id }, { staffLiveBoardMessageId: newMsg.id });
    } catch (_) {}
  }
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function getWeekNumber(date) {
  const d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
  return { week, year };
}

module.exports = {
  addStaffPoints,
  checkInactivity,
  runKingStaffCeremony,
  updateStaffLiveBoard,
  getOrCreateScore,
  POINTS,
};
