// src/db/models/User.js
'use strict';
const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  userId:        { type: String, required: true },
  guildId:       { type: String, required: true },
  // XP
  xp:            { type: Number, default: 0 },    // XP semaine en cours
  totalXp:       { type: Number, default: 0 },    // XP total all-time
  level:         { type: Number, default: 0 },
  lastMessage:   { type: Date,   default: null },
  // King
  crownCount:    { type: Number, default: 0 },
  isKing:        { type: Boolean, default: false },
  // Réputation — badges attribués par le staff
  badges:        { type: [String], default: [] },
  // Missions quotidiennes
  dailyMissionsDate:  { type: String, default: null },   // ex: "2026-06-07"
  dailyMissionsDone:  { type: [String], default: [] },   // IDs missions complétées
  dailyMissionsBonus: { type: Boolean, default: false },  // bonus 3/3 réclamé
  dailyMessagesGame:  { type: Number, default: 0 },       // messages salons jeux
  reactionsToday:     { type: Number, default: 0 },       // réactions aujourd'hui
  invitesToday:       { type: Number, default: 0 },       // invites aujourd'hui
  vocalMinutesToday:  { type: Number, default: 0 },       // minutes vocal aujourd'hui
  bumpDay:            { type: Number, default: 0 },       // bumps aujourd'hui
  // Guerre animale
  team:          { type: String, enum: ['dog', 'cat', null], default: null },
  teamXp:        { type: Number, default: 0 },
  // Guilde
  guildeId:      { type: String, default: null },
  xpBoostUntil:  { type: Date,   default: null }, // x2 XP guilde dominante
  podiumBoostUntil: { type: Date, default: null }, // +0.5x XP podium 2e/3e place
  defiXpBoostUntil: { type: Date, default: null }, // x2 XP quête verte
  // Singe
  isMonkey:      { type: Boolean, default: false },
  monkeyFaults:  { type: Number, default: 0 },
  monkeyWeek:    { type: Number, default: 0 },    // numéro de semaine où il est singe
  // Bump multi-sources
  bumpCount:        { type: Number, default: 0 },  // total all-time (toutes sources)
  bumpWeek:         { type: Number, default: 0 },  // bumps semaine en cours (toutes sources)
  // Détail par source
  bumpDisboard:     { type: Number, default: 0 },  // /bump Disboard
  bumpDiscordList:  { type: Number, default: 0 },  // bump DiscordList
  bumpDiscordListVote: { type: Number, default: 0 },// vote DiscordList
  bumpTopgg:        { type: Number, default: 0 },  // vote Top.gg
  // Quiz
  quizScore:     { type: Number, default: 0 },
  quizWins:      { type: Number, default: 0 },
  otakuLevel:    { type: String, default: 'none' },
  // Semaine
  weekXp:        { type: Number, default: 0 },    // XP gagné cette semaine (pour King)
  dailyXp:       { type: Number, default: 0 },    // XP gagné aujourd'hui (pour Roi du jour)
  dailyMessages: { type: Number, default: 0 },    // Messages aujourd'hui
  weekNumber:    { type: Number, default: 0 },    // numéro de semaine courante
  weekYear:      { type: Number, default: 0 },    // année de la semaine courante
  // Invitations
  inviteCount:   { type: Number, default: 0 },
  // Stats activité
  messageCount:  { type: Number, default: 0 },
  activeDays:    { type: [String], default: [] }, // dates 'YYYY-MM-DD'
  // Streak
  streakCurrent: { type: Number, default: 0 },
  streakBest:    { type: Number, default: 0 },
  streakLastDay: { type: String, default: null }, // 'YYYY-MM-DD'
  // Missions hebdo
  missionsWeek:  { type: Number, default: 0 },   // numéro de semaine
  missionsYear:  { type: Number, default: 0 },
  missionsDone:  { type: [String], default: [] }, // ex: ['messages','bump','smash']
  // Giveaway tickets
  giveawayTickets: { type: Number, default: 0 },
}, {
  timestamps: true,
  indexes: [{ userId: 1, guildId: 1 }, { unique: true }],
});

userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = model('User', userSchema);
// Note: inviteCount ajouté dynamiquement si absent — pas besoin de migration
