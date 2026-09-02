// src/config/changelog.js — Historique détaillé des versions, utilisé pour annoncer
// automatiquement les mises à jour dans le salon configuré (voir systems/updateAnnounce.js).
//
// Structure par version — chaque catégorie est optionnelle (omets-la si vide) :
//   title    : titre court de la version (1 ligne, affiché en haut de l'annonce)
//   added    : nouvelles fonctionnalités
//   changed  : comportements existants modifiés/améliorés
//   fixed    : bugs corrigés
//   removed  : fonctionnalités retirées
//
// ⚠️ À chaque nouvelle session de travail sur le bot : monter CURRENT_VERSION
// d'un cran et ajouter une entrée complète et détaillée ici (comme un vrai
// changelog de produit — pas juste "quelques trucs corrigés"). Langage clair
// pour le staff/les membres, mais précis et complet : ce qui a été ajouté,
// ce qui a changé, ce qui a été corrigé et pourquoi, ce qui a été retiré.
'use strict';

const CURRENT_VERSION = 'v94';

const CHANGELOG = {
  v94: {
    title: '/setup init répare pour de vrai',
    fixed: [
      '`/setup init` répondait "salons créés" sans rien créer du tout — corrigé, il crée maintenant réellement toute la structure de salons staff (2 catégories, 15 salons), privée au rôle Staff',
    ],
  },

  v93: {
    title: 'Réparation de 7 commandes fantômes',
    fixed: [
      '7 sous-commandes de `/setup` (staff, partenariat, kingstaff, pub, logs, couleurpost, post) ne faisaient strictement rien depuis toujours — corrigé, elles fonctionnent maintenant vraiment',
    ],
  },

  v92: {
    title: 'Chat IA limitable à un salon',
    added: [
      'Le chat IA peut maintenant être limité à un seul salon (`/notif ia nom:xxx salon:#chat-principal`) — il ne répond plus ailleurs sur le serveur si vous le souhaitez',
    ],
  },

  v91: {
    title: 'Chat IA — correction du modèle',
    fixed: [
      'Le chat IA échouait par intermittence ("j\'ai eu un souci pour répondre") — Google avait retiré le modèle utilisé pour les nouvelles clés API. Basculé sur le modèle de remplacement recommandé par Google',
      'Ajouté une protection contre la limite "15 messages/minute" de Google (en plus de la limite journalière déjà gérée) — si plusieurs personnes parlent au bot en même temps, il répond poliment plutôt que de planter',
    ],
  },

  v90: {
    title: 'Chat IA',
    added: [
      'Le bot peut maintenant discuter avec vous ! Mentionnez-le ou dites son nom déclencheur (réglé par le staff) pour lancer une conversation — il garde en tête le fil récent de la discussion, ton familier et fun',
      '100% gratuit à faire tourner (API Google Gemini), avec une limite de sécurité par jour pour ne jamais planter',
    ],
  },

  v89: {
    title: 'Bug bump corrigé + nouvelles stats',
    added: [
      '`/stats actifs` — top des membres avec le plus d\'XP total (cumul depuis toujours)',
      '`/stats vocal` — top des membres avec le plus de temps cumulé en vocal',
      '`/stats salons` — quels salons du serveur sont les plus utilisés',
    ],
    fixed: [
      '**Le rappel de bump ne fonctionnait pas du tout** — un interrupteur interne n\'était jamais activé nulle part dans le bot, bloquant silencieusement toute la fonctionnalité depuis toujours. Supprimé : configurer le salon suffit maintenant à l\'activer',
    ],
  },

  v88: {
    title: 'Retours du staff pris en compte',
    added: [
      'Graphique visuel dans `/stats croissance` — barres arrivées/départs par jour + ligne de solde net, avec choix de la période (7/14/30 jours)',
      'Détails supplémentaires sur la croissance : moyenne d\'arrivées/jour, meilleur et pire jour de la période',
    ],
    changed: [
      'Le salon "maj du bot" se configure maintenant avec `/notif maj salon:#xxx` — plus simple et plus facile à trouver qu\'avant',
    ],
    fixed: [
      'Correction d\'une erreur de documentation : le salon de mise à jour avait été indiqué avec la mauvaise commande',
    ],
  },

  v87: {
    title: 'Rappel de bump rendu précis',
    fixed: [
      'Le rappel de bump partait sur un horaire fixe toutes les 2h, sans savoir quand le dernier bump avait vraiment eu lieu — pouvait ping trop tôt (cooldown pas terminé) selon le moment réel du bump précédent',
      'L\'embed affichait "2 min de cooldown" pour Disboard — c\'est 2 heures, corrigé',
    ],
    changed: [
      'Chaque bump réussi enregistre maintenant l\'heure exacte, et le bot vérifie toutes les 5 minutes si les 2h sont vraiment écoulées avant de ping — le rappel arrive pile au bon moment, sans reping en boucle',
    ],
  },

  v86: {
    title: 'Rôle Bumper accessible depuis Discord',
    added: [
      'Nouvelle catégorie "🚀 Rappels de Bump" dans le panel de pings self-serve — les membres peuvent maintenant s\'abonner eux-mêmes d\'un clic pour être pingés à chaque fois qu\'il faut bumper le serveur',
    ],
    fixed: [
      'Le rôle Bumper (ping automatique au moment du bump) n\'était réglable que depuis le dashboard web — impossible de le configurer depuis Discord. Ajouté aux choix de `/setup role`',
    ],
  },

  v85: {
    title: 'Changelog détaillé et catégorisé',
    changed: [
      'Le format des annonces de mise à jour passe d\'une simple liste à un vrai changelog structuré : Nouveautés / Modifié / Corrigé / Retiré, avec bien plus de détail sur chaque changement',
    ],
  },

  v84: {
    title: 'Annonces de mise à jour automatiques',
    added: [
      'Le bot annonce désormais automatiquement ses mises à jour dans un salon dédié (`/setup salon type:"🤖 Salon maj du bot"`), à chaque redémarrage où le code a changé',
      'Ne poste qu\'une seule fois par version — même si le bot redémarre plusieurs fois dans la journée sans changement de code (mémorisé en base), pas de spam',
    ],
  },

  v83: {
    title: 'Nettoyage complet de la confusion "King of the Day"',
    changed: [
      '"King of the Day" renommé partout en **"Champion du Jour"** — évite la confusion avec le rôle King permanent du owner',
      'Les 2 rôles Champion (Textuel/Vocal) sont maintenant configurables proprement depuis la page dashboard "Rôles spéciaux"',
    ],
    fixed: [
      'Résidus de la Bataille chien/chat (retirée en v76) qui traînaient encore dans le panel d\'info `/info` nettoyés',
    ],
    removed: [
      'Suppression d\'un ancien système de couronnement ("Roi du jour" à 20h30) qui n\'était en réalité **jamais exécuté** — du code mort qui, s\'il avait tourné, serait entré en conflit avec le vrai podium quotidien de minuit',
    ],
  },

  v82: {
    title: 'Système d\'XP solidifié',
    fixed: [
      '**Le plus important** : monter de niveau en vocal ne donnait jamais les rôles de niveau ni les rôles hebdomadaires — seul le texte les donnait vraiment, malgré l\'annonce "LEVEL UP" affichée dans les deux cas. Un membre actif uniquement en vocal pouvait grimper plusieurs paliers sans jamais rien recevoir',
      'Le message d\'aide XP en jeu promettait que les réactions et les invitations donnaient de l\'XP — jamais codé, jamais eu la moindre ligne de logique derrière. Corrigé avec les vraies sources d\'XP',
      'Ce même message recommandait `/niveau` et `/top`, deux commandes supprimées depuis longtemps — remplacé par des infos exactes',
    ],
    removed: [
      '`/setup multixp` (bonus XP par salon) retirée — commande déclarée mais strictement aucun code derrière, ne faisait rien',
    ],
  },

  v81: {
    title: 'Fix de l\'avatar sur les annonces de boost',
    fixed: [
      'L\'embed "NOUVEAU BOOST !" affichait parfois une miniature vide — un réglage technique Discord (Partial) manquant empêchait de récupérer l\'avatar à temps. Corrigé, avec une sécurité supplémentaire en cas d\'échec',
    ],
  },

  v80: {
    title: 'Nouvelle commande /aide',
    added: [
      '`/aide` — liste toutes les commandes du bot (avec sous-commandes et description). Générée automatiquement depuis le vrai code des commandes, donc toujours exacte, même après de futurs ajouts',
    ],
  },

  v79: {
    title: 'Audit complet du bot',
    fixed: [
      'Un classement hebdomadaire du jeu 7777 plantait silencieusement chaque semaine (pointait vers un fichier obsolète) — supprimé, cette fonctionnalité n\'existe plus dans le système actuel',
      'La page dashboard "Embeds" plantait systématiquement à l\'ouverture (variable manquante) — corrigée',
    ],
  },

  v78: {
    title: 'Rôles Champion pour le podium',
    added: [
      '2 rôles "Champion" optionnels, attribués chaque nuit au gagnant du podium (Textuel et Vocal séparément), configurables via `/setup role`',
    ],
  },

  v77: {
    title: 'Podium quotidien simplifié',
    changed: [
      'Le podium de minuit passe de 5 catégories façon top 3 (XP, messages, images, bumps, vocal) à seulement **2 champions clairs** : Top 1 Textuel et Top 1 Vocal',
      'Chaque champion voit désormais afficher son nombre de fois n°1 au total (compteur permanent, jamais remis à zéro)',
    ],
  },

  v76: {
    title: 'Suppression de la Bataille chien/chat',
    removed: [
      'Système complet retiré (peu utilisé par les membres) : détection chien/chat, factions, `/guerre`, et tous les rôles/salons associés',
    ],
  },
};

module.exports = { CURRENT_VERSION, CHANGELOG };
