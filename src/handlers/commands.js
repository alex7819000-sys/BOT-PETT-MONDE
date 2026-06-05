// src/handlers/commands.js — Dispatch toutes les slash commands
'use strict';
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

// ── Définitions ────────────────────────────────────────────────────────────

function buildCommands() {
  return [
    // /xp
    new SlashCommandBuilder().setName('xp').setDescription('Voir ton XP et niveau'),
    // /classement
    new SlashCommandBuilder().setName('classement').setDescription('Classements du serveur')
      .addStringOption(o => o.setName('type').setDescription('Type de classement').setRequired(false).addChoices(
        { name: '📅 XP Semaine',      value: 'weekXp' },
        { name: '⭐ XP Total',        value: 'totalXp' },
        { name: '👑 Couronnes King',  value: 'crownCount' },
        { name: '🚀 Bumps',          value: 'bumpCount' },
        { name: '🎌 Quiz Anime',     value: 'quizWins' },
        { name: '⚔️ Guerre Animale', value: 'teamXp' },
      )),
    // /profil
    new SlashCommandBuilder().setName('profil').setDescription('Voir le profil d\'un membre')
      .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(false)),
    // /rk — commande rank publique style Statbot (3 lettres)
    new SlashCommandBuilder().setName('rk')
      .setDescription('Voir ton niveau et stats — public !')
      .addUserOption(o => o.setName('membre').setDescription('Voir le profil d\'un autre membre').setRequired(false)),
    // /stats
    new SlashCommandBuilder().setName('stats').setDescription('Statistiques du serveur'),

    // /anime
    new SlashCommandBuilder().setName('anime')
      .setDescription('Smash or Pass Anime')
      .addSubcommand(s => s.setName('now').setDescription('Poster un perso maintenant'))
      .addSubcommand(s => s.setName('classement').setDescription('Top persos les plus smashés')),

    // /waifu
    new SlashCommandBuilder().setName('waifu')
      .setDescription('Soumettre un personnage/waifu')
      .addSubcommand(s => s.setName('soumettre').setDescription('Soumettre ton perso favori')
        .addStringOption(o => o.setName('nom').setDescription('Nom du personnage').setRequired(true))
        .addStringOption(o => o.setName('image').setDescription('URL de l\'image').setRequired(true))
        .addStringOption(o => o.setName('anime').setDescription('Nom de l\'anime').setRequired(false)))
      .addSubcommand(s => s.setName('classement').setDescription('Top waifus les plus smashés')),

    // /animaux
    new SlashCommandBuilder().setName('animaux')
      .setDescription('Smash or Pass Animaux')
      .addSubcommand(s => s.setName('now').setDescription('Poster un animal maintenant'))
      .addSubcommand(s => s.setName('soumettre').setDescription('Soumettre ton animal préféré')
        .addStringOption(o => o.setName('nom').setDescription('Nom de ton animal').setRequired(true))
        .addAttachmentOption(o => o.setName('image').setDescription('Photo de ton animal').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description (optionnel)').setRequired(false)))
      .addSubcommand(s => s.setName('classement').setDescription('Top animaux les plus smashés')),

    // /facereveal
    new SlashCommandBuilder().setName('facereveal')
      .setDescription('Face Reveal — Smash or Pass membres')
      .addSubcommand(s => s.setName('soumettre').setDescription('Soumettre une photo anonyme')
        .addAttachmentOption(o => o.setName('image').setDescription('Ta photo').setRequired(true))
        .addStringOption(o => o.setName('titre').setDescription('Titre (optionnel)').setRequired(false)))
      .addSubcommand(s => s.setName('classement').setDescription('Classement des faces')),

    // /cat /dog
    new SlashCommandBuilder().setName('cat').setDescription('Photo de chat aléatoire 🐱'),
    new SlashCommandBuilder().setName('dog').setDescription('Photo de chien aléatoire 🐶'),

    // /guerre
    new SlashCommandBuilder().setName('guerre')
      .setDescription('Guerre Chien vs Chat')
      .addSubcommand(s => s.setName('stats').setDescription('Score de la semaine'))
      .addSubcommand(s => s.setName('equipe').setDescription('Rejoindre une équipe'))
      .addSubcommand(s => s.setName('membres').setDescription('Voir les membres de chaque équipe')),

    // /guilde
    new SlashCommandBuilder().setName('guilde')
      .setDescription('Système de guildes')
      .addSubcommand(s => s.setName('creer').setDescription('Créer une guilde (niveau 10+)')
        .addStringOption(o => o.setName('nom').setDescription('Nom de la guilde').setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false)))
      .addSubcommand(s => s.setName('rejoindre').setDescription('Rejoindre une guilde')
        .addStringOption(o => o.setName('id').setDescription('ID de la guilde').setRequired(true)))
      .addSubcommand(s => s.setName('quitter').setDescription('Quitter ta guilde'))
      .addSubcommand(s => s.setName('info').setDescription('Infos sur ta guilde ou une autre')
        .addStringOption(o => o.setName('id').setDescription('ID de la guilde').setRequired(false)))
      .addSubcommand(s => s.setName('classement').setDescription('Classement des guildes')),

    // /singe
    new SlashCommandBuilder().setName('singe')
      .setDescription('Singe du Serveur')
      .addSubcommand(s => s.setName('nominer').setDescription('Nominer quelqu\'un')
        .addUserOption(o => o.setName('membre').setDescription('Membre à nominer').setRequired(true)))
      .addSubcommand(s => s.setName('stats').setDescription('Stats des nominations'))
      .addSubcommand(s => s.setName('actuel').setDescription('Qui est le singe actuel ?')),

    // /couple
    new SlashCommandBuilder().setName('couple')
      .setDescription('Meilleur Couple')
      .addSubcommand(s => s.setName('nominer').setDescription('Nominer un couple')
        .addUserOption(o => o.setName('membre1').setDescription('Membre 1').setRequired(true))
        .addUserOption(o => o.setName('membre2').setDescription('Membre 2').setRequired(true)))
      .addSubcommand(s => s.setName('actuel').setDescription('Qui est le meilleur couple ?')),

    // /quiz
    new SlashCommandBuilder().setName('quiz')
      .setDescription('Quiz Anime')
      .addSubcommand(s => s.setName('classement').setDescription('Top joueurs quiz'))
      .addSubcommand(s => s.setName('moi').setDescription('Mes stats quiz')),

    // /confession
    new SlashCommandBuilder().setName('secret').setDescription('Partager un secret ou une confession'),
    new SlashCommandBuilder().setName('debat').setDescription('Lancer un débat dans le forum').addSubcommand(s => s.setName('creer').setDescription('Créer un nouveau débat')),

    // /giveaway
    new SlashCommandBuilder().setName('giveaway').setDescription('Gérer les giveaways')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName('creer').setDescription('Créer un giveaway')
        .addStringOption(o => o.setName('lot').setDescription('Le lot à gagner (ex: 2000 kakera)').setRequired(true))
        .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 30m, 2h, 1j, 1h30m)').setRequired(true))
        .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(10)))
      .addSubcommand(s => s.setName('terminer').setDescription('Terminer un giveaway manuellement')
        .addStringOption(o => o.setName('message_id').setDescription('ID du message giveaway').setRequired(true))),

    // /missions
    new SlashCommandBuilder().setName('missions').setDescription('Voir tes missions de la semaine')
      .addUserOption(o => o.setName('membre').setDescription('Voir les missions d\'un autre membre')),

    // /defis
    new SlashCommandBuilder().setName('defis').setDescription('Défis communautaires avec récompenses XP & kakera')
      .addSubcommand(s => s.setName('liste').setDescription('Voir les défis actifs'))
      .addSubcommand(s => s.setName('creer').setDescription('Créer un nouveau défi (Admin)')
        .addStringOption(o => o.setName('type').setDescription('Type de défi').setRequired(false)
          .addChoices(
            { name: '💬 Messages', value: 'messages' },
            { name: '🚀 Bumps',    value: 'bumps' },
            { name: '📨 Invites',  value: 'invites' },
            { name: '🎙️ Vocal',   value: 'vocal' },
            { name: '⚡ Custom',   value: 'custom' },
          ))
        .addStringOption(o => o.setName('titre').setDescription('Titre du défi').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Description du défi').setRequired(false))
        .addIntegerOption(o => o.setName('objectif').setDescription('Objectif numérique à atteindre').setRequired(false))
        .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 7j, 48h, 3j12h)').setRequired(false))
        .addIntegerOption(o => o.setName('xp').setDescription('XP King à gagner').setRequired(false))
        .addIntegerOption(o => o.setName('kakera').setDescription('Kakera Mudae à gagner').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Rôle bonus pour les gagnants').setRequired(false))),

    // /pub
    new SlashCommandBuilder().setName('pub')
      .setDescription('Gérer les pubs planifiées').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand(s => s.setName('creer').setDescription('Créer une nouvelle pub'))
      .addSubcommand(s => s.setName('liste').setDescription('Voir toutes les pubs'))
      .addSubcommand(s => s.setName('supprimer').setDescription('Supprimer une pub')
        .addStringOption(o => o.setName('id').setDescription('ID de la pub').setRequired(true)))
      .addSubcommand(s => s.setName('toggle').setDescription('Activer/désactiver une pub')
        .addStringOption(o => o.setName('id').setDescription('ID de la pub').setRequired(true))),

    // /bumpstats
    new SlashCommandBuilder().setName('bumpstats').setDescription('Classement des meilleurs bumpeurs'),

    // /mabump
    new SlashCommandBuilder()
      .setName('mabump')
      .setDescription('Voir tes stats de bump/vote détaillées par source')
      .addUserOption(o => o.setName('membre').setDescription('Voir les stats d\'un autre membre').setRequired(false)),

    // /notif
    new SlashCommandBuilder().setName('notif')
      .setDescription('Partager un lien manuellement')
      .addStringOption(o => o.setName('message').setDescription('Texte du message').setRequired(true))
      .addStringOption(o => o.setName('lien').setDescription('Lien').setRequired(false))
      .addStringOption(o => o.setName('image').setDescription('URL image/miniature').setRequired(false)),

    // /infos
    new SlashCommandBuilder().setName('infos').setDescription('📋 Voir toutes les commandes du bot'),

    // /presentation
    new SlashCommandBuilder().setName('presentation').setDescription('Gère ta présentation sur le serveur')
      .addSubcommand(s => s.setName('reprendre').setDescription('Reprendre ou commencer ta présentation (envoyé en MP)'))
      .addSubcommand(s => s.setName('modifier').setDescription('Recommencer ta présentation depuis le début'))
      .addSubcommand(s => s.setName('voir').setDescription('Aperçu de ta présentation actuelle')),

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
          { name: '🎌 Anime Smash or Pass',         value: 'animeChannelId' },
          { name: '🐾 Animaux Auto',                value: 'animalsAutoChannelId' },
          { name: '🗳️ Waifu / Perso Communauté',   value: 'waifuChannelId' },
          { name: '🐶 Animaux Communauté',          value: 'animalsCommunityChannelId' },
          { name: '💅 Face Reveal',                 value: 'faceRevealChannelId' },
          { name: '🚀 Bump',                        value: 'bumpChannelId' },
          { name: '🤫 SECRET (confessions)',        value: 'secretChannelId' },
          { name: '⚔️ Guerre résultats',            value: 'warChannelId' },
          { name: '⚔️ Guerre chat actif',          value: 'warChatChannelId' },
          { name: '🎯 Quiz Anime',                  value: 'quizChannelId' },
          { name: '🔒 Prison du Singe',             value: 'prisonChannelId' },
          { name: '🖼️ Média — ajouter un salon',   value: 'mediaChannelIds' },
          { name: '🔢 Counting',                    value: 'countingChannelId' },
          { name: '📊 Rang (/rk)',               value: 'rankChannelId' },
          { name: '💬 Débat (forum)',            value: 'debatChannelId' },
          { name: '🤣 Feur/Botus — salon actif',      value: 'feurChannelId' },
          { name: '🎟️ Récompenses invitations',           value: 'inviteChannelId' },
          { name: '📋 Forum Présentations',              value: 'presentationForumId' },
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
        .addRoleOption(o => o.setName('role').setDescription('Rôle à donner').setRequired(true)))
      .addSubcommand(s => s.setName('spawn')
        .setDescription('Modifier les intervalles de spawn de tous les SOP')
        .addIntegerOption(o => o.setName('anime').setDescription('Anime SOP (heures)').setRequired(false))
        .addIntegerOption(o => o.setName('animaux').setDescription('Animaux SOP (heures)').setRequired(false)))
      .addSubcommand(s => s.setName('youtube')
        .setDescription('Configurer les notifications YouTube')
        .addStringOption(o => o.setName('channel_id').setDescription('ID de ta chaîne YouTube').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon Discord pour les notifs').setRequired(true)))
      .addSubcommand(s => s.setName('twitch')
        .setDescription('Configurer les notifications Twitch')
        .addStringOption(o => o.setName('username').setDescription('Ton pseudo Twitch').setRequired(true))
        .addChannelOption(o => o.setName('salon').setDescription('Salon Discord pour les notifs').setRequired(true)))
      .addSubcommand(s => s.setName('counting')
        .setDescription('Configurer le counting')
        .addIntegerOption(o => o.setName('timeout').setDescription('Durée punition en minutes (défaut: 5)').setRequired(false).setMinValue(1).setMaxValue(60)))
      .addSubcommand(s => s.setName('fixmedia')
        .setDescription('Corriger les permissions des salons média (threads libres)'))
      .addSubcommand(s => s.setName('retiremedia')
        .setDescription('Retirer un salon de la liste média')
        .addChannelOption(o => o.setName('salon').setDescription('Salon à retirer').setRequired(true)))
      .addSubcommand(s => s.setName('animalmention')
        .setDescription('Activer/désactiver la détection d\'animaux en fin de phrase'))
      .addSubcommand(s => s.setName('guerre')
        .setDescription('Configurer les rôles de la guerre chien vs chat')
        .addRoleOption(o => o.setName('rolechien').setDescription('Rôle Team Chien').setRequired(false))
        .addRoleOption(o => o.setName('rolechat').setDescription('Rôle Team Chat').setRequired(false)))
      .addSubcommand(s => s.setName('animaltrigger')
        .setDescription('Activer les sons animaux (woaf/miaou → image) dans un salon')
        .addChannelOption(o => o.setName('salon').setDescription('Salon où ça marche (vide = désactiver)').setRequired(false)))
      .addSubcommand(s => s.setName('ghostbot')
        .setDescription('Ghost Bot — connexion vocale silencieuse 24/7')
        .addChannelOption(o => o.setName('salon').setDescription('Canal vocal (vide = désactiver)').setRequired(false)))
      .addSubcommand(s => s.setName('invitetracker')
        .setDescription('Activer/désactiver le suivi des invitations (+XP inviteur)'))
      .addSubcommand(s => s.setName('bumprole')
        .setDescription('Rôle pingé pour les rappels de bump')
        .addRoleOption(o => o.setName('role').setDescription('Rôle à pinger').setRequired(false)))
      .addSubcommand(s => s.setName('streak')
        .setDescription('Activer/désactiver le streak journalier (+XP bonus si actif chaque jour)'))
      .addSubcommand(s => s.setName('giveaway')
        .setDescription('Salon où seront postés les giveaways')
        .addChannelOption(o => o.setName('salon').setDescription('Salon giveaway (vide = salon de la commande)').setRequired(false)))
      .addSubcommand(s => s.setName('defis')
        .setDescription('Salon des défis communautaires')
        .addChannelOption(o => o.setName('salon').setDescription('Salon défis').setRequired(false)))
      .addSubcommand(s => s.setName('mudae')
        .setDescription('Salon Mudae pour les récompenses kakera ($give automatique)')
        .addChannelOption(o => o.setName('salon').setDescription('Salon Mudae').setRequired(true)))
      .addSubcommand(s => s.setName('exclusion')
        .setDescription('Exclure/inclure un salon du gain XP')
        .addChannelOption(o => o.setName('salon').setDescription('Salon à exclure/inclure').setRequired(true))),

  ].map(cmd => cmd.toJSON());
}

// ── Enregistrement ─────────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  try {
    const cmds = buildCommands();
    await rest.put(
      Routes.applicationGuildCommands(
        (await rest.get(Routes.user())).id,
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

      // ── XP & Stats ──────────────────────────────────────────────────
      case 'rk':          return require('./commandHandlers/rk').handle(interaction);
      case 'xp':
      case 'profil':      return require('./commandHandlers/xp').handle(interaction);
      case 'classement':  return require('./commandHandlers/xp').classement(interaction);
      case 'stats':       return require('./commandHandlers/stats').handle(interaction);

      // ── Smash or Pass ───────────────────────────────────────────────
      case 'anime':       return require('./commandHandlers/smash').handleAnime(interaction, client);
      case 'waifu':       return require('./commandHandlers/smash').handleWaifu(interaction, client);
      case 'animaux':     return require('./commandHandlers/smash').handleAnimaux(interaction, client);
      case 'facereveal':  return require('./commandHandlers/smash').handleFaceReveal(interaction, client);
      case 'cat':         return require('./commandHandlers/animals').handleCat(interaction);
      case 'dog':         return require('./commandHandlers/animals').handleDog(interaction);

      // ── Guerre ──────────────────────────────────────────────────────
      case 'guerre':      return require('./commandHandlers/guerre').handle(interaction);

      // ── Guildes ─────────────────────────────────────────────────────
      case 'guilde':      return require('./commandHandlers/guildes').handle(interaction);

      // ── Singe ───────────────────────────────────────────────────────
      case 'singe':       return require('./commandHandlers/singe').handle(interaction);
      case 'infos':       return require('./commandHandlers/infos').handle(interaction);
      case 'giveaway':    return require('./commandHandlers/giveaway').handle(interaction);
      case 'missions':    return require('./commandHandlers/missions').handle(interaction);
      case 'defis':       return require('./commandHandlers/defis').handle(interaction);

      // ── Couple ──────────────────────────────────────────────────────
      case 'couple':      return require('./commandHandlers/couple').handle(interaction);

      // ── Quiz ────────────────────────────────────────────────────────
      case 'quiz':        return require('./commandHandlers/quiz').handle(interaction);

      // ── Confession ──────────────────────────────────────────────────
      case 'secret':      return require('./commandHandlers/secret').handle(interaction);
      case 'confession':  return require('./commandHandlers/confession').handle(interaction);
      case 'debat':       return require('./commandHandlers/debat').handle(interaction);

      // ── Pubs ────────────────────────────────────────────────────────
      case 'pub':         return require('./commandHandlers/pubs').handle(interaction);
      case 'bumpstats':   return require('./commandHandlers/bump').handle(interaction);
      case 'mabump':      return require('./commandHandlers/bump').handleMaBump(interaction);
      case 'notif':       return require('./commandHandlers/notif').handle(interaction);

      // ── Setup ───────────────────────────────────────────────────────
      case 'setup':       return require('./commandHandlers/setup').handle(interaction, client);

      // ── Présentation ────────────────────────────────────────────────
      case 'presentation': {
        const pres = require('../systems/presentation');
        const sub  = interaction.options.getSubcommand();
        if (sub === 'reprendre') return pres.handleReprendreCommand(interaction, client);
        if (sub === 'modifier')  return pres.handleModifierCommand(interaction, client);
        if (sub === 'voir')      return pres.handleVoirCommand(interaction);
        break;
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

module.exports = { registerCommands, handleCommand };
