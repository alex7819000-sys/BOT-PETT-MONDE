// src/handlers/commands.js — Dispatch toutes les slash commands
'use strict';
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../utils/logger');

// ── Définitions (commandes actives : confession, counting, table 7777, + admin) ──

function buildCommands() {
  return [
    // /confession
    new SlashCommandBuilder().setName('confession').setDescription('Envoie une confession anonyme dans le salon dédié'),

    // /aide — Liste des commandes (générée automatiquement depuis cette liste)
    new SlashCommandBuilder().setName('aide').setDescription('Affiche la liste des commandes du bot'),

    // /vocal — Faire rejoindre/quitter un salon vocal au bot
    new SlashCommandBuilder().setName('vocal')
      .setDescription('Faire rejoindre ou quitter un salon vocal au bot')
      .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
      .addSubcommand(s => s.setName('join')
        .setDescription('Le bot rejoint un salon vocal')
        .addChannelOption(o => o.setName('salon').setDescription('Salon vocal à rejoindre').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)))
      .addSubcommand(s => s.setName('leave')
        .setDescription('Le bot quitte le salon vocal')),

    // /stats — Croissance du serveur
    new SlashCommandBuilder().setName('stats')
      .setDescription('Statistiques du serveur')
      .addSubcommand(s => s.setName('croissance').setDescription('Arrivées/départs sur 24h, 7j et 30j')),

    // /invites — Qui a invité qui
    new SlashCommandBuilder().setName('invites')
      .setDescription('Suivi des invitations')
      .addSubcommand(s => s.setName('top').setDescription('Classement des membres qui ont le plus invité'))
      .addSubcommand(s => s.setName('membre')
        .setDescription('Voir les invitations d\'un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre à consulter (toi par défaut)').setRequired(false))),

    // /7777 — Table aléatoire
    new SlashCommandBuilder().setName('7777')
      .setDescription('🎰 Tirage de la table — Tire un chiffre, débloque des rôles')
      .addSubcommand(s => s.setName('roll').setDescription('🎲 Faire un tirage (1 à 7777)'))
      .addSubcommand(s => s.setName('collection').setDescription('📚 Voir ta collection personnelle'))
      .addSubcommand(s => s.setName('leaderboard').setDescription('🏆 Classement des tirages'))
      .addSubcommand(s => s.setName('roles').setDescription('🎭 Voir tous les chiffres liés à des rôles'))
      .addSubcommand(s => s
        .setName('setup')
        .setDescription('(Admin) Définir le salon dédié à la roulette 7777')
        .addChannelOption(o => o.setName('salon').setDescription('Salon où utiliser /7777 roll').setRequired(true)))
      .addSubcommand(s => s
        .setName('addrole')
        .setDescription('(Admin) Lier un chiffre à un rôle (auto si non précisé)')
        .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer').setRequired(true))
        .addIntegerOption(o => o.setName('chiffre').setDescription('Chiffre entre 1 et 7777 (laisse vide = aléatoire)').setRequired(false).setMinValue(1).setMaxValue(7777)))
      .addSubcommand(s => s
        .setName('removerole')
        .setDescription('(Admin) Supprimer le lien chiffre/rôle')
        .addIntegerOption(o => o.setName('chiffre').setDescription('Chiffre à délier').setRequired(true).setMinValue(1).setMaxValue(7777)))
      .addSubcommand(s => s
        .setName('presets')
        .setDescription('(Admin) Crée automatiquement 20 rôles thématiques + les lie à des chiffres')),

    // /counting — statistiques de comptage
    new SlashCommandBuilder().setName('counting').setDescription('📊 Statistiques du salon counting')
      .addSubcommand(s => s.setName('stats').setDescription('Voir tes stats counting ou celles d\'un autre')
        .addUserOption(o => o.setName('user').setDescription('Membre (optionnel)').setRequired(false)))
      .addSubcommand(s => s.setName('reset').setDescription('(Admin) Réinitialiser les erreurs d\'un membre')
        .addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true))),

    // /setup
    new SlashCommandBuilder().setName('setup')
      .setDescription('Configurer le bot').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s.setName('voir').setDescription('Voir la configuration actuelle'))
      .addSubcommand(s => s.setName('init').setDescription('Créer tous les rôles et salons automatiquement'))
      .addSubcommand(s => s.setName('xp').setDescription('Configurer l\'XP')
        .addIntegerOption(o => o.setName('par_message').setDescription('XP par message').setRequired(false))
        .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown en secondes').setRequired(false))
        .addIntegerOption(o => o.setName('heure_king').setDescription('Heure couronnement (0-23)').setRequired(false)))
      .addSubcommand(s => s.setName('salon')
        .setDescription('Configurer un salon')
        .addStringOption(o => o.setName('type').setDescription('Type de salon').setRequired(true).addChoices(
          { name: '📣 Annonces',                    value: 'announceChannelId' },
          { name: '🎮 Forum Jeux Vidéo',             value: 'forumGamingId' },
          { name: '🎌 Forum Anime / Manga / BL',    value: 'forumAnimeId' },
          { name: '🎵 Forum Musique',               value: 'forumMusiqueId' },
          { name: '🐶 Animaux Communauté',          value: 'animalsCommunityChannelId' },
          { name: '💅 Face Reveal',                 value: 'faceRevealChannelId' },
          { name: '🚀 Bump',                        value: 'bumpChannelId' },
          { name: '🤫 SECRET (confessions)',        value: 'secretChannelId' },
          { name: '🔒 Prison du Singe',             value: 'prisonChannelId' },
          { name: '🖼️ Média — ajouter un salon',   value: 'mediaChannelIds' },
          { name: '🔢 Counting',                    value: 'countingChannelId' },
          { name: '📊 Rang (/rk)',               value: 'rankChannelId' },
          { name: '🏆 Trophy Room (podium, roi du jour, récompenses)', value: 'trophyChannelId' },
          { name: '🏆 Podium quotidien (optionnel, sinon Trophy Room)', value: 'podiumChannelId' },
          { name: '⭐ Salon Level Up (notifications)', value: 'levelUpChannelId' },
          { name: '👋 Salon Bienvenue (court)',         value: 'welcomeChannelId' },
          { name: '💬 Débat (forum)',            value: 'debatChannelId' },
          { name: '🤣 Feur/Botus — salon actif',      value: 'feurChannelId' },
          { name: '🎟️ Récompenses invitations',           value: 'inviteChannelId' },
          { name: '📋 Forum Présentations',              value: 'presentationForumId' },
          { name: '💜 Salon boost',                      value: 'boostChannelId' },
          { name: '📋 Quêtes & Défis (panel auto)',  value: 'questsChannelId' },
          { name: '🎫 Catégorie Tickets',                value: 'ticketCategoryId' },
        ))
        .addChannelOption(o => o.setName('salon').setDescription('Le salon à associer').setRequired(true)))
      .addSubcommand(s => s.setName('role')
        .setDescription('Configurer un rôle')
        .addStringOption(o => o.setName('type').setDescription('Type de rôle').setRequired(true).addChoices(
          { name: 'King', value: 'kingRoleId' },
          { name: 'Singe', value: 'singeRoleId' },
          { name: 'Couple', value: 'coupleRoleId' },
          { name: 'Guilde Dominante', value: 'guildeDominanteRoleId' },
          { name: 'Membre Confirmé ✅ (présentation)', value: 'confirmedRoleId' },
          { name: 'Ping Giveaways 🎁', value: 'giveawayRoleId' },
          { name: 'Ping Défis 🔥',     value: 'defisRoleId' },
          { name: '💜 Rôle Booster (attribué auto)', value: 'boostRoleId' },
          { name: '👑 Champion du Counting (bonus XP 24h)', value: 'countingChampionRoleId' },
          { name: '💬 Champion Textuel (podium du jour)', value: 'podiumTextChampionRoleId' },
          { name: '🎙️ Champion Vocal (podium du jour)',   value: 'podiumVoiceChampionRoleId' },
        ))
        .addRoleOption(o => o.setName('role').setDescription('Le rôle').setRequired(true)))
      .addSubcommand(s => s.setName('anime')
        .setDescription('Intervalle Smash or Pass Anime')
        .addIntegerOption(o => o.setName('heures').setDescription('Intervalle en heures').setRequired(true)))
      .addSubcommand(s => s.setName('reset')
        .setDescription('Configurer le jour et heure du reset hebdo')
        .addIntegerOption(o => o.setName('jour').setDescription('Jour (0=Dim 1=Lun 2=Mar 3=Mer 4=Jeu 5=Ven 6=Sam)').setRequired(false).setMinValue(0).setMaxValue(6))
        .addIntegerOption(o => o.setName('heure').setDescription('Heure (0-23)').setRequired(false).setMinValue(0).setMaxValue(23)))
      .addSubcommand(s => s.setName('chatrevive')
        .setDescription('Configurer le Chat Revive')
        .addChannelOption(o => o.setName('salon').setDescription('Salon à revive').setRequired(false))
        .addIntegerOption(o => o.setName('minutes').setDescription('Inactivité avant ping (minutes, défaut 90)').setRequired(false)))
      .addSubcommand(s => s.setName('dmblast')
        .setDescription('Configurer le salon DM Blast')
        .addChannelOption(o => o.setName('salon').setDescription('Salon où écrire pour DM tout le monde').setRequired(true)))
      .addSubcommand(s => s.setName('levelrole')
        .setDescription('Attribuer un rôle à un niveau')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à donner').setRequired(true))
        .addBooleanOption(o => o.setName('retirer').setDescription('Supprimer ce palier ?').setRequired(false)))
      .addSubcommand(s => s.setName('weeklyrole')
        .setDescription('Rôle hebdomadaire attribué selon l\'XP de la semaine (reset dimanche)')
        .addIntegerOption(o => o.setName('xp').setDescription('XP semaine requis').setRequired(true).setMinValue(1))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à donner').setRequired(true))
        .addBooleanOption(o => o.setName('retirer').setDescription('Supprimer ce palier ?').setRequired(false)))
      .addSubcommand(s => s.setName('challenger')
        .setDescription('Définir le rôle Challenger (#2 et #3 hebdo)')
        .addRoleOption(o => o.setName('role').setDescription('Rôle Challenger').setRequired(true)))
      .addSubcommand(s => s.setName('liveboard')
        .setDescription('Créer/initialiser le classement live dans un salon')
        .addChannelOption(o => o.setName('salon').setDescription('Salon #lvl-xp').setRequired(true)))
      .addSubcommand(s => s.setName('logs')
        .setDescription('Définir le salon des logs de modération')
        .addChannelOption(o => o.setName('salon').setDescription('Salon #logs').setRequired(true)))
      .addSubcommand(s => s.setName('couleurpost')
        .setDescription('Poster l\'embed couleur fixe dans un salon')
        .addChannelOption(o => o.setName('salon').setDescription('Salon où poster l\'embed couleur').setRequired(true)))
      .addSubcommand(s => s.setName('staff')
        .setDescription('Configurer le système staff')
        .addStringOption(o => o.setName('cle').setDescription('Clé de config').setRequired(true)
          .addChoices(
            { name: '📋 Salon condition-staff',      value: 'staffConditionChannelId' },
            { name: '📁 Catégorie tickets staff',    value: 'staffCategoryId' },
            { name: '📦 Catégorie archives staff',   value: 'staffArchiveCategoryId' },
            { name: '👥 Rôle Staff global',          value: 'staffRoleId' },
            { name: '🛡️ Rôle Modérateur',           value: 'moderateurRoleId' },
            { name: '🎨 Rôle Animateur',             value: 'animateurRoleId' },
            { name: '🔧 Rôle Technicien',            value: 'technicienRoleId' },
            { name: '🛡️ Rôle Stagiaire Modo',       value: 'moderateurStagiaireRoleId' },
            { name: '🎨 Rôle Stagiaire Anim',        value: 'animateurStagiaireRoleId' },
            { name: '🔧 Rôle Stagiaire Tech',        value: 'technicienStagiaireRoleId' },
          ))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à configurer').setRequired(false))
        .addChannelOption(o => o.setName('salon').setDescription('Salon à configurer').setRequired(false))
        .addStringOption(o => o.setName('gif').setDescription('URL du gif pour l\'embed condition-staff').setRequired(false)))
      .addSubcommand(s => s.setName('post')
        .setDescription('Poster un panel/embed interactif dans son salon configuré')
        .addStringOption(o => o.setName('type').setDescription('Quel panel poster').setRequired(true)
          .addChoices(
            { name: '📋 Condition staff (bouton Candidater)',     value: 'staff' },
            { name: '🤝 Conditions partenariat (bouton Demande)', value: 'partenariat' },
            { name: '📖 Règlement interactif (bouton Accepter)',  value: 'reglement' },
          ))
        .addStringOption(o => o.setName('image').setDescription('URL image/gif/bannière (optionnel)').setRequired(false)))
      .addSubcommand(s => s.setName('partenariat')
        .setDescription('Configurer le système partenariat')
        .addStringOption(o => o.setName('cle').setDescription('Clé de config').setRequired(true)
          .addChoices(
            { name: '📋 Salon conditions partenariat',  value: 'partnerConditionChannelId' },
            { name: '📁 Catégorie tickets partenariat', value: 'partnerCategoryId' },
            { name: '📦 Catégorie archives partenariat',value: 'partnerArchiveCategoryId' },
            { name: '📢 Salon #partenariats',           value: 'partnerPostChannelId' },
            { name: '👑 Rôle gestionnaire partenariats',value: 'partnerManagerRoleId' },
            { name: '🔔 Rôle pingé nouveaux partenariats', value: 'partnerPingRoleId' },
          ))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à configurer').setRequired(false))
        .addChannelOption(o => o.setName('salon').setDescription('Salon à configurer').setRequired(false)))
      .addSubcommand(s => s.setName('kingstaff')
        .setDescription('Configurer le King of the Staff')
        .addStringOption(o => o.setName('cle').setDescription('Clé de config').setRequired(true)
          .addChoices(
            { name: '📊 Salon classement staff', value: 'staffClassementChannelId' },
            { name: '👑 Rôle King of the Staff', value: 'kingStaffRoleId' },
          ))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(false))
        .addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(false)))
      .addSubcommand(s => s.setName('animation')
        .setDescription('Configurer les fonctionnalités animation')
        .addStringOption(o => o.setName('cle').setDescription('Clé de config').setRequired(true)
          .addChoices(
            { name: '📋 Salon règlement',        value: 'reglementChannelId' },
            { name: '👥 Rôle Membre',            value: 'membreRoleId' },
            { name: '🏴‍☠️ Salon Roi du jour',   value: 'roiDuJourChannelId' },
            { name: '👑 Rôle Roi du jour',       value: 'roiDuJourRoleId' },
            { name: '💜 Salon boost',            value: 'boostChannelId' },
            { name: '💜 GIF boost (URL, un seul)', value: 'boostGifUrl' },
            { name: '💜 GIFs boost (URLs, séparées par virgule)', value: 'boostGifUrls' },
            { name: '💜 XP bonus boost',         value: 'boostXpBonus' },
            { name: '📣 Salon annonces',         value: 'announceChannelId' },
            { name: '📣 Rôle ping annonces',      value: 'announcePingRoleId' },
            { name: '📣 Rôle ping général events', value: 'announceRoleId' },
            { name: '💜 Rôle ping boost',          value: 'boostPingRoleId' },
            { name: '💜 Rôle Booster (attribué auto)', value: 'boostRoleId' },
            { name: '🎁 Rôle bonus missions 3/3',  value: 'dailyBonusRoleId' },
            { name: '💡 Salon conseil',          value: 'conseilChannelId' },
            { name: '🟢 Salon défis',             value: 'defiChannelId' },
            { name: '⭐ Seuil épinglage (nb ⭐)', value: 'pinStarThreshold' },
            { name: '📊 Salon statistiques',     value: 'statsChannelId' },
          ))
        .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(false))
        .addChannelOption(o => o.setName('salon').setDescription('Salon').setRequired(false))
        .addStringOption(o => o.setName('valeur').setDescription('Valeur texte ou nombre').setRequired(false)))
      .addSubcommand(s => s.setName('missions')
        .setDescription('Activer/désactiver les missions + configurer le salon')
        .addBooleanOption(o => o.setName('activer').setDescription('Activer les missions').setRequired(false))
        .addChannelOption(o => o.setName('salon').setDescription('Salon missions').setRequired(false)))
      .addSubcommand(s => s.setName('pub')
        .setDescription('Configurer le système tickets pub')
        .addStringOption(o => o.setName('cle').setDescription('Clé').setRequired(true)
          .addChoices(
            { name: '📢 Salon publication des pubs',      value: 'pubPostChannelId' },
            { name: '📁 Catégorie tickets pub',           value: 'pubTicketCategoryId' },
          ))
        .addChannelOption(o => o.setName('salon').setDescription('Salon ou catégorie').setRequired(true)))
      .addSubcommand(s => s.setName('pingroles')
        .setDescription('Poster le message de choix des rôles ping dans un salon')
        .addChannelOption(o => o.setName('salon').setDescription('Salon où poster les boutons de rôles ping').setRequired(true))),

    // /config
    new SlashCommandBuilder().setName('config')
      .setDescription('Configuration avancée du bot').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s.setName('emoji')
        .setDescription('Remplacer un emoji du bot par un emoji custom de ton serveur')
        .addStringOption(o => o.setName('cle').setDescription('Emoji à remplacer').setRequired(true).addChoices(
          { name: '👑 King (couronnement, classement)',  value: 'KING' },
          { name: '⚡ XP / Niveau',                     value: 'XP' },
          { name: '🏆 Victoire / Win',                  value: 'WIN' },
          { name: '⭐ Étoile / Star',                   value: 'STAR' },
          { name: '🚀 Bump',                            value: 'BUMP' },
          { name: '🐒 Singe',                           value: 'SINGE' },
          { name: '💑 Couple',                          value: 'COUPLE' },
          { name: '🏰 Guilde',                          value: 'GUILD' },
          { name: '🤫 Secret / Confession',             value: 'SECRET' },
          { name: '🎌 Anime',                           value: 'ANIME' },
          { name: '🔒 Prison',                          value: 'PRISON' },
          { name: '🐶 Chien',                           value: 'DOG' },
          { name: '🐱 Chat',                            value: 'CAT' },
        ))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji custom du serveur (ex: <:king:123456789>)').setRequired(false))
        .addBooleanOption(o => o.setName('reset').setDescription('Remettre l\'emoji par défaut').setRequired(false)))
      .addSubcommand(s => s.setName('trialdays')
        .setDescription('Durée de la période d\'essai staff (jours)')
        .addIntegerOption(o => o.setName('jours').setDescription('Nombre de jours (défaut: 14)').setRequired(true).setMinValue(1).setMaxValue(90)))
      .addSubcommand(s => s.setName('dmbienvenue')
        .setDescription('⚠️ Envoyer le DM de bienvenue à TOUS les membres existants du serveur'))
      .addSubcommand(s => s.setName('couleurlier')
        .setDescription('Lier un rôle couleur existant au bot (si tu as déjà créé tes rôles)')
        .addRoleOption(o => o.setName('role').setDescription('Rôle couleur à lier').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji de la couleur (ex: 💙)').setRequired(true).setMaxLength(10)))
      .addSubcommand(s => s.setName('couleurretirer')
        .setDescription('Retirer un rôle couleur du menu déroulant')
        .addRoleOption(o => o.setName('role').setDescription('Rôle couleur à retirer').setRequired(true)))
      .addSubcommand(s => s.setName('spawn')
        .setDescription('Modifier les intervalles de spawn de tous les SOP')
        .addIntegerOption(o => o.setName('anime').setDescription('Anime SOP (heures)').setRequired(false))
        .addIntegerOption(o => o.setName('animaux').setDescription('Animaux SOP (heures)').setRequired(false))),

    // /notif
    new SlashCommandBuilder()
      .setName('notif')
      .setDescription('Configurer les systèmes actifs')
      .addSubcommand(s => s.setName('counting')
        .setDescription('Configurer le counting')
        .addIntegerOption(o => o.setName('heures').setDescription('Durée du timeout serveur à 3 fautes/semaine (défaut: 24)').setRequired(false).setMinValue(1).setMaxValue(672))
        .addIntegerOption(o => o.setName('malusheures').setDescription('Durée du malus -XP + blocage counting à CHAQUE faute (défaut: 6)').setRequired(false).setMinValue(1).setMaxValue(168))
        .addIntegerOption(o => o.setName('maluspourcent').setDescription('% d\'XP perdu pendant le malus (défaut: 50)').setRequired(false).setMinValue(0).setMaxValue(100))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji/réaction ajouté automatiquement sur chaque bon chiffre').setRequired(false))
        .addIntegerOption(o => o.setName('duree').setDescription('Secondes avant auto-suppression du message "Nouveau Singe" (défaut: 8)').setRequired(false).setMinValue(2).setMaxValue(60)))
      .addSubcommand(s => s.setName('sanction')
        .setDescription('Configurer le système de signalement/sanctions')
        .addChannelOption(o => o.setName('salon_validation').setDescription('Salon où le staff valide les demandes en attente').setRequired(false))
        .addChannelOption(o => o.setName('salon_signalement').setDescription('Salon public avec le bouton "Faire un signalement"').setRequired(false))
        .addChannelOption(o => o.setName('salon_historique').setDescription('Salon d\'historique des signalements traités').setRequired(false))
        .addRoleOption(o => o.setName('validateur').setDescription('Rôle staff autorisé à valider/refuser (en plus de toi)').setRequired(false))
        .addRoleOption(o => o.setName('role_banvocal').setDescription('Rôle "Ban vocal temporaire" (doit interdire Connect sur les vocaux)').setRequired(false))
        .addRoleOption(o => o.setName('role_banchat').setDescription('Rôle "Ban tchat temporaire" (doit interdire Envoyer messages sur le texte)').setRequired(false))
        .addIntegerOption(o => o.setName('resetjours').setDescription('Jours sans sanction avant de repartir à l\'Avertissement (défaut: 60)').setRequired(false).setMinValue(1).setMaxValue(365)))
      .addSubcommand(s => s.setName('confession')
        .setDescription('Configurer le délai et le visuel des confessions')
        .addIntegerOption(o => o.setName('heures').setDescription('Délai en heures avant révélation (défaut: 48)').setRequired(false).setMinValue(1).setMaxValue(720))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji ou sticker du serveur affiché en vignette sur chaque confession').setRequired(false))),

  ].map(cmd => cmd.toJSON());
}

// ── Enregistrement ─────────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  try {
    const cmds = buildCommands();
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: cmds },
    );
    logger.info('Commands', `${cmds.length} commandes enregistrées`);
  } catch (err) {
    logger.error('Commands', 'Enregistrement échoué', err);
  }
}

// ── Dispatch ───────────────────────────────────────────────────────────────

async function handleCommand(interaction, client) {
  const cmd = interaction.commandName;
  const sub = interaction.options.getSubcommand?.(false);

  try {
    switch (cmd) {

      // ── Aide ────────────────────────────────────────────────────────
      case 'aide':        return require('./commandHandlers/aide').handle(interaction);

      // ── Vocal ───────────────────────────────────────────────────────
      case 'vocal':       return require('./commandHandlers/vocal').handle(interaction);

      // ── Stats & Invitations ────────────────────────────────────────
      case 'stats':       return require('./commandHandlers/stats').handle(interaction);
      case 'invites':     return require('./commandHandlers/invites').handle(interaction);

      // ── Confession ──────────────────────────────────────────────────
      case 'confession':  return require('./commandHandlers/confession').handle(interaction);

      // ── Notifications / config rapide ─────────────────────────────────
      case 'notif':       return require('./commandHandlers/notif').handle(interaction);

      // ── Setup / Config ──────────────────────────────────────────────────
      case 'setup':       return require('./commandHandlers/setup').handle(interaction, client);
      case 'config':      return require('./commandHandlers/setup').handle(interaction, client);

      // ── Table 7777 ──────────────────────────────────────────────────
      case '7777': {
        const sub = interaction.options.getSubcommand();
        const h7777 = require('./commandHandlers/table7777');

        // Commandes admin sans restriction de salon
        if (sub === 'setup') return h7777.handleSetup(interaction);
        if (sub === 'addrole') return h7777.handleAddRole(interaction);
        if (sub === 'removerole') return h7777.handleRemoveRole(interaction);
        if (sub === 'presets') return h7777.handlePresets(interaction);

        // Vérification du salon configuré (uniquement pour roll)
        if (sub === 'roll') {
          const ConfigModel = require('../db/models/Config');
          const cfg = await ConfigModel.findOne({ guildId: interaction.guildId });
          if (cfg && cfg.table7777ChannelId && interaction.channelId !== cfg.table7777ChannelId) {
            return interaction.reply({ content: '❌ Utilise `/7777 roll` dans <#' + cfg.table7777ChannelId + '> !', ephemeral: true });
          }
          return h7777.handleRoll(interaction);
        }
        if (sub === 'collection') return h7777.handleCollection(interaction);
        if (sub === 'leaderboard') return h7777.handleLeaderboard(interaction);
        if (sub === 'roles') return h7777.handleListRoles(interaction);
        break;
      }

      // ── Counting ─────────────────────────────────────────────────────
      case 'counting': {
        const counting = require('./commandHandlers/counting');
        return counting.handle(interaction);
      }

      default:
        logger.debug('Commands', `Commande inconnue: ${cmd}`);
    }
  } catch (err) {
    logger.error('Commands', `Erreur commande /${cmd}`, err);
    const msg = { content: '❌ Une erreur est survenue.', ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
}

module.exports = { registerCommands, handleCommand, buildCommands };
