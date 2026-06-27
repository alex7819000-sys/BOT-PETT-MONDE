'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: { type: String, unique: true },
  announceChannelId: String, bumpChannelId: String, secretChannelId: String,
  podiumChannelId: String,
  animeChannelId: String, animalsAutoChannelId: String, waifuChannelId: String,
  animalsCommunityChannelId: String, faceRevealChannelId: String, warChannelId: String,
  warChatChannelId: String, quizChannelId: String, prisonChannelId: String,
  forumGamingId: String, forumAnimeId: String, forumMusiqueId: String,
  animalTriggerChannelId: String, dogTeamRoleId: String, catTeamRoleId: String,
  welcomeChannelId: String,
  smashEmoji: { type: String, default: '🔥' }, passEmoji: { type: String, default: '💀' },
  questsChannelId: String, questsEnabled: { type: Boolean, default: true },
  // Rôles bonus XP temporaires (donnés par les quêtes)
  bonusRole25Id: String,   // rôle +25% XP pendant la durée configurée
  bonusRole50Id: String,   // rôle +50% XP
  bonusRole100Id: String,  // rôle +100% XP
  bonusDurationHours: { type: Number, default: 24 }, // durée par défaut des bonus quête (heures)
  // Mudae / kakera
  mudaeChannelId: String,  // salon où le bot envoie $dk pour récompenser en kakera
  bumpXpReward: { type: Number, default: 500 }, bumpReminderEnabled: { type: Boolean, default: false },
  bumpEmbedTitle: String, bumpEmbedDescription: String, bumpEmbedColor: String,
  bumpEmbedFooter: String, bumpEmbedImageUrl: String, bumpEmbedThumbnailUrl: String,
  mediaChannelIds: [String], countingChannelId: String, rankChannelId: String,
  levelUpChannelId: String,
  countingCurrent: { type: Number, default: 0 }, countingLastUserId: String,
  countingBestStreak: { type: Number, default: 0 },
  countingChampionRoleId: String, // rôle bonus XP donné au gagnant du classement counting du jour
  countingXpBonusPercent: { type: Number, default: 50 }, // % d'XP bonus pendant 24h
  confessionRevealHours: { type: Number, default: 48 }, // délai avant révélation publique de l'auteur
  confessionXpTop10: { type: [Number], default: [1000, 700, 500, 400, 300, 250, 200, 150, 120, 100] }, // XP/jour par rang (1er→10e)
  debatChannelId: String, feurChannelId: String, inviteChannelId: String,
  presentationForumId: String, boostChannelId: String, defiChannelId: String,
  statsChannelId: String, conseilChannelId: String, missionsChannelId: String,
  reglementChannelId: String, roiDuJourChannelId: String, staffConditionChannelId: String,
  staffCategoryId: String, staffArchiveCategoryId: String,
  pubPostChannelId: String, pubTicketCategoryId: String,
  partnerConditionChannelId: String, partnerCategoryId: String,
  partnerArchiveCategoryId: String, partnerPostChannelId: String,
  staffClassementChannelId: String, giveawayChannelId: String,
  logsChannelId: String, logChannelId: String,
  ticketCategoryId: String,
  coOwnerIds: [{ type: String }],
  kingRoleId: String, singeRoleId: String, coupleRoleId: String,
  guildeDominanteRoleId: String, confirmedRoleId: String, giveawayRoleId: String,
  defisRoleId: String, boostRoleId: String, dailyBonusRoleId: String,
  membreRoleId: String, roiDuJourRoleId: String, staffRoleId: String,
  moderateurRoleId: String, animateurRoleId: String, technicienRoleId: String,
  moderateurStagiaireRoleId: String, animateurStagiaireRoleId: String, technicienStagiaireRoleId: String,
  coOwnerRoleId: String, adminRoleId: String, kingStaffRoleId: String,
  partnerManagerRoleId: String, partnerPingRoleId: String,
  announcePingRoleId: String, announceRoleId: String, boostPingRoleId: String, bumperRoleId: String,
  colorRoleIds: [{ roleId: String, name: String, emoji: String }],
  levelRoles: [{ level: Number, roleId: String }], // rôles attribués automatiquement par palier de niveau
  weeklyLevelRoles: [{ level: Number, roleId: String }], // rôles hebdo (basés sur weekXp, reset dimanche)
  xpPerMessage: { type: Number, default: 15 }, xpCooldown: { type: Number, default: 60 },
  crownHour: { type: Number, default: 20 }, missionsEnabled: { type: Boolean, default: true },
  animeIntervalHours: { type: Number, default: 24 }, animalsIntervalHours: { type: Number, default: 4 },
  trialDays: { type: Number, default: 14 }, pinStarThreshold: { type: Number, default: 5 },
  sassEnabled: { type: Boolean, default: true }, // mode "casse-couilles" : insultes/comebacks/brainrot
  currentMonkeyId: String, currentCouple: [String],
  customEmojis: { type: Object, default: {} },
  // ── Incitation au boost ──────────────────────────────────────────────
  boostGifUrl: String,           // legacy : un seul GIF fixe
  boostGifUrls: [String],        // pool de GIFs/images — un tiré au hasard à chaque boost
  boostXpBonus: { type: Number, default: 0 }, // XP offert au moment du boost
  ghostBotChannelId: String, // salon vocal où le bot reste connecté en silence 24/7
  xpExcludedChannelIds: [String], // salons où aucun XP n'est donné
  countingSingeDurationHours: { type: Number, default: 24 }, // durée du timeout serveur à 3 fautes/semaine
  countingMalusDurationHours: { type: Number, default: 6 },  // durée du malus -XP + blocage counting à CHAQUE faute
  countingMalusPercent: { type: Number, default: 50 },       // % d'XP perdu pendant le malus
  countingXpBonusMultipliers: { type: [Number], default: [6, 12, 24] }, // paliers possibles du multiplicateur Champion
  countingDailyMultiplier: { type: Number, default: 6 },      // multiplicateur tiré au hasard ce jour-ci
  factionMultiplierValue: { type: Number, default: 1 },       // multiplicateur de points bataille actif (1 = aucun)
  factionMultiplierUntil: { type: Date, default: null },      // jusqu'à quand il est actif
}, { timestamps: true });
module.exports = mongoose.models.Config || mongoose.model('Config', schema);
