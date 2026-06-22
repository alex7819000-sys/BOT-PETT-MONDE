// dashboard/lib/configFields.js — Mappe les champs du modèle Config à des formulaires lisibles
// type: 'channel' | 'channels' (multi) | 'category' | 'role' | 'number' | 'text'
'use strict';

const GENERAL_GROUPS = [
  {
    title: 'Salons système',
    icon: '📋',
    fields: [
      { key: 'logsChannelId', label: 'Logs généraux', type: 'channel' },
      { key: 'logChannelId', label: 'Logs (legacy)', type: 'channel' },
      { key: 'statsChannelId', label: 'Statistiques du serveur', type: 'channel' },
      { key: 'missionsChannelId', label: 'Missions staff', type: 'channel' },
    ],
  },
  {
    title: 'Hiérarchie & Staff',
    icon: '👑',
    fields: [
      { key: 'staffCategoryId', label: 'Catégorie tickets staff', type: 'category' },
      { key: 'staffArchiveCategoryId', label: 'Catégorie archives staff', type: 'category' },
      { key: 'staffConditionChannelId', label: 'Conditions de candidature staff', type: 'channel' },
      { key: 'staffClassementChannelId', label: 'Classement King Staff', type: 'channel' },
      { key: 'kingRoleId', label: 'Rôle Owner (King)', type: 'role' },
      { key: 'coOwnerRoleId', label: 'Rôle Co-Owner', type: 'role' },
      { key: 'adminRoleId', label: 'Rôle Admin', type: 'role' },
      { key: 'staffRoleId', label: 'Rôle Staff (global)', type: 'role' },
      { key: 'kingStaffRoleId', label: 'Rôle King Staff (n°1 du classement)', type: 'role' },
      { key: 'moderateurRoleId', label: 'Rôle Modérateur', type: 'role' },
      { key: 'animateurRoleId', label: 'Rôle Animateur', type: 'role' },
      { key: 'technicienRoleId', label: 'Rôle Technicien', type: 'role' },
      { key: 'moderateurStagiaireRoleId', label: 'Rôle Modérateur stagiaire', type: 'role' },
      { key: 'animateurStagiaireRoleId', label: 'Rôle Animateur stagiaire', type: 'role' },
      { key: 'technicienStagiaireRoleId', label: 'Rôle Technicien stagiaire', type: 'role' },
    ],
  },
  {
    title: 'Rôles communauté',
    icon: '🎭',
    fields: [
      { key: 'membreRoleId', label: 'Rôle Membre confirmé', type: 'role' },
      { key: 'confirmedRoleId', label: 'Rôle Confirmé (fin présentation)', type: 'role' },
      { key: 'singeRoleId', label: 'Rôle Singe (Roi du jour perdant)', type: 'role' },
      { key: 'roiDuJourRoleId', label: 'Rôle Roi du jour', type: 'role' },
      { key: 'coupleRoleId', label: 'Rôle Couple', type: 'role' },
      { key: 'guildeDominanteRoleId', label: 'Rôle Guilde dominante', type: 'role' },
      { key: 'boostRoleId', label: 'Rôle Booster', type: 'role' },
      { key: 'dailyBonusRoleId', label: 'Rôle bonus quotidien', type: 'role' },
      { key: 'giveawayRoleId', label: 'Rôle accès Giveaways', type: 'role' },
      { key: 'defisRoleId', label: 'Rôle accès Défis', type: 'role' },
      { key: 'bumperRoleId', label: 'Rôle Bumper', type: 'role' },
      { key: 'announceRoleId', label: 'Rôle Annonceur', type: 'role' },
      { key: 'announcePingRoleId', label: 'Rôle ping Annonces', type: 'role' },
      { key: 'boostPingRoleId', label: 'Rôle ping Boost', type: 'role' },
      { key: 'partnerManagerRoleId', label: 'Rôle gestion Partenariats', type: 'role' },
      { key: 'partnerPingRoleId', label: 'Rôle ping Partenariats', type: 'role' },
    ],
  },
  {
    title: 'Paramètres généraux',
    icon: '⚙️',
    fields: [
      { key: 'crownHour', label: 'Heure de la cérémonie Roi du jour (0-23h)', type: 'number' },
      { key: 'animeIntervalHours', label: 'Intervalle posts anime (heures)', type: 'number' },
      { key: 'animalsIntervalHours', label: 'Intervalle posts animaux (heures)', type: 'number' },
      { key: 'trialDays', label: 'Durée période stagiaire staff (jours)', type: 'number' },
      { key: 'pinStarThreshold', label: 'Réactions ⭐ requises pour épingler', type: 'number' },
    ],
  },
];

const OTHER_SYSTEMS_GROUPS = [
  {
    title: 'Annonces & Communauté',
    icon: '📢',
    fields: [
      { key: 'announceChannelId', label: 'Salon Annonces', type: 'channel' },
      { key: 'bumpChannelId', label: 'Salon Bump', type: 'channel' },
      { key: 'inviteChannelId', label: 'Salon Invitations', type: 'channel' },
      { key: 'boostChannelId', label: 'Salon Boosts', type: 'channel' },
      { key: 'conseilChannelId', label: 'Salon Conseils / suggestions', type: 'channel' },
    ],
  },
  {
    title: 'Confessions & Secrets',
    icon: '🤫',
    fields: [
      { key: 'secretChannelId', label: 'Salon Secrets / Confessions (anonyme)', type: 'channel' },
    ],
  },
  {
    title: 'Anime & Animaux',
    icon: '🐾',
    fields: [
      { key: 'animeChannelId', label: 'Salon Anime', type: 'channel' },
      { key: 'waifuChannelId', label: 'Salon Waifu', type: 'channel' },
      { key: 'animalsAutoChannelId', label: 'Salon Animaux (auto-post)', type: 'channel' },
      { key: 'animalsCommunityChannelId', label: 'Salon Animaux (posts membres)', type: 'channel' },
      { key: 'faceRevealChannelId', label: 'Salon Face Reveal', type: 'channel' },
    ],
  },
  {
    title: 'Débats, Défis & Quiz',
    icon: '🎯',
    fields: [
      { key: 'debatChannelId', label: 'Salon Débats', type: 'channel' },
      { key: 'feurChannelId', label: 'Salon Feur', type: 'channel' },
      { key: 'defiChannelId', label: 'Salon Défis', type: 'channel' },
      { key: 'quizChannelId', label: 'Salon Quiz', type: 'channel' },
    ],
  },
  {
    title: 'Guerre & Guildes',
    icon: '⚔️',
    fields: [
      { key: 'warChannelId', label: 'Salon annonces Guerre de guildes', type: 'channel' },
      { key: 'warChatChannelId', label: 'Salon chat Guerre de guildes', type: 'channel' },
    ],
  },
  {
    title: 'Règlement & Modération',
    icon: '📜',
    fields: [
      { key: 'reglementChannelId', label: 'Salon Règlement', type: 'channel' },
      { key: 'prisonChannelId', label: 'Salon Prison (membres punis)', type: 'channel' },
    ],
  },
  {
    title: 'Roi du jour',
    icon: '👑',
    fields: [
      { key: 'roiDuJourChannelId', label: 'Salon annonces Roi du jour', type: 'channel' },
    ],
  },
  {
    title: 'Giveaways',
    icon: '🎁',
    fields: [
      { key: 'giveawayChannelId', label: 'Salon Giveaways', type: 'channel' },
    ],
  },
  {
    title: 'Partenariats & Publicités',
    icon: '🤝',
    fields: [
      { key: 'pubPostChannelId', label: 'Salon de publication des pubs', type: 'channel' },
      { key: 'pubTicketCategoryId', label: 'Catégorie tickets demande de pub', type: 'category' },
      { key: 'partnerConditionChannelId', label: 'Conditions de partenariat', type: 'channel' },
      { key: 'partnerCategoryId', label: 'Catégorie tickets partenariat', type: 'category' },
      { key: 'partnerArchiveCategoryId', label: 'Catégorie archives partenariat', type: 'category' },
      { key: 'partnerPostChannelId', label: 'Salon de publication des partenariats', type: 'channel' },
    ],
  },
  {
    title: 'Médias',
    icon: '🖼️',
    fields: [
      { key: 'mediaChannelIds', label: 'Salons soumis au filtre médias', type: 'channels' },
    ],
  },
];

// Liste blanche de toutes les clés autorisées en écriture (sécurité — évite l'injection de champs arbitraires)
const ALL_KEYS = [...GENERAL_GROUPS, ...OTHER_SYSTEMS_GROUPS]
  .flatMap((g) => g.fields.map((f) => f.key));

module.exports = { GENERAL_GROUPS, OTHER_SYSTEMS_GROUPS, ALL_KEYS };
