// index.js — Point d'entrée du bot
'use strict';
require('dotenv').config();
const { validateEnv } = require('./bot/src/config/env');
validateEnv();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const mongoose = require('mongoose');
const logger = require('./bot/src/utils/logger');
const { registerCommands, handleCommand } = require('./bot/src/handlers/commands');
const { handleButton } = require('./bot/src/handlers/buttons');
const { handleModal } = require('./bot/src/handlers/modals');

// ── Client ────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── MongoDB ───────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('DB', 'MongoDB connecté'))
  .catch(err => { logger.error('DB', 'Connexion MongoDB échouée', err); process.exit(1); });

// ── Events ────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  logger.info('Bot', `Connecté en tant que ${client.user.tag}`);
  client.user.setActivity('HERA 🌺', { type: 4 });
  await registerCommands();

  // ── Liste des serveurs où le bot est présent ─────────────────────────────
  logger.info('Bot', `Présent sur ${client.guilds.cache.size} serveur(s) :`);
  client.guilds.cache.forEach(guild => {
    logger.info('Bot', `  → ${guild.name} (ID: ${guild.id}) — ${guild.memberCount} membres`);
  });

  // ── Remerciement quotidien des boosters ──────────────────────────────────
  const cron = require('node-cron');
  const Config = require('./bot/src/db/models/Config');
  const { startBumpReminder } = require('./bot/src/systems/bumpReminder');

  const BOOST_MESSAGES = [
    (mentions) => `yo ${mentions} 💜 vous êtes littéralement nos chouchous no cap, le serveur vit grâce à vous et on oublie pas`,
    (mentions) => `${mentions} bro vous êtes trop là pour nous 😭💜 merci d'faire vivre ce serveur, vous êtes pas comme les autres fr`,
    (mentions) => `on revient là juste pour dire que ${mentions} sont des goats absolus 💜 boost = amour eternal sur ce serveur`,
    (mentions) => `${mentions} 💜 slay les chéris, vous faites vraiment plaisir, le serveur c'est vous qui le faites vivre istg`,
    (mentions) => `petit rappel quotidien que ${mentions} sont nos MVP no debate 💜 on vous aime trop fort`,
    (mentions) => `${mentions} vous êtes nos piliers fr 💜 sans vous ce serveur serait pas pareil, on vous voit on vous oublie pas`,
    (mentions) => `besoin de dire que ${mentions} sont juste incroyables 💜 vous boostez, vous êtes là, vous existez — merci`,
    (mentions) => `ayo ${mentions} 💜 vous êtes nos chouchous officiels du serveur, c'est pas un débat, c'est un fait`,
    (mentions) => `${mentions} on vous love trop 😭💜 vous faites vivre ce serveur comme personne d'autre, goats certifiés`,
    (mentions) => `shoutout à ${mentions} 💜 vous donnez trop de vous pour ce serveur et on capte, merci vraiment`,
  ];

  // Messages pour inciter à booster (style mème / références)
  const BEG_MESSAGES = [
    `speed : "I NEED BOOST I NEED BOOST I NEED BOOST" 😭 bro il avait raison boost le serveur svp 💜`,
    `nous on est là comme guts dans berserk, on avance malgré tout, mais un boost nous ferait pas de mal ngl 💜⚔️`,
    `POV : t'as pas encore booste le serveur\n\n*shikamaru voice* "quel fardeau..." 😔 allez boost c'est 2 clics`,
    `selon mes calculs (j'ai demandé à l'ia) un boost de ta part augmenterait le swag du serveur de 400% 📊 réfléchis bien`,
    `levi : "sois le soldat dont ce serveur a besoin"\nnous : boost 💜\ntoi : ???`,
    `on va pas te mentir on a regardé nos stats et le serveur donne plus que ce qu'il reçoit 😭 un boost c'est du karma fr`,
    `t'as boosté netflix ce mois-ci ? t'as boosté ta salle de sport ? boost le serveur aussi il mérite 💜`,
    `imagine avoir la capacité de boost et ne pas boost... c'est comme avoir le fruit du démon et juste l'utiliser pour faire à manger 💀`,
    `chez nous le boost c'est pas une obligation c'est un vibe 💜 et les vibes ça s'entretient tu vois`,
    `pedro pascal nous regarde dans les yeux et nous dit "boost le serveur"\n\non peut pas lui dire non 😭💜`,
    `sigma rule #1 : les vrais boostent sans qu'on leur demande\nsigma rule #2 : on vient de te demander 💜`,
    `en vrai le serveur c'est ta famille ici non ? et ta famille elle a besoin d'un boost 💜 c'est tout ce qu'on dit`,
    `le boost c'est comme le like sur le post de ta mère, ça coûte rien et ça fait tout 💜`,
    `bro/sis si t'as un nitro qui traîne... tu sais ce qu'il te reste à faire 👀💜 on dit ça on dit rien`,
    `sun tzu, l'art de la guerre : "un serveur boosté est un serveur invincible" 📖 c'est authentique j'ai vérifié`,
  ];

  // Tous les jours à 12h00 — remerciement des boosters
  cron.schedule('0 12 * * *', async () => {
    try {
      const guilds = client.guilds.cache.values();
      for (const guild of guilds) {
        const cfg = await Config.findOne({ guildId: guild.id });
        if (!cfg?.boostChannelId) continue;

        const ch = guild.channels.cache.get(cfg.boostChannelId);
        if (!ch) continue;

        await guild.members.fetch();
        const boosters = guild.members.cache.filter(m => m.premiumSince);
        if (!boosters.size) continue;

        const mentions = boosters.map(m => `<@${m.id}>`).join(' ');
        const msg = BOOST_MESSAGES[Math.floor(Math.random() * BOOST_MESSAGES.length)](mentions);

        await ch.send({ content: msg }).catch(() => {});
      }
    } catch (err) {
      logger.error('Bot', 'Erreur cron boost quotidien', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Tous les jours à 20h00 — incitation à booster
  cron.schedule('0 20 * * *', async () => {
    try {
      const guilds = client.guilds.cache.values();
      for (const guild of guilds) {
        const cfg = await Config.findOne({ guildId: guild.id });
        if (!cfg?.boostChannelId) continue;

        const ch = guild.channels.cache.get(cfg.boostChannelId);
        if (!ch) continue;

        const msg = BEG_MESSAGES[Math.floor(Math.random() * BEG_MESSAGES.length)];
        await ch.send({ content: msg }).catch(() => {});
      }
    } catch (err) {
      logger.error('Bot', 'Erreur cron boost beg', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Toutes les 5 minutes — envoi des pubs planifiées (catalogue admin)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { checkAndSendDuePubs } = require('./bot/src/systems/pubs');
      await checkAndSendDuePubs(client);
    } catch (err) {
      logger.error('Bot', 'Erreur cron pubs planifiées', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Tous les jours à 00h05 — génère 3 nouvelles quêtes quotidiennes
  cron.schedule('5 0 * * *', async () => {
    try {
      await require('./bot/src/systems/quetes').generateDailyQuests(client);
    } catch (err) {
      logger.error('Bot', 'Erreur cron génération quêtes quotidiennes', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Toutes les 15 minutes — résout les quêtes urgentes/event/concours arrivées à échéance
  cron.schedule('*/15 * * * *', async () => {
    try {
      await require('./bot/src/systems/quetes').resolveExpiredQuests(client);
    } catch (err) {
      logger.error('Bot', 'Erreur cron résolution quêtes', err);
    }
  });

  // Tous les dimanches à 00h00 — reset de l'XP hebdomadaire (classements weekXp)
  cron.schedule('0 0 * * 0', async () => {
    try {
      const User = require('./bot/src/db/models/User');
      for (const guild of client.guilds.cache.values()) {
        await User.updateMany({ guildId: guild.id }, { weekXp: 0 });
      }
      logger.info('Bot', 'Reset XP hebdomadaire effectué');
    } catch (err) {
      logger.error('Bot', 'Erreur reset XP hebdomadaire', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Classement factions quotidien (20h)
  cron.schedule('0 20 * * *', async () => {
    try {
      const factionSys = require('./bot/src/systems/faction');
      for (const guild of client.guilds.cache.values()) {
        const Config = require('./bot/src/db/models/Config');
        const config = await Config.findOne({ guildId: guild.id }).lean();
        if (config?.animalTriggerChannelId) {
          await factionSys.postDailyLeaderboard(guild, config.animalTriggerChannelId);
        }
      }
    } catch (err) { logger.error('Bot', 'Erreur cron classement factions', err); }
  }, { timezone: 'Europe/Paris' });

  // Reset factions hebdo (dimanche minuit) + nettoyage inactifs
  cron.schedule('5 0 * * 0', async () => {
    try {
      const factionSys = require('./bot/src/systems/faction');
      for (const guild of client.guilds.cache.values()) {
        await factionSys.weeklyReset(guild);
        await factionSys.cleanInactive(guild.id);
      }
      logger.info('Bot', 'Reset + nettoyage factions effectué');
    } catch (err) { logger.error('Bot', 'Erreur cron reset factions', err); }
  }, { timezone: 'Europe/Paris' });

  // ── Bump reminder toutes les 2h ──────────────────────────────────────
  startBumpReminder(client);

  // ── Classement Counting : mini-classement toutes les 3h (pas de bonus, juste suivi) ──
  cron.schedule('0 */3 * * *', async () => {
    try {
      const { postIntermediateLeaderboard } = require('./bot/src/systems/countingLeaderboard');
      await postIntermediateLeaderboard(client);
    } catch (err) { logger.error('Bot', 'Erreur mini-classement counting', err); }
  }, { timezone: 'Europe/Paris' });

  // ── Classement Counting final + couronnement du Champion du jour (minuit) ──
  cron.schedule('0 0 * * *', async () => {
    try {
      const { postFinalLeaderboardAndCrown } = require('./bot/src/systems/countingLeaderboard');
      await postFinalLeaderboardAndCrown(client);
      logger.info('Bot', 'Classement counting final + couronnement effectué');
    } catch (err) { logger.error('Bot', 'Erreur classement counting final', err); }
  }, { timezone: 'Europe/Paris' });

  // ── Sécurité : retire le rôle Champion du Counting si les 24h sont dépassées ──
  // (utile si le cron de minuit a été manqué un jour, ou pour une expiration précise)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { expireCountingChampions } = require('./bot/src/systems/countingLeaderboard');
      await expireCountingChampions(client);
    } catch (err) { logger.error('Bot', 'Erreur expiration champion counting', err); }
  }, { timezone: 'Europe/Paris' });

  // ── Confessions : révélation publique de l'auteur quand le délai est écoulé ──
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { processPendingReveals } = require('./bot/src/systems/confession');
      await processPendingReveals(client);
    } catch (err) { logger.error('Bot', 'Erreur révélation confessions', err); }
  }, { timezone: 'Europe/Paris' });

  // ── Confessions : XP quotidien pour le top 10 du classement (réactions) ──
  cron.schedule('10 0 * * *', async () => {
    try {
      const { awardDailyConfessionXp } = require('./bot/src/systems/confession');
      await awardDailyConfessionXp(client);
      logger.info('Bot', 'XP quotidien confessions distribué');
    } catch (err) { logger.error('Bot', 'Erreur XP quotidien confessions', err); }
  }, { timezone: 'Europe/Paris' });
});

// ── Notification ajout/retrait du bot sur un serveur ────────────────────────
client.on('guildCreate', guild => {
  logger.info('Bot', `➕ Ajouté sur un nouveau serveur : ${guild.name} (ID: ${guild.id}) — propriétaire: ${guild.ownerId}`);
});

client.on('guildDelete', guild => {
  logger.info('Bot', `➖ Retiré du serveur : ${guild.name} (ID: ${guild.id})`);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) return handleCommand(interaction, client);
    if (interaction.isButton() || interaction.isStringSelectMenu()) return handleButton(interaction, client);
    if (interaction.isModalSubmit()) return handleModal(interaction, client);
  } catch (err) {
    logger.error('Bot', 'Erreur interactionCreate', err);
  }
});

// ── XP Messages ───────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  // Détection du bump Disboard — DOIT passer avant le filtre "message.author.bot"
  // puisque Disboard est justement un bot.
  if (message.guild && message.author.bot) {
    try {
      const bumpDetect = require('./bot/src/systems/bumpDetect');
      await bumpDetect.handleMessage(message, client);
    } catch (err) {
      logger.error('Bot', 'Erreur détection bump', err);
    }
  }
  if (message.author.bot || !message.guild) return;
  try {
    const { handleMessage } = require('./bot/src/systems/singe');
    // XP via le système de base
    const User = require('./bot/src/db/models/User');
    const Config = require('./bot/src/db/models/Config');
    const cfg = await Config.findOne({ guildId: message.guild.id });

    // Système "feur" — easter eggs (quoi→feur, comment→tateur, etc.) + escalade au 3e quoi
    const feurSystem = require('./bot/src/systems/feur');
    await feurSystem.handleMessage(message, cfg);

    // Système "sass" — réagit aux insultes, clash en retour si on lui répond, reconnaît le brainrot
    const sassSystem = require('./bot/src/systems/sass');
    await sassSystem.handleMessage(message, client, cfg);

    // Système "faction" — factions custom + chien/chat par défaut
    await require('./bot/src/systems/faction').handleMessage(message).catch(() => {});

    // Système "quêtes" — progression des quêtes à messages (quotidiennes, urgentes, manuelles)
    require('./bot/src/systems/quetes').trackMessageProgress(message).catch(() => {});

    // Règle du mot "singe" — vérifie si le membre Singe a bien écrit le mot
    await handleMessage(message, client);

    // Salon "média" — supprime les messages sans média
    const mediaSystem = require('./bot/src/systems/media');
    const deleted = await mediaSystem.handleMessage(message, cfg?.mediaChannelIds);
    if (deleted) return; // pas d'XP si le message a été supprimé

    // Salon "counting" — compter 1, 2, 3... à la suite (avec système de bluff)
    const countingSystem = require('./bot/src/systems/counting');
    const countingHandled = await countingSystem.handleMessage(message);
    if (countingHandled) return; // pas d'XP si le message a été traité par le counting

    const baseXpPerMsg = cfg?.xpPerMessage || 15;
    const cooldown = (cfg?.xpCooldown || 60) * 1000;

    const user = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
    const now = Date.now();
    if (user && user.lastMessageAt && (now - user.lastMessageAt.getTime()) < cooldown) return;

    // Bonus XP "Champion du Counting" (+X% pendant 24h, voir countingLeaderboard.js)
    const { getCountingXpMultiplier } = require('./bot/src/systems/countingLeaderboard');
    const xpMultiplier = await getCountingXpMultiplier(message.author.id, message.guild.id).catch(() => 1);
    const xpPerMsg = Math.round(baseXpPerMsg * xpMultiplier);

    const updated = await User.findOneAndUpdate(
      { userId: message.author.id, guildId: message.guild.id },
      {
        $inc: { 
          xp: xpPerMsg, 
          totalXp: xpPerMsg, 
          weekXp: xpPerMsg, 
          dailyXp: xpPerMsg,
          messageCount: 1,
          messagesDay: 1,
          ...(user?.team ? { teamXp: xpPerMsg } : {})
        },
        $set: { lastMessageAt: new Date(), username: message.author.username },
      },
      { upsert: true, new: true }
    );

    // Level up check
    const newLevel = Math.floor(0.1 * Math.sqrt(updated.totalXp));
    if (newLevel > (updated.level || 0)) {
      await User.updateOne({ userId: message.author.id, guildId: message.guild.id }, { level: newLevel });
      
      // Affiche un message court + embed détaillé
      const { handleLevelUp } = require('./bot/src/systems/levelUp');
      await handleLevelUp(message, newLevel, updated);

      // Rôle de niveau
      const cfg = await require('./bot/src/db/models/Config').findOne({ guildId: message.guild.id }).lean().catch(() => null);
      if (cfg?.levelRoles?.length) {
        const match = cfg.levelRoles.filter(lr => lr.level <= newLevel).sort((a,b) => b.level - a.level)[0];
        if (match) {
          const member = message.member;
          if (member && !member.roles.cache.has(match.roleId)) {
            member.roles.add(match.roleId).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    logger.error('Bot', 'Erreur messageCreate', err);
  }
});

// ── Vocal XP ──────────────────────────────────────────────────────────────
const voiceJoinTimes = new Map();
client.on('voiceStateUpdate', async (oldState, newState) => {
  const uid = newState.id || oldState.id;
  const gid = newState.guild?.id || oldState.guild?.id;
  if (!gid) return;

  // Rejoint un salon
  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(`${gid}:${uid}`, Date.now());
  }
  // Quitte un salon
  if (oldState.channelId && !newState.channelId) {
    const key = `${gid}:${uid}`;
    const joinTime = voiceJoinTimes.get(key);
    if (!joinTime) return;
    voiceJoinTimes.delete(key);
    const minutes = Math.floor((Date.now() - joinTime) / 60000);
    if (minutes < 1) return;

    const User = require('./bot/src/db/models/User');
    await User.findOneAndUpdate(
      { userId: uid, guildId: gid },
      { $inc: { vocalMinutes: minutes, vocalMinutesToday: minutes } },
      { upsert: true }
    ).catch(() => {});
  }
});

// ── GuildMemberAdd ─────────────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  try {
    const Config = require('./bot/src/db/models/Config');
    const cfg = await Config.findOne({ guildId: member.guild.id });

    // 1. Message d'annonce court dans le salon dédié (ou le salon d'annonces en repli)
    const welcomeChannelId = cfg?.welcomeChannelId || cfg?.announceChannelId;
    if (welcomeChannelId) {
      const ch = member.guild.channels.cache.get(welcomeChannelId);
      if (ch) {
        ch.send({ content: `👋 **${member.user.username}** vient de rejoindre **${member.guild.name}** — bienvenue ! 🎉` }).catch(() => {});
      }
    }

    // 2. DM de bienvenue + bouton lancer la présentation
    try {
      const { sendWelcomeDM } = require('./bot/src/systems/presentation');
      await sendWelcomeDM(member, client);
    } catch (err) {
      logger.debug('Bot', 'DM bienvenue impossible pour ' + member.user?.tag);
    }

    // 3. Attribuer le rôle Membre si configuré
    if (cfg?.membreRoleId) {
      member.roles.add(cfg.membreRoleId).catch(() => {});
    }

  } catch (err) {
    logger.error('Bot', 'Erreur guildMemberAdd', err);
  }
});

// ── Boost ──────────────────────────────────────────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const wasBooster = oldMember.premiumSince;
    const isBooster  = newMember.premiumSince;
    if (!wasBooster && isBooster) {
      const Config = require('./bot/src/db/models/Config');
      const cfg = await Config.findOne({ guildId: newMember.guild.id });
      const boostChannelId = cfg?.boostChannelId;
      if (!boostChannelId) return;
      const ch = newMember.guild.channels.cache.get(boostChannelId);
      if (!ch) return;

      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setColor(0xFF73FA)
        .setTitle('💜 Nouveau Boost !')
        .setDescription(`Merci **${newMember.displayName}** pour le boost du serveur ! 💜\nTu fais maintenant partie des boosters de **${newMember.guild.name}** !`)
        .setThumbnail(newMember.displayAvatarURL())
        .setTimestamp();

      if (cfg?.boostGifUrl) embed.setImage(cfg.boostGifUrl);

      // Rôle booster
      if (cfg?.boostRoleId && !newMember.roles.cache.has(cfg.boostRoleId)) {
        await newMember.roles.add(cfg.boostRoleId).catch(() => {});
      }
      // Bonus XP
      if (cfg?.boostXpBonus) {
        const User = require('./bot/src/db/models/User');
        await User.findOneAndUpdate(
          { userId: newMember.id, guildId: newMember.guild.id },
          { $inc: { xp: cfg.boostXpBonus, totalXp: cfg.boostXpBonus } },
          { upsert: true }
        ).catch(() => {});
      }

      await ch.send({ content: cfg?.boostPingRoleId ? `<@&${cfg.boostPingRoleId}>` : '', embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    logger.error('Bot', 'Erreur guildMemberUpdate (boost)', err);
  }
});

// ── Lancement ──────────────────────────────────────────────────────────────

// ── Édition dans le counting → Singe automatique ─────────────────────────
client.on('messageUpdate', async (oldMsg, newMsg) => {
  try {
    if (newMsg.partial) await newMsg.fetch().catch(() => {});
    await require('./bot/src/systems/counting').handleMessageUpdate(oldMsg, newMsg);
  } catch (err) { logger.error('Bot', 'Erreur messageUpdate counting', err); }
});

// ── Réactions counting (🔍 vérifier / 🎭 bluffer) ────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    await require('./bot/src/systems/counting').handleReaction(reaction, user);
    await require('./bot/src/systems/faceReveal').handleReactionAdd(reaction, user, client);
    await require('./bot/src/systems/confession').handleReactionAdd(reaction, user);
  } catch (err) { logger.error('Bot', 'Erreur messageReactionAdd', err); }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => {});
    await require('./bot/src/systems/faceReveal').handleReactionRemove(reaction, user, client);
    await require('./bot/src/systems/confession').handleReactionRemove(reaction, user);
  } catch (err) { logger.error('Bot', 'Erreur messageReactionRemove', err); }
});

// ── Cron reset fautes counting hebdo (dimanche 00h02) ────────────────────
require('node-cron').schedule('2 0 * * 0', async () => {
  try {
    const { resetWeeklyFaults } = require('./bot/src/systems/counting');
    for (const guild of client.guilds.cache.values()) {
      await resetWeeklyFaults(guild.id);
      // Retirer le rôle Singe à tous
      const cfg = await require('./bot/src/db/models/Config').findOne({ guildId: guild.id }).lean();
      if (cfg?.singeRoleId) {
        const role = guild.roles.cache.get(cfg.singeRoleId);
        if (role) {
          for (const [, m] of guild.members.cache.filter(m => m.roles.cache.has(cfg.singeRoleId))) {
            await m.roles.remove(role).catch(() => {});
          }
        }
      }
    }
    logger.info('Bot', 'Reset fautes counting + rôles Singe effectué');
  } catch (err) { logger.error('Bot', 'Erreur cron reset counting', err); }
}, { timezone: 'Europe/Paris' });

// ── Cron annonce du gagnant du face reveal (chaque jour à 00h15) ───────────
require('node-cron').schedule('15 0 * * *', async () => {
  try {
    const { announceDailyWinner } = require('./bot/src/systems/faceReveal');
    for (const guild of client.guilds.cache.values()) {
      await announceDailyWinner(guild, client);
    }
  } catch (err) { logger.error('Bot', 'Erreur cron face reveal', err); }
}, { timezone: 'Europe/Paris' });

client.login(process.env.DISCORD_TOKEN);

// ── Serveur HTTP (keep-alive pour Render Web Service + page de statut publique) ──
const http = require('http');
const { buildStatusPage } = require('./bot/src/web/statusPage');
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  // Render ping souvent le chemin exact "/" — on garde un /health ultra simple pour les checks externes
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }
  try {
    const html = await buildStatusPage(client);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    logger.error('Bot', 'Erreur génération page de statut', err);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  }
}).listen(PORT, () => {
  logger.info('Bot', `HTTP keep-alive + page de statut sur le port ${PORT}`);
});
