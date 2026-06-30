# KING BOT — Documentation du projet
> Dernière mise à jour : v56 (juin 2026)

---

## Version actuelle : v56

Base : v55 (corrigé depuis v54 → v43 → v20)

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
- Classement quotidien avec champion + bonus XP 24h
- Config via `/notif counting malusheures:X maluspourcent:X heures:X`

### Bataille (#bataille)
- Détection mots chien/chat avec tolérance aux lettres répétées
- Bonus aléatoires (happy hour) : ~15% chance/heure de déclencher x2/x3/x5 pendant 20-60min
- Annonce dans le salon + affichage du multiplicateur actif dans l'embed
- Ping rôle ⚔️ Bataille lors des bonus

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

### Confessions
- Thread sur chaque confession
- Révélation de l'auteur après délai configurable
- Classement par réactions

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
│   │   ├── faction.js                # Bataille chien/chat
│   │   ├── welcomeInteractive.js     # Welcome interactif style Etherya
│   │   ├── reglement.js              # Règlement avec select menu
│   │   ├── pingroles.js              # Panel pings self-serve
│   │   ├── ghostBot.js               # Bot en vocal
│   │   ├── xp.js                     # Distribution XP
│   │   └── ...
│   ├── handlers/commandHandlers/
│   │   ├── setup.js                  # /setup (24 sous-commandes)
│   │   ├── notif.js                  # /notif (config systèmes)
│   │   └── ...
│   └── db/models/
│       └── Config.js                 # levelRoles, weeklyLevelRoles, etc.
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
