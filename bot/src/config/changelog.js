// src/config/changelog.js — Historique des versions, utilisé pour annoncer
// automatiquement les mises à jour dans le salon configuré (voir systems/updateAnnounce.js).
//
// ⚠️ À chaque nouvelle session de travail sur le bot : monter CURRENT_VERSION
// d'un cran et ajouter une entrée courte (3-5 bullets max, langage simple pour
// le staff/les membres — pas le niveau de détail technique de PROJECT.md).
'use strict';

const CURRENT_VERSION = 'v84';

const CHANGELOG = {
  v84: [
    '📢 Nouveau : le bot annonce maintenant ses mises à jour ici, à chaque redémarrage avec du nouveau code',
  ],
  v83: [
    '🏆 "King of the Day" renommé en "Champion du Jour" (évite la confusion avec le rôle King permanent)',
    '🧹 Suppression d\'un ancien système de couronnement mort, jamais utilisé',
    'Derniers résidus de la Bataille chien/chat nettoyés',
  ],
  v82: [
    '⚡ Corrigé : monter de niveau en vocal ne donnait jamais les rôles (seul le texte le faisait avant)',
    '🗑️ Suppression de `/setup multixp` (ne faisait rien, jamais implémentée)',
    '📖 Message d\'aide XP corrigé — infos exactes, plus de fausses promesses',
  ],
  v81: [
    '🖼️ Fix de l\'avatar manquant sur l\'annonce de boost',
  ],
  v80: [
    '📖 Nouvelle commande `/aide` — liste toutes les commandes du bot, toujours à jour automatiquement',
  ],
  v79: [
    '🔍 Vérification complète du bot — 2 bugs silencieux corrigés (classement 7777 hebdo, page dashboard embeds)',
  ],
  v78: [
    '🏆 2 nouveaux rôles Champion (Textuel / Vocal) attribués chaque nuit au plus actif',
  ],
  v77: [
    '🏆 Podium quotidien simplifié : 2 champions clairs (Textuel + Vocal) au lieu de 5 catégories',
  ],
  v76: [
    '🧹 Suppression complète du système Bataille chien/chat (peu utilisé)',
  ],
};

module.exports = { CURRENT_VERSION, CHANGELOG };
