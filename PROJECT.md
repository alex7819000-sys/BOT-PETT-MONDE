# KING BOT — Documentation du projet
> Dernière mise à jour : v82 (août 2026)

---

## Version actuelle : v82

Base : v81 → v80 → v79 → v78 → v77 → v76 → v75 → v74 → v73 → v72 → v71 → v70 → v69 → v68 → v63 → v62 → v61 → v60 → v59 → v56 (corrigé depuis v55 → v54 → v43 → v20)

---

## Stack technique

- **Bot** : discord.js v14, Node.js ≥ 18
- **BDD** : MongoDB via Mongoose
- **Dashboard** : Express + EJS (service séparé)
- **Hébergement** : Render (2 services : bot + dashboard)
- **Crons** : node-cron
- **Gateway Intents** : Guilds, GuildMembers, GuildMessages, GuildMessageReactions, GuildVoiceStates, GuildPresences, MessageContent, GuildInvites
- **Partials** : Message, Channel, Reaction, GuildMember, User (les 2 derniers ajoutés en v81 — sans eux, les données d'un membre peuvent être incomplètes sur certains events comme `guildMemberUpdate` si son profil n'est pas déjà en cache, ce qui causait l'avatar manquant sur l'embed de boost)

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

### XP & Niveaux — clarifié et solidifié en v82
Toutes les vraies sources d'XP, confirmées dans le code (les autres — réactions, invitations — n'ont **jamais** été codées malgré ce qu'affichait le message d'aide en jeu, voir bugs ci-dessous) :

| Source | Gain | Fichier |
|---|---|---|
| 💬 Message texte | `xpPerMessage` (défaut 15), cooldown `xpCooldown` (défaut 60s), × bonus Champion Counting × bonus Quêtes × malus Singe | `index.js` (messageCreate) |
| 🎙️ Vocal | 25 XP/5min (cron), + bonus fidélité jusqu'à +100% après 10h de session continue | `index.js` (`creditVoiceXp`) |
| 🚀 Bump Disboard | XP fixe | `systems/bumpDetect.js` |
| 🤫 Confession postée | XP fixe | `systems/confession.js` |
| ✅ Quête complétée | XP fixe (+ surplus reporté sur la suivante) | `systems/quetes.js` |
| 💜 Boost du serveur | Bonus unique | `index.js` (`guildMemberUpdate`) |
| 🐒 Pénalité Singe | **-100 XP** si trop de fautes | `systems/singe.js` via `systems/xp.js` |

`dailyXp` reste volontairement **du texte pur** (jamais touché par le vocal) — c'est ce qui permet au podium quotidien (`dailyPodium.js`) de distinguer proprement "Top 1 Textuel" vs "Top 1 Vocal" sans logique supplémentaire.

**4 vrais bugs trouvés et corrigés en v82** (le flou du système venait de là, pas d'une complexité inhérente) :
1. 🔴 **Le plus important** : monter de niveau en **vocal** déclenchait bien l'annonce "LEVEL UP" (avec mention du rôle soi-disant débloqué), mais **le rôle n'était jamais réellement attribué** — cette logique n'existait que côté texte. Un membre actif uniquement en vocal pouvait grimper plusieurs paliers sans jamais recevoir ses rôles (ni les rôles de niveau, ni les rôles hebdomadaires — le vocal ne faisait même pas gagner de `weekXp` avant ce fix). **Corrigé** en centralisant l'attribution de rôles dans un nouveau module partagé `systems/roleRewards.js` (`applyLevelRoles`/`applyWeeklyRoles`), appelé à l'identique par le texte et le vocal — impossible que les deux se désynchronisent à nouveau à l'avenir.
2. 🔴 `/setup multixp` (bonus XP par salon) était une **commande fantôme** : déclarée dans `commands.js`, mais strictement aucun handler ni logique de calcul derrière — ne faisait rien, silencieusement. Retirée (pas de besoin identifié pour l'instant).
3. 🔴 Le bouton "ℹ️ Comprendre le système XP" (dans chaque embed de level up) affirmait aux membres que réagir aux messages et inviter des gens donnait de l'XP — **jamais implémenté, jamais eu la moindre ligne de code**. Retiré du message ; les montants réels (XP/message, cooldown) sont maintenant affichés dynamiquement depuis la config au lieu d'un texte générique.
4. 🔴 Ce même message recommandait `/niveau` et `/top` — deux commandes **supprimées depuis le nettoyage v68**, qui n'existent plus. Remplacé par une explication correcte (le level up s'affiche automatiquement, pas besoin de commande).

**Note en toute transparence** : pendant ce nettoyage, j'ai supprimé par erreur `systems/xp.js` en le croyant mort (ma vérification de code mort ne détectait pas les `require('./xp')` relatifs internes à un même dossier) — il était en réalité utilisé par `systems/singe.js` pour la pénalité -100 XP. Repéré immédiatement par la vérification systématique des `require()` lancée juste après, fichier restauré à l'identique dans la foulée. Aucun impact final, mentionné ici pour la traçabilité.

- Rôles de niveau principaux (permanents) : `/setup levelrole` + dashboard page XP
- Rôles hebdomadaires (reset dimanche minuit) : `/setup weeklyrole` + dashboard page XP
- Formule de niveau : `niveau = floor(0.1 × √totalXp)`, soit `XP requis = niveau² × 100` — cohérente entre le calcul de level-up (`index.js`) et l'affichage de progression (`levelUp.js`), vérifié

### Aide — `/aide` (ajouté en v80)
Liste toutes les commandes disponibles (nom, sous-commandes, description), avec un cadenas 🔒 sur celles réservées au staff/admin. **Générée dynamiquement** depuis `buildCommands()` — la fonction qui déclare la vraie liste envoyée à Discord — au lieu d'être écrite en dur quelque part. Conséquence : elle reste automatiquement à jour pour toujours, même si des commandes sont ajoutées ou retirées plus tard, sans jamais avoir besoin de retoucher `aide.js`.

**Fichier** : `handlers/commandHandlers/aide.js`. `buildCommands` a dû être exporté depuis `commands.js` pour que `aide.js` puisse l'introspecter (`module.exports = { registerCommands, handleCommand, buildCommands }`).

### Podium quotidien (00h00) — simplifié en v77
Chaque nuit à minuit, le bot annonce **2 champions seulement** (plus de top 3 par catégorie XP/messages/images/bumps/vocal comme avant) :
- **💬 Top 1 Textuel** — classé sur `dailyXp`, qui est du texte pur (l'XP gagné en vocal n'y est jamais ajouté, seulement dans `xp`/`totalXp` — voir la boucle XP vocal dans `index.js`)
- **🎙️ Top 1 Vocal** — classé sur `vocalMinutesToday`

Chaque champion voit aussi affiché son **nombre de fois n°1 au total** (compteurs permanents `top1TextCount`/`top1VoiceCount` sur `User.js`, jamais remis à zéro — contrairement aux compteurs journaliers qui le sont chaque nuit). DM automatique aux 2 champions avec leur résultat.

**Rôles "Champion" (ajouté en v78)** : 2 rôles distincts optionnels, configurables via `/setup role` (`podiumTextChampionRoleId` / `podiumVoiceChampionRoleId`). Chaque nuit, retirés à l'ancien détenteur et donnés au nouveau champion — même mécanique que le rôle Champion du Counting déjà existant. Purement cosmétique par défaut (aucun bonus automatique attaché), mais rien n'empêche de leur donner des permissions/couleur spéciales sur le serveur.

**Fichier** : `systems/dailyPodium.js`. Au passage, le template DM (`tips.js` → `podiumResult`) a été corrigé : il référençait encore `/top`, une commande supprimée depuis le nettoyage v68, et supposait à tort que tout le monde gagnait sur messages+XP (ne collait pas à un gagnant vocal).

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

### ~~Bataille (#bataille)~~ — retiré en v76
Le système chien vs chat (compteur libre, images, `/guerre stats`/`membres`, classement, reset hebdo) a été **entièrement retiré** en v76 : peu utilisé par les membres du serveur. Code supprimé proprement (pas juste désactivé) :
- Fichiers supprimés : `systems/faction.js`, `db/models/Faction.js`, `handlers/commandHandlers/guerre.js`
- Découverte au passage et supprimé aussi : `systems/animalTrigger.js`, une **ancienne implémentation parallèle jamais câblée** du même concept (avec son propre `User.team`/`teamXp`) — code mort qui traînait depuis avant même le nettoyage v68
- Commande `/guerre` retirée, sous-commande `/setup guerre` et son code mort dans `setup.js` retirés, entrée "🐾 Bataille" du `/setup salon` retirée
- Option "Ping Bataille ⚔️" retirée du système de pings self-serve (`commands.js`, `setup.js`, `systems/pingroles.js`) — n'avait plus de sens sans le jeu pour déclencher des pings
- Champs Mongo nettoyés : `Config.js` (`animalTriggerChannelId`, `dogTeamRoleId`, `catTeamRoleId`, `bataillePingRoleId`, `factionMultiplierValue`/`Until`), `User.js` (`team`, `teamXp`, `battleChienCount`, `battleChatCount`)
- Crons retirés de `index.js` (classement quotidien, reset hebdo — le cron du bonus surprise avait déjà été coupé en v75)

Si le jeu doit revenir un jour, il faudra le reconstruire depuis zéro (rien n'est gardé en sourdine cette fois, contrairement au bonus surprise en v75).

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
- Panel boutons : Annonces / Boost / Partenariats / Giveaways / Défis
- Chaque membre clique pour s'abonner aux pings qui l'intéressent
- `/setup pingroles salon:#xxx` pour poster le panel

### Ghost Bot
- Bot en salon vocal permanent (survit aux redéploiements via reconnexion auto)
- Configurable depuis dashboard → Vocal

### Boost
Détecté sur l'event `guildMemberUpdate` (comparaison `premiumSince` avant/après) — toute la logique vit directement dans `index.js`, pas dans `systems/animation.js` (qui contenait une ancienne version jamais appelée, supprimée en v81).

**Quand quelqu'un boost** :
- Embed riche "💜 NOUVEAU BOOST !" avec : avatar du booster en miniature, GIF de célébration (tiré au hasard dans un pool configurable `boostGifUrls`, ou 3 GIFs par défaut si rien de configuré), liste des avantages (rôle booster à vie si configuré, bonus XP si configuré, mise en avant, reconnaissance), nombre total de boosters actuel sur le serveur, rappel de comment booster
- Attribution automatique du rôle booster (`boostRoleId`) s'il est configuré
- Bonus XP instantané (`boostXpBonus`) s'il est configuré
- **Fix v81** : l'avatar affichait une miniature vide dans certains cas — le Partial `GuildMember` manquait, donc les données du membre pouvaient être incomplètes si son profil n'était pas déjà en cache au moment du boost. Corrigé (`Partials.GuildMember`/`Partials.User` ajoutés) + sécurisé en cascade (re-fetch frais du membre avant de construire l'embed, avec repli si jamais l'URL reste indisponible)

**En continu** :
- Message de remerciement collectif aux boosters actuels, une fois par jour à 12h (mentionne tous les boosters actifs)
- Message de supplication ("beg") pour inciter à booster, 2x/jour (8h + 20h), avec ping du rôle configuré (`boostPingRoleId`) — pool de phrases humoristiques tirées au hasard dans `index.js`

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

**⚠️ Non fonctionnel sur Render (constaté en v74)** — voir la section dédiée ci-dessous.

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

### ⚠️ Vocal (Ghost Bot) — non fonctionnel sur Render (diagnostiqué en v74)
**Statut : le bot ne peut pas rejoindre de salon vocal sur l'hébergement actuel (Render). Ce n'est pas un bug du code — confirmé par test.**

**Symptôme** : `/vocal join` (et la reconnexion automatique au démarrage) échouent systématiquement après ~15-30s avec un timeout. Les logs Render montrent le cycle `signalling → connecting → connecting → signalling → destroyed` en boucle, jusqu'à l'abandon.

**Bug réel trouvé et corrigé au passage** : une collision était possible entre un `/vocal join` manuel et la reconnexion auto (`reconnectAll`) si les deux tournaient en même temps (ex: juste après un redéploiement) — l'une détruisait la connexion de l'autre en cours de négociation (`Cannot destroy VoiceConnection - it has already been destroyed`). Fix : verrou en mémoire par serveur (`joining` Set dans `ghostBot.js`) qui empêche deux `joinGhost()` concurrents sur le même `guildId`.

**Diagnostic final** : même après ce fix, **3 essais isolés et propres** (sans aucune collision possible) ont produit exactement le même échec. Conclusion : la voix Discord repose sur un flux audio temps réel en **UDP**, différent du reste du bot (WebSocket/HTTP classique) — et Render (comme Heroku et la plupart des "Web Service" PaaS génériques) est connu pour mal gérer ou filtrer ce type de trafic. C'est structurel à l'hébergement, pas réparable en code.

**Décision (v74)** : fonctionnalité vocale mise de côté pour l'instant. Le reste du bot (counting, sanctions, confessions, table 7777, stats, invitations...) tourne normalement sur Render, ce problème est isolé au vocal uniquement.

**Si le vocal redevient nécessaire un jour**, options envisagées (à migrer, pas à coder — le code Ghost Bot est déjà prêt et fonctionnera tel quel ailleurs) :
- **Railway** (~5$/mois) — migration quasi identique à Render, réputé fiable pour le trafic UDP/vocal
- **Oracle Cloud Free Tier** — VPS gratuit à vie, contrôle réseau total, inscription parfois capricieuse
- **VPS classique** (Hetzner, Contabo, OVH — 4 à 7€/mois) — la référence pour tout bot vocal/musical sérieux

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
| v74 | Investigation du vocal cassé sur Render : ajout de logs détaillés (`stateChange`/`debug`/`error`) dans `ghostBot.js` pour diagnostiquer. Trouvé et corrigé un vrai bug (collision entre `/vocal join` manuel et la reconnexion auto au démarrage qui pouvaient détruire la connexion l'une de l'autre). Après fix, 3 essais isolés ont quand même échoué avec le même timeout → conclusion : Render bloque/filtre le trafic UDP nécessaire à la voix Discord, ce n'est pas un bug applicatif. Fonctionnalité vocale mise de côté sur cet hébergement, documentée comme non fonctionnelle |
| v75 | Retrait du cron "Bonus surprise bataille" (`maybeTriggerMultiplierEvent`) — les messages auto "BONUS SURPRISE" revenaient trop souvent et étaient jugés intrusifs. Le code reste présent dans `systems/faction.js` mais n'est plus appelé par aucun cron dans `index.js` |
| v76 | Suppression complète et propre du système Bataille chien/chat (peu utilisé) : fichiers supprimés (`faction.js`, `Faction.js`, `guerre.js`), commande `/guerre` retirée, sous-commandes/handlers morts nettoyés dans `setup.js`/`notif.js`, option "Ping Bataille" retirée du système de pings, champs Mongo orphelins nettoyés (`Config.js`, `User.js`). Découverte et suppression au passage d'un fichier mort jamais câblé (`systems/animalTrigger.js`, une implémentation parallèle jamais utilisée avec son propre `team`/`teamXp`) |
| v77 | Podium quotidien simplifié : passe de 5 catégories en top 3 chacune à seulement 2 champions uniques (Top 1 Textuel sur `dailyXp`, Top 1 Vocal sur `vocalMinutesToday`), chacun affichant son nombre de fois n°1 au total (nouveaux compteurs permanents `top1TextCount`/`top1VoiceCount` sur `User.js`). Corrigé au passage : le template DM `podiumResult` référençait encore `/top` (commande supprimée en v68) et ne collait pas à un gagnant vocal |
| v78 | Ajout de 2 rôles "Champion" optionnels pour le podium (`podiumTextChampionRoleId`/`podiumVoiceChampionRoleId`, configurables via `/setup role`) — attribués/retirés chaque nuit au champion du jour, même mécanique que le rôle Champion du Counting déjà existant |
| v79 | Vérification complète du projet (syntaxe, require() cassés, modèles Mongo orphelins, cohérence dashboard). 2 vrais bugs pré-existants trouvés et corrigés, sans rapport avec les changements précédents : **(1)** un dossier fantôme `bot/systems/` (hors `src/`) contenait une vieille version cassée de `table7777.js` pointant vers un modèle Mongo obsolète — un cron hebdomadaire dans `index.js` l'important silencieusement en échec chaque semaine (capturé par un `catch`, invisible sauf dans les logs Render) ; supprimé, la fonctionnalité "classement hebdo 7777" n'existe plus dans le système actuel donc rien à remplacer. **(2)** la page dashboard `/embeds` référençait une variable `cfg` jamais transmise par la route → plantage garanti de la page à l'ouverture ; corrigé (valeurs par défaut vides pour un nouvel embed, `e.channelId` pour le renvoi d'un embed déjà sauvegardé) |
| v80 | Ajout de `/aide` — liste toutes les commandes du bot (nom, sous-commandes, description), générée **dynamiquement** depuis `buildCommands()` (la même liste envoyée à Discord) plutôt qu'écrite en dur : reste juste automatiquement même si des commandes sont ajoutées/retirées plus tard, sans jamais avoir à toucher `aide.js`. Marque 🔒 les commandes réservées au staff/admin (celles avec `setDefaultMemberPermissions`) |
| v81 | Fix de l'avatar manquant sur l'embed "NOUVEAU BOOST !" (miniature vide). Cause : le Partial `GuildMember` n'était pas activé, donc les données du membre (dont l'avatar) pouvaient être incomplètes sur l'event `guildMemberUpdate` si le membre n'était pas déjà en cache. Ajouté `Partials.GuildMember`/`Partials.User`, et sécurisé la récupération de l'avatar (re-fetch frais du membre + repli en cascade si jamais l'URL est indisponible). Nettoyage au passage : suppression de `handleBoost` dans `systems/animation.js`, une ancienne version du même système jamais appelée nulle part (la vraie logique de boost vit directement dans `index.js`, sur l'event `guildMemberUpdate`) — ce code mort a fait perdre du temps de diagnostic en pointant vers le mauvais fichier au premier passage |
| v82 | Clarification et solidification complète du système d'XP, à la demande explicite ("je comprends pas moi-même"). Audit total de toutes les sources d'XP (texte, vocal, bump, confession, quêtes, boost, pénalité singe). 4 vrais bugs trouvés et corrigés : **(1)** le plus important — le vocal ne donnait jamais les rôles de niveau/hebdo malgré le level up affiché (voir détail dans la section XP), corrigé en centralisant la logique dans le nouveau `systems/roleRewards.js`, partagé par texte et vocal ; **(2)** `/setup multixp` était une commande fantôme sans aucun handler, retirée ; **(3)**/**(4)** le message d'aide en jeu promettait des sources d'XP jamais codées (réactions, invitations) et recommandait des commandes supprimées depuis v68 (`/niveau`, `/top`) — corrigé avec des infos exactes et dynamiques. Erreur de parcours assumée : `systems/xp.js` supprimé par erreur en le croyant mort (utilisé en réalité par `systems/singe.js`), détecté par la vérification systématique des `require()` et restauré immédiatement |

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
3. 🎮 Mini-jeux (infinis, confessions, face-reveal, classements, quêtes-xp)
4. ⭐ XP & Progression (lvl-xp, podium-hebdo, roi-du-jour, défis-actifs)
5. 🎉 Événements (giveaways, boosts, partenariats)
6. 🔧 Staff privé (tickets, staff-général, logs-modération)

Rôles de niveau : 5 / 10 / 15 / 20 / 25 / 30 / 35 / 40 / 45 / 50 (permanents)
Rôles hebdo : paliers XP/semaine (reset dimanche)
Rôles spéciaux : Booster, Singe (punition), Ping Défis
Rôles sanctions (v71) : Ban vocal temporaire (permission Connect désactivée sur les vocaux), Ban tchat temporaire (permission Envoyer des messages désactivée sur le texte), rôle staff validateur des signalements
