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
  // ── Staff ──────────────────────────────────────────────────────────────────
  staffRoleId:              { type: String, default: null },  // rôle global staff
  staffConditionChannelId:  { type: String, default: null },  // #condition-staff
  staffConditionMessageId:  { type: String, default: null },
  staffCategoryId:          { type: String, default: null },  // catégorie tickets staff
  staffArchiveCategoryId:   { type: String, default: null },  // catégorie archives
  // Rôles finaux
  moderateurRoleId:         { type: String, default: null },
  animateurRoleId:          { type: String, default: null },
  technicienRoleId:         { type: String, default: null },
  // Rôles stagiaires
  moderateurStagiaireRoleId: { type: String, default: null },
  animateurStagiaireRoleId:  { type: String, default: null },
  technicienStagiaireRoleId: { type: String, default: null },
  // Période d'essai (jours)
  trialDays:                { type: Number, default: 14 },
  staffGifUrl:              { type: String, default: null },
  // ── Partenariat ────────────────────────────────────────────────────────────
  partnerConditionChannelId: { type: String, default: null },
  partnerConditionMessageId: { type: String, default: null },
  partnerCategoryId:         { type: String, default: null },
  partnerArchiveCategoryId:  { type: String, default: null },
  partnerPostChannelId:      { type: String, default: null }, // #partenariats
  partnerManagerRoleId:      { type: String, default: null }, // rôle gestionnaire partenariats
  partnerPingRoleId:         { type: String, default: null },
  // ── Pub ticket ─────────────────────────────────────────────────────────────
  pubPostChannelId:          { type: String, default: null },
  pubTicketCategoryId:       { type: String, default: null }, // rôle pingé à chaque nouveau partenariat
  // ── King of the Staff ──────────────────────────────────────────────────────
  staffClassementChannelId: { type: String, default: null }, // salon classement staff privé
  staffLiveBoardMessageId:  { type: String, default: null }, // message live board staff
  kingStaffRoleId:          { type: String, default: null }, // rôle King of the Staff
  currentKingStaffId:       { type: String, default: null },
  // ── Hiérarchie ────────────────────────────────────────────────────────────
  coOwnerIds:               { type: [String], default: [] },
  coOwnerRoleId:            { type: String, default: null },
  adminRoleId:              { type: String, default: null },
  // ── Animation ─────────────────────────────────────────────────────────────
  reglementChannelId:       { type: String, default: null },
  reglementMessageId:       { type: String, default: null },
  membreRoleId:             { type: String, default: null },
  roiDuJourChannelId:       { type: String, default: null },
  roiDuJourRoleId:          { type: String, default: null },
  boostChannelId:           { type: String, default: null },
  boostGifUrl:              { type: String, default: null },
  boostXpBonus:             { type: Number, default: 500 },
  announcePingRoleId:       { type: String, default: null },
  conseilChannelId:         { type: String, default: null },
  defiChannelId:            { type: String, default: null }, // salon des défis
  pinStarThreshold:         { type: Number, default: 5 },
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
