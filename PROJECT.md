# KING BOT — Documentation du projet
> Dernière mise à jour : v73 (août 2026)

---

## Version actuelle : v73

Base : v72 → v71 → v70 → v69 → v68 → v63 → v62 → v61 → v60 → v59 → v56 (corrigé depuis v55 → v54 → v43 → v20)

---

## Stack technique

- **Bot** : discord.js v14, Node.js ≥ 18
- **BDD** : MongoDB via Mongoose
- **Dashboard** : Express + EJS (service séparé)
- **Hébergement** : Render (2 services : bot + dashboard)
- **Crons** : node-cron

---

## Déploiement

### Bot
- Render → service `BOT-PETT-MONDE`
- Start command : `node index.js`
- Variables : `DISCORD_TOKEN`, `MONGODB_URI`, `GUILD_ID`, `CLIENT_ID`

### Dashboard
- Render → service `hera-dashboard`
- Start command : `node dashboard/server.js`
- Variables : `DISCORD_TOKEN`, `MONGODB_URI`, `DASHBOARD_CLIENT_ID`, `DASHBOARD_CLIENT_SECRET`, `DASHBOARD_REDIRECT_URI`, `DASHBOARD_SESSION_SECRET`
- URL : https://hera-dashboard.onrender.com

### Landing page
- Fichier standalone HTML (hera-landing-page.html)
- Déployable sur Netlify Drop ou Render Static Site
- Fetchait l'API `/api/stats` du bot pour les données live

---

## Systèmes implémentés

### XP & Niveaux
- XP par message (configurable, cooldown 60s)
- XP vocal : cron toutes les 5min, crédite 25 XP/5min à tout le monde en vocal (survit aux redéploiements)
- XP vocal = réel (bug : avant le DM "+X XP" était un mensonge, XP jamais réellement ajouté)
- Level up → embed dans salon configuré
- Rôles de niveau principaux (permanents) : `/setup levelrole` + dashboard page XP
- Rôles hebdomadaires (reset dimanche minuit) : `/setup weeklyrole` + dashboard page XP
- Multiplicateur XP configurable par champion du counting

### Counting (#infinis)
- Comptage simple : User1→1, User2→2, User3→4 = faute → Singe + malus
- Pas de reset à 0 sur faute — le jeu reprend où il en était
- Reset à 0 uniquement au couronnement de minuit (King of the Day du counting)
- Multiplicateur aléatoire x6/x12/x24 tiré chaque jour à minuit
- Punition : rôle Singe + -50% XP + bloqué du salon counting (6h, auto-levé)
- 3e faute de la semaine → timeout serveur 24h
- Message public "Nouveau Singe" volontairement **court** (pas de détails malus/prochain chiffre) et **auto-supprimé** après quelques secondes (défaut 8s) pour ne pas polluer le chat — configurable via `/notif counting duree:`
- Classement quotidien avec champion + bonus XP 24h
- Config via `/notif counting malusheures:X maluspourcent:X heures:X emoji:X duree:X`

### Bataille (#bataille) — 100% libre, sans clan
- Écrire "chien" ou "chat" (+ variantes/onomatopées : woof, miaou...) → ça compte direct, image postée, c'est tout
- Aucun clan à rejoindre, aucun rôle attribué, aucune restriction — tout le monde participe librement (cooldown 5s anti-spam par membre)
- Bonus aléatoires (happy hour) : ~15% chance/heure de déclencher x2/x3/x5 pendant 20-60min
- Annonce dans le salon + affichage du multiplicateur actif dans l'embed
- Ping rôle ⚔️ Bataille lors des bonus
- `/guerre stats` — score Chien vs Chat de la semaine
- `/guerre membres` — top 10 des membres qui ont le plus écrit chien/chat (cumul total, pas juste la semaine)
- Classement auto quotidien (20h) : score chien/chat + top membres
- Reset hebdo (dimanche minuit) : annonce du camp gagnant, points remis à zéro (les compteurs personnels restent en cumul)
- **Suppression en v70** : anciennes "factions custom" (jamais câblées à une commande) et ancien système `/guerre equipe` (bouton pour rejoindre un clan séparé, avec des valeurs `team` incompatibles `dog`/`cat` vs `chien`/`chat` — bug latent jamais rencontré car mort)

### Bienvenue (style Etherya)
- Message court dans #chat : "Bienvenue @user ! Nous sommes désormais XXX membres."
- Embed complet dans #bienvenue : avatar, titre, description, champs pseudo+ID/membres, bannière
- Message interactif avec boutons (sections configurables depuis dashboard)
- Anti-spam : cooldown 60s par membre
- Tout configurable depuis dashboard → Arrivées & Départs

### Règlement (style Etherya)
- Embed principal + select menu Discord par sections
- Chaque section affiche son contenu en embed séparé
- Bouton "J'accepte"
- Gérable depuis dashboard → Règlement (ajouter/modifier/supprimer sections, poster)

### Pings self-serve
- Panel boutons : Annonces / Boost / Partenariats / Giveaways / Défis / Bataille
- Chaque membre clique pour s'abonner aux pings qui l'intéressent
- `/setup pingroles salon:#xxx` pour poster le panel

### Ghost Bot
- Bot en salon vocal permanent (survit aux redéploiements via reconnexion auto)
- Configurable depuis dashboard → Vocal

### Boost
- Message de bienvenue au boost (image aléatoire parmi pool configurable)
- Supplication automatique 2x/jour (8h + 20h) avec ping

### Quêtes
- Panel automatique épinglé dans le salon quêtes (mis à jour à chaque changement)
- Quotidiennes, urgentes, events, contests
- Ping rôle 🎯 Défis lors des quêtes urgentes/events

### Confessions — inspiré d'Etherya
- Déclenchement : commande slash `/confession` **ou** bouton "Faire une confession" dans le salon dédié → ouvre un modal
- Modal : champ "Titre" (optionnel, 100 car. max) + champ "Ta confession" (obligatoire, 10-1000 car.)
- Numérotation globale automatique (`Confession #N`, compteur `confessionCount` dans Config) — si un titre est saisi, il remplace `Confession #N` comme titre de l'embed et nom du thread
- Embed façon Etherya : texte affiché en citation (`>`), encadré "Identité protégée • Anonymat garanti", footer "Confessions Anonymes — Personne ne sait qui tu es \| date"
- Vignette (thumbnail) configurable par `/notif confession emoji:<emoji>` : accepte un emoji classique, un emoji custom du serveur, ou le nom exact d'un sticker du serveur
- Thread dédié sur chaque confession pour les réactions/commentaires
- Révélation publique de l'auteur après un délai configurable (`/notif confession heures:`, défaut 48h)
- Classement permanent par nombre de réactions, avec XP quotidien pour le top 10
- Note : l'encadré orange "Ce formulaire sera transmis à [App]..." visible dans Discord lors de l'ouverture du modal est un avertissement natif du client Discord pour les apps vérifiées — non personnalisable côté code

### Table 7777 (`/7777`) — inspiré d'Etherya
Système de tirage aléatoire avec attribution de rôles, comme la commande `/7777` du serveur Etherya.

**Principe :**
- Chaque membre fait `/7777 roll` → le bot tire un chiffre entre **1 et 7777**
- Cooldown de **30 secondes** entre chaque tirage par membre
- Si le chiffre tiré est lié à un rôle (configuré par un admin) → **le rôle est attribué automatiquement**
- Si le membre possède déjà le rôle correspondant, le bot l'indique sans le réattribuer
- Sinon, message "T'as vraiment le don pour rater hein 🥲"
- Footer de l'embed : `pseudo — chiffre / 7777 • Retentez dans 30 secondes.`

**Sous-commandes :**
| Commande | Accès | Description |
|---|---|---|
| `/7777 roll` | Tous | Faire un tirage (1 à 7777) |
| `/7777 collection` | Tous | Voir ses tirages totaux + rôles obtenus (réponse éphémère) |
| `/7777 leaderboard` | Tous | Classement des membres par nombre de tirages |
| `/7777 roles` | Tous | Liste tous les chiffres configurés et leurs rôles liés |
| `/7777 setup salon:` | Admin | Restreint `/7777 roll` à un salon précis (les autres sous-commandes restent libres) |
| `/7777 addrole role: [chiffre:]` | Admin | Lie un rôle à un chiffre. **Deux modes** : <br>• `chiffre` précisé → lien exact sur ce chiffre <br>• `chiffre` **non précisé** → le bot tire automatiquement un chiffre libre au hasard (non encore utilisé par un autre rôle) et l'attribue |
| `/7777 removerole chiffre:` | Admin | Supprime le lien rôle/chiffre pour ce chiffre |
| `/7777 presets` | Admin | Crée automatiquement 20 rôles thématiques (noms + couleurs façon Etherya) et les lie à des chiffres prédéfinis. Ignore les chiffres déjà configurés — n'écrase rien |

**Protection anti-conflit :** si un admin essaie de lier un chiffre déjà pris par un autre rôle via `/7777 addrole`, le bot refuse et indique le rôle en conflit. Il faut d'abord faire `/7777 removerole` sur ce chiffre.

**Modèles Mongo (`Table7777.js`)** :
- `Table7777UserModel` — profil par membre : `userId`, `guildId`, `totalRolls`, `lastRoll`, `rolesObtained[]`
- `Table7777RoleMap` — liaisons par serveur : `guildId`, `number`, `roleId`, `roleName`

**Logique (`bot/src/systems/table7777.js`)** :
- `rollTable7777(userId, guildId)` — gère cooldown + tirage + attribution rôle + sauvegarde
- `addRoleMap` / `removeRoleMap` / `listRoleMaps` — gestion des liaisons admin
- `getRandomFreeNumber(guildId)` — tire un chiffre encore libre (utilisé par le mode auto de `addrole`)
- `getUserProfile` / `getLeaderboard` — lecture pour `/7777 collection` et `/7777 leaderboard`

**Champ Config** : `table7777ChannelId` dans `Config.js` (salon restreint pour `/7777 roll`, optionnel).

### Signalement & Sanctions — ajouté en v71
Système complet de modération avec preuve à l'appui, en 2 étapes (soumission publique → validation staff), avec escalade par palier.

**Côté membre (n'importe qui) :**
- Panneau public avec bouton **🚨 Faire un signalement** (posté/rafraîchi automatiquement dans le salon configuré)
- Étape 1 : sélectionne le membre visé (menu déroulant)
- Étape 2 : formulaire (modal) — explique le problème + lien de preuve (optionnel)
- Étape 3 : choisit la sanction qu'il propose parmi 6 paliers : **Avertissement / Mute (vocal+tchat) / Ban vocal temporaire / Ban tchat temporaire / Kick / Ban définitif**
- Étape 4 : si la sanction demande une durée → choix parmi 10min / 1h / 6h / 24h / 48h / 7j
- Étape 5 : le bot propose d'envoyer une capture d'écran dans les 2 minutes (optionnel) — récupérée automatiquement et le message supprimé du salon pour rester propre

**Côté staff (dans le salon de validation configuré) :**
- Embed avec tout le contexte : membre visé, qui signale, explication, preuve, sanction demandée + durée, historique récent du membre (nb de sanctions sur les X derniers jours, configurable)
- 3 boutons : ✅ Valider la sanction demandée / ✏️ Choisir une autre sanction / ❌ Refuser
- Accès restreint : owner du serveur + co-owners + rôle staff configuré (`sanctionValidatorRoleId`)

**À la validation :**
- La sanction s'applique réellement (timeout Discord natif pour Mute, rôle dédié + déconnexion vocale pour Ban vocal, rôle dédié pour Ban tchat, kick/ban Discord natifs pour les 2 derniers paliers)
- DM automatique au membre concerné (sanction appliquée, ou "classé sans suite" si refusé)
- Log dans le salon historique configuré (`sanctionHistoryChannelId`, sinon fallback sur le salon de logs général)
- Cron toutes les 5 min : retire automatiquement les rôles Ban vocal/Ban tchat expirés

**Config requise** (`/notif sanction`) :
| Option | Rôle |
|---|---|
| `salon_validation` | Salon où le staff voit les demandes en attente |
| `salon_signalement` | Salon public avec le bouton (le panneau se poste/rafraîchit automatiquement) |
| `salon_historique` | Salon où sont loggées les demandes traitées |
| `validateur` | Rôle staff autorisé à valider/refuser (en plus du owner + co-owners) |
| `role_banvocal` | Rôle à créer manuellement avec permission **Connect** désactivée sur les salons vocaux — attribué/retiré automatiquement par le bot |
| `role_banchat` | Rôle à créer manuellement avec permission **Envoyer des messages** désactivée sur les salons texte — attribué/retiré automatiquement par le bot |
| `resetjours` | Jours sans sanction avant que l'historique récent affiché au staff redescende (défaut 60j) — information seulement, n'efface rien |

**Modèles Mongo** : `SanctionRequest.js` (file d'attente : draft → pending → approved/rejected) et `Warn.js` (étendu : `tier`, `proofImageUrl`, `proofText`, `penaltyDurationMs`, `penaltyExpiresAt`, `penaltyLifted`).

**Fichiers** : `systems/sanctions.js` (validation staff + application réelle des sanctions + cron d'expiration) et `systems/reportPanel.js` (formulaire guidé côté membre).

**Note** : remplace l'ancienne commande `/signaler` (v71, single-shot avec pièce jointe, suggestion automatique de palier) — abandonnée au profit du panneau guidé, plus proche de ce qui était demandé (soumission dans le salon, choix explicite de la sanction par le signaleur).

### Vocal — `/vocal` (ajouté en v72)
- `/vocal join salon:` — le bot rejoint un salon vocal (réutilise le système Ghost Bot existant : reconnexion auto si Discord coupe la connexion, survit aux redéploiements)
- `/vocal leave` — le bot quitte le vocal
- Réservé au staff (permission Discord "Déplacer les membres")
- Auparavant, cette fonctionnalité n'existait que via le dashboard web (`ghostBotChannelId` en base) — aucune commande Discord n'y donnait accès

### Invitations & Statistiques — ajouté en v73
Suivi de la croissance du serveur et tracking des invitations (qui a invité qui).

- `/stats croissance` — arrivées/départs sur 24h, 7j, 30j + solde net + total membres actuel
- `/invites top` — classement des membres qui ont le plus invité, **classé par nombre d'invités encore présents** (pas le total brut, pour éviter le farm d'invitations bidons qui repartent aussitôt)
- `/invites membre [@x]` — invitations d'un membre précis : total, encore présents, repartis
- Log automatique dans le salon de logs configuré :
  - À chaque arrivée : qui a invité (avec le code d'invitation), ou "invitation inconnue" si non détectable (widget, découverte...)
  - À chaque départ : qui, depuis combien de temps il était là

**Fonctionnement technique** : Discord ne donne pas directement "quelle invitation a été utilisée" — le bot garde un instantané en mémoire de toutes les invitations du serveur (code + nb d'utilisations) via l'intent `GuildInvites` (déjà activé dans le code depuis le début, jamais exploité jusqu'ici). À chaque arrivée, il recompare l'état actuel avec l'instantané pour trouver le code dont le compteur a augmenté. Gère aussi le lien "vanity" (URL personnalisée) séparément. Écoute aussi `inviteCreate`/`inviteDelete` pour garder le cache à jour en temps réel, avec un chargement initial de tous les serveurs au démarrage du bot.

**Modèle Mongo** : `MemberLog.js` — un enregistrement par arrivée (`joinedAt`, `leftAt`, `inviteCode`, `inviterId`, `inviteType`). Permet de recalculer n'importe quelle stat de croissance ou de retenue sans dépendre d'un compteur qui dérive.

**Fichier** : `systems/inviteTracker.js`.

### Dashboard (https://hera-dashboard.onrender.com)
Pages disponibles :
- Overview (stats temps réel)
- Général (salons, rôles hiérarchie)
- Arrivées & Départs (bienvenue court + embed complet + interactif)
- XP & Niveaux (xp/message, cooldown, rôles de niveau principaux + hebdomadaires, classement top 50)
- Règlement (sections éditables, poster)
- Modération (warns, counting)
- Tickets
- Vocal (ghost bot, salons temporaires, king du vocal)
- Staff, Pubs, Partenariats, etc.

---

## Corrections critiques effectuées (historique)

| Version | Correction |
|---------|-----------|
| v25 | Boutons counting : bot ne peut pas éditer message d'un membre → envoie message séparé |
| v25 | Face-reveal : détection auto image postée dans le salon |
| v27 | Bataille : barres de progression Chien/Chat dans l'embed |
| v33 | Ghost Bot : vraie implémentation avec @discordjs/voice |
| v34 | /notif : 11 sous-commandes étaient des faux stubs |
| v37 | Punition counting : -50% XP + blocage salon seul (au lieu de timeout serveur entier) |
| v38 | Counting simplifié (sans bluff) + bonus bataille |
| v39 | Doublon /notif → /partager + /setup dépassait 25 sous-commandes |
| v40 | Chemins require() cassés dans setup.js + manque await dans dispatcher |
| v43 | XP vocal : était un mensonge total, remplacé par cron toutes les 5min |
| v55 | Apostrophe non échappée dans presentation.js + .gitignore ajouté |
| v57 | Embed bienvenue 100% configurable : author, thumbnail, champs custom, footer, timestamp, emojis serveur via picker |
| v59 | Ajout système `/7777` (1ère version, collection + combos) — bug : fichier `systems/table7777.js` absent du zip → toutes les sous-commandes plantaient |
| v60 | Fix fichier manquant `systems/table7777.js` + ajout `/7777 setup` + bug `const { ConfigModel } = require(...)` (Config exporte le modèle directement, pas un objet nommé) |
| v61 | Refonte complète `/7777` façon Etherya : tirage 1-7777, cooldown 30s, rôles auto via `addrole`/`removerole`/`roles`, abandon du système jetons/combos |
| v62 | `/7777 addrole` : chiffre optionnel → si non précisé, le bot tire un chiffre libre au hasard et l'attribue au rôle. Ajout protection anti-conflit (chiffre déjà lié à un autre rôle) |
| v63 | Ajout `/7777 presets` : crée automatiquement 20 rôles thématiques (noms + couleurs) et les lie aux chiffres en une seule commande. N'écrase pas la config existante, ni les rôles déjà créés manuellement par la suite |
| v64 | Désactivation du cron "mini-classement counting toutes les 3h" qui polluait le salon #count-down avec des messages automatiques repetitifs. Les classements ne s'envoient plus que manuellement via `/notif` ou au couronnement minuit |
| v65 | Ajout d'une réaction emoji configurable sur chaque bon chiffre du counting : nouveau champ `countingValidEmoji` dans Config, réglable via `/notif counting emoji:<emoji>`, appliquée automatiquement par `systems/counting.js` sur chaque message valide. Retrait de la réaction 🎉 automatique sur les multiples de 100 |
| v66 | Refonte de l'embed Confessions façon Etherya : numérotation globale `Confession #N` (compteur `confessionCount` dans Config), texte affiché en citation (`>`), vignette configurable (emoji classique, emoji custom du serveur ou sticker du serveur) via `/notif confession emoji:<emoji>`, encadré "Identité protégée • Anonymat garanti" + footer "Confessions Anonymes — Personne ne sait qui tu es \| date". Le numéro est aussi repris dans le thread et dans l'embed de révélation |
| v67 | Ajout de la commande slash `/confession` (en plus du bouton) qui ouvre directement le modal, comme chez Etherya. Le modal a maintenant un champ "Titre (optionnel)" : si rempli, il remplace `Confession #N` comme titre de l'embed (et comme nom du thread) ; sinon le numéro reste utilisé par défaut |
| v68 | Gros nettoyage : suppression de toutes les commandes slash inutilisées (xp, classement, profil, rk, stats, anime, waifu, animaux, facereveal, cat, dog, guilde, singe, couple, quiz, secret, debat, giveaway, missions, niveau, top, defis, pub, bumpstats, mabump, partager, infos, presentation, couleur, faction, quete, relance, warn, staff, owner, ticket, annonce + sous-commandes média/youtube/twitch/smash/ghostbot/etc. de `/notif`). Il ne reste que `/confession`, `/guerre`, `/7777`, `/counting`, `/notif` (trimmé à counting/guerre/confession), `/setup` et `/config` — les seuls systèmes encore utilisés. Les fichiers `commandHandlers/` correspondants ont été supprimés du dépôt (38 commandes → 7) |
| v69 | Message public "Nouveau Singe" du counting rendu court et auto-supprimé (défaut 8s) au lieu d'un embed détaillé permanent qui polluait le chat — durée réglable via `/notif counting duree:`. Nouveau champ `countingSingeMsgAutoDeleteSec` dans Config |
| v70 | Bataille chien/chat rendue 100% libre : suppression des clans à rejoindre, des rôles attribués et des factions custom (mortes, jamais câblées). `/guerre` recentré sur `stats` (score) et `membres` (top des participants, nouveau) ; `equipe` supprimé. Nouveaux champs `battleChienCount`/`battleChatCount` sur `User.js`. Fix au passage : cron reset hebdo appelait `factionSys.cleanInactive()`, fonction qui n'existait plus — supprimé ; bonus surprise (`maybeTriggerMultiplierEvent`) jamais câblé à un cron — corrigé |
| v71 | Ajout du système de signalement/sanctions avec preuve : `/signaler` (1ère version, single-shot avec pièce jointe) puis remplacé dans la foulée par un panneau public guidé (bouton → sélection membre → modal → choix de sanction parmi 6 paliers → durée si besoin → capture d'écran optionnelle) posté dans un salon dédié. Validation staff avec 3 boutons (valider/changer/refuser), application réelle des sanctions (mute natif, rôles dédiés pour ban vocal/tchat temporaires, kick, ban), DM automatique, log dans un salon historique, cron de nettoyage des rôles temporaires expirés. Nouveaux modèles `SanctionRequest.js` et extension de `Warn.js` |
| v72 | Ajout de `/vocal join`/`leave` — le système Ghost Bot existait déjà (connexion vocale + reconnexion auto) mais n'était accessible que depuis le dashboard web, jamais en commande Discord |
| v73 | Ajout du tracking d'invitations et des stats de croissance : `/stats croissance` (arrivées/départs 24h/7j/30j), `/invites top` (classement par invités toujours présents, pas le brut), `/invites membre`. Détection de l'invitation utilisée par comparaison d'instantanés (Discord ne l'expose pas directement), gestion du lien vanity, cache tenu à jour via `inviteCreate`/`inviteDelete`. Logs auto des arrivées/départs avec l'invitation utilisée. Nouveau modèle `MemberLog.js`. L'intent `GuildInvites` était déjà activé dans le code mais jamais exploité |

---

## Structure des dossiers clés

```
/
├── index.js                          # Entry point bot
├── dashboard/
│   ├── server.js                     # Entry point dashboard
│   ├── routes/dashboard.js           # Toutes les routes GET/POST
│   └── views/pages/
│       ├── xp.ejs                    # XP + rôles niveau + rôles hebdo
│       ├── welcome.ejs               # Bienvenue (court + embed + interactif)
│       ├── reglement.ejs             # Règlement par sections
│       └── ...
├── bot/src/
│   ├── systems/
│   │   ├── counting.js               # Counting + punitions
│   │   ├── countingLeaderboard.js    # Classement counting + champion
│   │   ├── faction.js                # Bataille chien/chat (libre, sans clan)
│   │   ├── sanctions.js              # Validation staff + application des sanctions
│   │   ├── reportPanel.js            # Formulaire guidé de signalement (côté membre)
│   │   ├── inviteTracker.js          # Tracking invitations + stats de croissance
│   │   ├── ghostBot.js               # Bot en vocal (utilisé aussi par /vocal)
│   │   ├── welcomeInteractive.js     # Welcome interactif style Etherya
│   │   ├── reglement.js              # Règlement avec select menu
│   │   ├── pingroles.js              # Panel pings self-serve
│   │   ├── xp.js                     # Distribution XP
│   │   └── ...
│   ├── handlers/commandHandlers/
│   │   ├── setup.js                  # /setup (24 sous-commandes)
│   │   ├── notif.js                  # /notif (config systèmes)
│   │   ├── vocal.js                  # /vocal join|leave
│   │   ├── stats.js                  # /stats croissance
│   │   ├── invites.js                # /invites top|membre
│   │   └── ...
│   └── db/models/
│       ├── Config.js                 # levelRoles, weeklyLevelRoles, sanction*, report*, etc.
│       ├── Warn.js                   # Historique des sanctions (tier, preuve, durée)
│       ├── SanctionRequest.js        # File d'attente des signalements
│       └── MemberLog.js              # Historique arrivées/départs + invitations
└── PROJECT.md                        # Ce fichier
```

---

## Infra Discord recommandée

Catégories dans l'ordre :
1. 🏠 Accueil (règlement, annonces, bienvenue, patchnotes)
2. 💬 Communauté (général, médias, mèmes, présentation, hors-sujet)
3. 🎮 Mini-jeux (infinis, bataille, confessions, face-reveal, classements, quêtes-xp)
4. ⭐ XP & Progression (lvl-xp, podium-hebdo, roi-du-jour, défis-actifs)
5. 🎉 Événements (giveaways, boosts, partenariats)
6. 🔧 Staff privé (tickets, staff-général, logs-modération)

Rôles de niveau : 5 / 10 / 15 / 20 / 25 / 30 / 35 / 40 / 45 / 50 (permanents)
Rôles hebdo : paliers XP/semaine (reset dimanche)
Rôles spéciaux : Booster, Singe (punition), Ping Défis, Ping Bataille
Rôles sanctions (v71) : Ban vocal temporaire (permission Connect désactivée sur les vocaux), Ban tchat temporaire (permission Envoyer des messages désactivée sur le texte), rôle staff validateur des signalements
