'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: { type: String, unique: true },
  announceChannelId: String, bumpChannelId: String, secretChannelId: String,
  podiumChannelId: String,
  trophyChannelId: String, // 🏆 Salon "trophy-room" — cible unique pour tous les podiums/classements/récompenses (remplace le fallback vers announceChannelId)
  animeChannelId: String, animalsAutoChannelId: String, waifuChannelId: String,
  animalsCommunityChannelId: String, faceRevealChannelId: String, warChannelId: String,
  warChatChannelId: String, quizChannelId: String, prisonChannelId: String,
  forumGamingId: String, forumAnimeId: String, forumMusiqueId: String,

  welcomeChannelId: String,
  welcomeEnabled: { type: Boolean, default: false },
  welcomeShortText: { type: String, default: '' }, // message court dans le chat général
  welcomeColor:   { type: String, default: '#2ecc71' },
  welcomeTitle:   { type: String, default: '' },
  welcomeDesc:    { type: String, default: '' },
  welcomeImage:   { type: String, default: '' },
  welcomeFooter:  { type: String, default: '' },
  welcomeMention: { type: Boolean, default: true },
  // 2ème message de bienvenue style DraftBot (avatar + card)
  welcomeCardChannelId: String,  // salon pour le message carte
  welcomeCardEnabled:   { type: Boolean, default: false },
  welcomeCardText:      { type: String, default: '' }, // texte au-dessus de l'embed
  // ── Système de welcome interactif style Etherya ──────────────────────────
  welcomeInteractiveEnabled: { type: Boolean, default: false },
  welcomeEmbedEmoji: { type: String, default: '⭐' },
  welcomeEmbedTitle: { type: String, default: 'Bienvenue sur {server}!' },
  welcomeEmbedDesc: { type: String, default: 'Hey {user}! 👋\n\nPartage ton pseudo, tes goûts, ta perso...' },
  welcomeSections: [{
    id: String,              // identifiant unique (ex: "comment-ca-marche")
    emoji: String,           // emoji du bouton (ex: "❓")
    title: String,           // titre du bouton (ex: "Comment ça marche?")
    description: String,     // contenu de la réponse
  }],
  welcomeButtons: [{
    id: String,              // identifiant (ex: "present" ou "color")
    emoji: String,           // emoji du bouton
    label: String,           // texte du bouton (ex: "Me présenter")
    action: String,          // "present" ou "color"
  }],
  byeEnabled:     { type: Boolean, default: false },
  byeChannelId:   { type: String, default: '' },
  byeColor:       { type: String, default: '#e74c3c' },
  byeDesc:        { type: String, default: '' },
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
  table7777ChannelId: String,  // salon dédié à la roulette 7777
  levelUpChannelId: String,
  countingCurrent: { type: Number, default: 0 }, countingLastUserId: String,
  countingBestStreak: { type: Number, default: 0 },
  countingChampionRoleId: String, // rôle bonus XP donné au gagnant du classement counting du jour
  podiumTextChampionRoleId: String,  // rôle donné chaque nuit au Top 1 Textuel du podium
  podiumVoiceChampionRoleId: String, // rôle donné chaque nuit au Top 1 Vocal du podium
  countingValidEmoji: { type: String, default: '' }, // emoji ajouté en réaction sur chaque bon chiffre
  countingXpBonusPercent: { type: Number, default: 50 }, // % d'XP bonus pendant 24h
  confessionRevealHours: { type: Number, default: 48 }, // délai avant révélation publique de l'auteur
  confessionXpTop10: { type: [Number], default: [1000, 700, 500, 400, 300, 250, 200, 150, 120, 100] }, // XP/jour par rang (1er→10e)
  confessionThumbnailUrl: { type: String, default: '' }, // vignette (emoji/sticker) affichée sur chaque confession
  confessionCount: { type: Number, default: 0 }, // compteur global pour le numéro #N de chaque confession
  debatChannelId: String, feurChannelId: String, inviteChannelId: String,
  presentationForumId: String, boostChannelId: String, defiChannelId: String,
  statsChannelId: String, conseilChannelId: String, missionsChannelId: String,
  reglementChannelId: String, staffConditionChannelId: String,
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
  membreRoleId: String, staffRoleId: String,
  voiceRoleId: String, // rôle donné aux membres en vocal
  // ── Pings configurables (DM d'accueil interactif) ──────────────────────
  pingRoles: [{
    id: String,        // identifiant unique (ex: "annonces")
    label: String,     // nom affiché (ex: "Annonces")
    emoji: String,     // emoji (ex: "📣")
    desc: String,      // description courte
    roleId: String,    // ID du rôle Discord à attribuer
  }],
  onboardingEnabled: { type: Boolean, default: true }, // activer le DM d'accueil avec les pings
  joinRoleIds: [{ type: String }], // rôles attribués automatiquement à l'arrivée (en plus de membreRoleId)
  moderateurRoleId: String, animateurRoleId: String, technicienRoleId: String,
  moderateurStagiaireRoleId: String, animateurStagiaireRoleId: String, technicienStagiaireRoleId: String,
  coOwnerRoleId: String, adminRoleId: String, kingStaffRoleId: String,
  partnerManagerRoleId: String, partnerPingRoleId: String,
  announcePingRoleId: String, announceRoleId: String, boostPingRoleId: String, bumperRoleId: String,
  colorRoleIds: [{ roleId: String, name: String, emoji: String }],
  levelRoles: [{ level: Number, roleId: String, stackable: { type: Boolean, default: false } }], // rôles attribués automatiquement par palier de niveau
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
  exBoosterReminderDays: { type: Number, default: 21 }, // fréquence des rappels MP aux anciens boosters
  ghostBotChannelId: String, // salon vocal où le bot reste connecté en silence 24/7
  // ── Vocal temporaire ─────────────────────────────────────────────────
  tempVoiceEnabled: { type: Boolean, default: false },
  tempVoiceCreateChannelId: String, // salon "➕ Créer un vocal" à rejoindre
  tempVoiceCategoryId: String,      // catégorie où créer les salons temporaires
  tempVoiceNameTemplate: { type: String, default: '🎙️ {username}' }, // {username} remplacé
  tempVoiceMaxUsers: { type: Number, default: 0 }, // 0 = illimité
  // ── King du Vocal ─────────────────────────────────────────────────────
  voiceKingEnabled: { type: Boolean, default: false },
  voiceKingRoleId: String,          // rôle donné au king du vocal
  voiceKingChannelId: String,       // salon d'annonce (optionnel)
  xpExcludedChannelIds: [String], // salons où aucun XP n'est donné
  countingSingeDurationHours: { type: Number, default: 24 }, // durée du timeout serveur à 3 fautes/semaine
  countingMalusDurationHours: { type: Number, default: 6 },  // durée du malus -XP + blocage counting à CHAQUE faute
  countingMalusPercent: { type: Number, default: 50 },       // % d'XP perdu pendant le malus
  countingSingeMsgAutoDeleteSec: { type: Number, default: 8 }, // durée (sec) avant auto-suppression du message public "Nouveau Singe"
  // ── Système de sanctions (signalement + preuve + validation) ───────────
  sanctionChannelId: String,       // salon où sont postées les demandes en attente (ex: #sanction)
  sanctionValidatorRoleId: String, // rôle staff autorisé à valider/refuser (en plus du owner + co-owners)
  sanctionResetDays: { type: Number, default: 60 }, // jours sans sanction avant de repartir à l'Avertissement
  reportChannelId: String,         // salon avec le panneau "Faire un signalement" (public)
  botUpdatesChannelId: String,     // salon où le bot annonce ses mises à jour à chaque redémarrage
  lastAnnouncedVersion: String,    // dernière version déjà annoncée dans ce salon (évite les doublons)
  lastBumpAt: { type: Date, default: null },        // moment exact du dernier bump Disboard réussi
  bumpReminderSent: { type: Boolean, default: false }, // évite de reping en boucle une fois le cooldown fini
  // ── Chat IA (Gemini) ────────────────────────────────────────────────────
  aiChatTriggerName: String,           // nom que les membres disent pour parler au bot (ex: "sayen")
  aiChatDailyLimit: { type: Number, default: 200 }, // marge de sécurité sous la limite gratuite Gemini
  aiChatUsageToday: { type: Number, default: 0 },
  aiChatUsageDate: String,             // date (YYYY-MM-DD) du compteur ci-dessus, pour savoir quand le remettre à zéro
  reportPanelMessageId: String,    // message du panneau (pour le rafraîchir sans dupliquer)
  sanctionHistoryChannelId: String,// salon d'historique des signalements traités (validés/refusés)
  voiceBanRoleId: String,          // rôle "Ban vocal temporaire" — doit interdire Connect sur les vocaux
  chatBanRoleId: String,           // rôle "Ban tchat temporaire" — doit interdire Envoyer messages sur le texte
  countingXpBonusMultipliers: { type: [Number], default: [6, 12, 24] }, // paliers possibles du multiplicateur Champion
  countingDailyMultiplier: { type: Number, default: 6 },      // multiplicateur tiré au hasard ce jour-ci
  // ── Système de règlement style Etherya ─────────────────────────────────
  reglementEnabled: { type: Boolean, default: false },
  reglementChannelId: String,           // salon où poster le règlement
  reglementColor: { type: String, default: '#2ecc71' }, // couleur principale des embeds
  reglementImage: { type: String, default: '' },       // image bannière/header (URL)
  reglementSections: [{
    id: String,            // identifiant unique (ex: "regles-generales")
    title: String,         // titre de la section (ex: "📋 Règles générales")
    description: String,   // contenu avec règles numérotées
    emoji: String,         // emoji (ex: "📋")
  }],
}, { timestamps: true });
module.exports = mongoose.models.Config || mongoose.model('Config', schema);
