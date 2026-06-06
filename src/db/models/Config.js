// src/db/models/Config.js
'use strict';
const { Schema, model } = require('mongoose');

const configSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  // Salons
  announceChannelId:        { type: String, default: null },
  // Logs modération (warns, kicks, bans, actions staff)
  logChannelId:             { type: String, default: null },
  // Embed couleur fixe épinglé
  colorPostChannelId:       { type: String, default: null },
  colorPostMessageId:       { type: String, default: null },
  animeChannelId:           { type: String, default: null },
  animalsAutoChannelId:     { type: String, default: null },
  waifuChannelId:           { type: String, default: null },
  animalsCommunityChannelId:{ type: String, default: null },
  faceRevealChannelId:      { type: String, default: null },
  bumpChannelId:            { type: String, default: null },
  secretChannelId:          { type: String, default: null },
  warChannelId:             { type: String, default: null },   // salon annonces résultats
  warChatChannelId:         { type: String, default: null },   // salon où les triggers actifs
  warDogRoleId:             { type: String, default: null },   // rôle Team Chien
  warCatRoleId:             { type: String, default: null },   // rôle Team Chat
  quizChannelId:            { type: String, default: null },
  prisonChannelId:          { type: String, default: null },
  statsChannelId:           { type: String, default: null },
  mediaChannelIds:          { type: [String], default: [] },    // plusieurs salons média
  countingChannelId:        { type: String, default: null },
  countingCurrent:          { type: Number, default: 0 },      // dernier nombre validé
  countingLastUserId:       { type: String, default: null },   // qui a posté le dernier
  countingTimeoutMinutes:   { type: Number, default: 5 },      // durée punition en minutes
  countingRecord:           { type: Number, default: 0 },      // record du serveur
  rankChannelId:            { type: String, default: null },
  debatChannelId:           { type: String, default: null },      // salon forum débats
  secretButtonMessageId:    { type: String, default: null },      // message bouton secret persistant
  animalMentionEnabled:     { type: Boolean, default: false },     // feature animal mention activée
  animalTriggerChannelId:   { type: String, default: null },       // salon où les sons animaux génèrent une image
  // Rôles
  kingRoleId:               { type: String, default: null },
  singeRoleId:              { type: String, default: null },
  coupleRoleId:             { type: String, default: null },
  guildeDominanteRoleId:    { type: String, default: null },
  // Paramètres XP
  xpPerMessage:             { type: Number, default: 15 },
  xpCooldown:               { type: Number, default: 60 },
  crownHour:                { type: Number, default: 20 },
  // Smash intervals
  animeInterval:            { type: Number, default: 6 },
  animalsInterval:          { type: Number, default: 4 },
  // Salons exclus XP
  xpExcludedChannels:       { type: [String], default: [] },
  // YouTube
  youtubeChannelId:         { type: String, default: null },
  youtubeNotifChannelId:    { type: String, default: null },
  lastYoutubeVideoId:       { type: String, default: null },
  // Twitch
  twitchUsername:           { type: String, default: null },
  twitchNotifChannelId:     { type: String, default: null },
  twitchIsLive:             { type: Boolean, default: false },
  twitchAccessToken:        { type: String, default: null },
  twitchTokenExpiry:        { type: Date,   default: null },
  // État interne
  currentMonkeyId:          { type: String, default: null },
  currentCoupleIds:         { type: [String], default: [] },
  currentKingId:            { type: String, default: null },
  warDogPoints:             { type: Number, default: 0 },
  warCatPoints:             { type: Number, default: 0 },

  // Invite Tracker
  inviteTrackerEnabled: { type: Boolean, default: false },
  inviteChannelId:      { type: String, default: null },
  // Ghost Bot
  ghostBotChannelId:    { type: String, default: null },
  // Bump rôle
  bumpRoleId:           { type: String, default: null },
  // Level roles : [{ level: Number, roleId: String }]
  levelRoles:           { type: [{ level: Number, roleId: String }], default: [] },
  // Challenger rôle (#2 et #3 podium hebdo)
  challengerRoleId:     { type: String, default: null },
  // Multiplicateurs XP par salon : [{ channelId, multiplier }]
  channelMultipliers:   { type: [{ channelId: String, multiplier: Number }], default: [] },
  // Message live classement dans #lvl-xp (épinglé, mis à jour en continu)
  liveBoardMessageId:   { type: String, default: null },
  liveBoardChannelId:   { type: String, default: null },
  // Reset configurable
  resetDayOfWeek:       { type: Number, default: 0 },  // 0 = dimanche
  resetHour:            { type: Number, default: 20 },
  // Missions hebdo
  missionsEnabled:      { type: Boolean, default: false },
  missionsChannelId:    { type: String, default: null },
  // Giveaway
  giveawayChannelId:    { type: String, default: null },
  giveawayRoleId:       { type: String, default: null }, // rôle pingé "Ping Giveaways"
  // Défis communautaires
  defisChannelId:       { type: String, default: null },
  defisRoleId:          { type: String, default: null }, // rôle pingé pour les défis
  mudaeChannelId:       { type: String, default: null }, // salon Mudae pour $give kakera
  // Streak
  streakEnabled:        { type: Boolean, default: false },
  // Feur/Botus — salon (null = partout)
  feurChannelId:        { type: String, default: null },
  // Présentation
  presentationForumId:  { type: String, default: null },  // forum où poster les présentations
  confirmedRoleId:      { type: String, default: null },  // rôle "Membre Confirmé ✅"
  // Rôles couleur (choix membre via DM après présentation)
  colorRoleIds: { type: [{ name: String, roleId: String, emoji: String }], default: [] },
}, { timestamps: true });

module.exports = model('Config', configSchema);
