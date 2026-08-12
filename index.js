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

// ── Filet de sécurité global ─────────────────────────────────────────────
// Sans ça, UNE SEULE erreur non interceptée n'importe où dans le bot (un require()
// cassé, un bug dans une commande, peu importe) fait planter TOUT le process Node,
// donc TOUT le serveur Discord cesse de répondre jusqu'au redémarrage. On log
// l'erreur et on continue à tourner, plutôt que de tout faire tomber pour un seul bug.
process.on('unhandledRejection', (err) => {
  logger.error('Process', 'Unhandled Rejection (le bot a évité un crash) :', err);
});
process.on('uncaughtException', (err) => {
  logger.error('Process', 'Uncaught Exception (le bot a évité un crash) :', err);
});

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

  // ── Ghost Bot — rejoint automatiquement les salons vocaux configurés ────
  // (survit aux redémarrages / redeploy Render)
  require('./bot/src/systems/ghostBot').reconnectAll(client).catch((err) => {
    logger.error('Bot', 'Erreur reconnexion Ghost Bot', err);
  });

  // ── Tracker d'invitations — snapshot initial des invitations de chaque serveur ──
  require('./bot/src/systems/inviteTracker').cacheAllGuilds(client).catch((err) => {
    logger.error('Bot', 'Erreur cache invitations', err);
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
    `si vous aimez le serveur, c'est le moment de le montrer 💜 un boost ça prend 10 secondes et ça change tout pour nous`,
    `on sait pas comment le dire autrement : si ce serveur vous plaît, boostez-le 🙏💜 c'est littéralement la seule chose qu'on demande`,
    `pas de blague cette fois : on a besoin de vous. si le serv vous apporte quelque chose, rendez-lui un peu en boostant 💜`,
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

  // Envoie un message de supplication au boost, avec ping du rôle configuré si dispo
  async function sendBegMessage() {
    const guilds = client.guilds.cache.values();
    for (const guild of guilds) {
      const cfg = await Config.findOne({ guildId: guild.id });
      if (!cfg?.boostChannelId) continue;

      const ch = guild.channels.cache.get(cfg.boostChannelId);
      if (!ch) continue;

      const msg = BEG_MESSAGES[Math.floor(Math.random() * BEG_MESSAGES.length)];
      const ping = cfg?.boostPingRoleId ? `<@&${cfg.boostPingRoleId}> ` : '';
      await ch.send({ content: `${ping}${msg}` }).catch(() => {});
    }
  }

  // Deux fois par jour (≈ toutes les 12h) — incitation à booster
  cron.schedule('0 8 * * *', async () => {
    try { await sendBegMessage(); } catch (err) { logger.error('Bot', 'Erreur cron boost beg (8h)', err); }
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 20 * * *', async () => {
    try { await sendBegMessage(); } catch (err) { logger.error('Bot', 'Erreur cron boost beg (20h)', err); }
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

  // Toutes les 5 minutes — lève le malus counting (rôle Singe + blocage salon) une fois expiré
  cron.schedule('*/5 * * * *', async () => {
    try {
      await require('./bot/src/systems/counting').cleanupExpiredMalus(client);
    } catch (err) {
      logger.error('Bot', 'Erreur nettoyage malus counting', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Toutes les 5 minutes — crédite l'XP vocal de tout le monde réellement connecté
  cron.schedule('*/5 * * * *', async () => {
    try {
      await creditVoiceXp(client);
    } catch (err) {
      logger.error('Bot', 'Erreur crédit XP vocal', err);
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

  // Génération de quêtes H24 — toutes les 6h (si moins de 5 quêtes actives)
  cron.schedule('0 */6 * * *', async () => {
    try {
      await require('./bot/src/systems/quetes').generatePeriodicQuests(client);
    } catch (err) {
      logger.error('Bot', 'Erreur cron quêtes périodiques H24', err);
    }
  });

  // Nettoyage des bonus XP expirés — toutes les heures
  cron.schedule('0 * * * *', async () => {
    try {
      await require('./bot/src/systems/bonusXp').cleanExpiredBonuses();
    } catch (err) {
      logger.error('Bot', 'Erreur cron nettoyage bonus XP', err);
    }
  });

  // Tous les dimanches à 00h00 — reset de l'XP hebdomadaire (classements weekXp)
  cron.schedule('0 0 * * 0', async () => {
    try {
      const User   = require('./bot/src/db/models/User');
      const Config = require('./bot/src/db/models/Config');
      for (const guild of client.guilds.cache.values()) {
        await User.updateMany({ guildId: guild.id }, { weekXp: 0 });

        // Retirer tous les rôles hebdo de tous les membres
        const cfg = await Config.findOne({ guildId: guild.id }).lean();
        if (cfg?.weeklyLevelRoles?.length) {
          const roleIds = cfg.weeklyLevelRoles.map(lr => lr.roleId);
          try {
            const members = await guild.members.fetch();
            for (const [, member] of members) {
              for (const roleId of roleIds) {
                if (member.roles.cache.has(roleId)) {
                  await member.roles.remove(roleId).catch(() => {});
                }
              }
            }
          } catch { /* guild non dispo */ }
        }
      }
      logger.info('Bot', 'Reset XP hebdomadaire + rôles hebdo effectué');
    } catch (err) {
      logger.error('Bot', 'Erreur reset XP hebdomadaire', err);
    }
  }, { timezone: 'Europe/Paris' });

  // Bonus surprise bataille chien/chat — vérifié toutes les heures
  cron.schedule('0 * * * *', async () => {
    try {
      const factionSys = require('./bot/src/systems/faction');
      await factionSys.maybeTriggerMultiplierEvent(client);
    } catch (err) { logger.error('Bot', 'Erreur cron bonus bataille', err); }
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

  // Reset factions hebdo (dimanche minuit)
  cron.schedule('5 0 * * 0', async () => {
    try {
      const factionSys = require('./bot/src/systems/faction');
      for (const guild of client.guilds.cache.values()) {
        await factionSys.weeklyReset(guild);
      }
      logger.info('Bot', 'Reset factions effectué');
    } catch (err) { logger.error('Bot', 'Erreur cron reset factions', err); }
  }, { timezone: 'Europe/Paris' });

  // Nettoyage des rôles Ban vocal / Ban tchat temporaires expirés — toutes les 5 min
  cron.schedule('*/5 * * * *', async () => {
    try {
      await require('./bot/src/systems/sanctions').cleanupExpiredPenalties(client);
    } catch (err) { logger.error('Bot', 'Erreur cron nettoyage sanctions', err); }
  });

  // ── Bump reminder toutes les 2h ──────────────────────────────────────
  startBumpReminder(client);

  // ── Classement Counting : mini-classement toutes les 3h (pas de bonus, juste suivi) ──
  // DÉSACTIVÉ — Commenté pour éviter les messages automatiques repetitifs dans #count-down
  // cron.schedule('0 */3 * * *', async () => {
  //   try {
  //     const { postIntermediateLeaderboard } = require('./bot/src/systems/countingLeaderboard');
  //     await postIntermediateLeaderboard(client);
  //   } catch (err) { logger.error('Bot', 'Erreur mini-classement counting', err); }
  // }, { timezone: 'Europe/Paris' });

  // ── Classement Counting final + couronnement du Champion du jour (minuit) ──
  cron.schedule('0 0 * * *', async () => {
    try {
      const { postFinalLeaderboardAndCrown } = require('./bot/src/systems/countingLeaderboard');
      await postFinalLeaderboardAndCrown(client);
      logger.info('Bot', 'Classement counting final + couronnement effectué');
    } catch (err) { logger.error('Bot', 'Erreur classement counting final', err); }
  }, { timezone: 'Europe/Paris' });

  // ── Podium quotidien — champions de la journée (XP, msgs, images, vocal, bumps) ──
  cron.schedule('1 0 * * *', async () => {
    try {
      const { postDailyPodium } = require('./bot/src/systems/dailyPodium');
      await postDailyPodium(client);
      logger.info('Bot', 'Podium quotidien posté + compteurs remis à zéro');
    } catch (err) { logger.error('Bot', 'Erreur podium quotidien', err); }
  }, { timezone: 'Europe/Paris' });

  // ── King du Vocal — chaque lundi à 00h05 ─────────────────────────────────
  cron.schedule('5 0 * * 1', async () => {
    try {
      const Config = require('./bot/src/db/models/Config');
      const User = require('./bot/src/db/models/User');
      const configs = await Config.find({ voiceKingEnabled: true, voiceKingRoleId: { $ne: null } }).lean();
      for (const cfg of configs) {
        const guild = client.guilds.cache.get(cfg.guildId);
        if (!guild) continue;
        // Trouve le membre avec le plus de voiceMinutes cette semaine
        const topUser = await User.findOne({ guildId: cfg.guildId })
          .sort({ voiceMinutes: -1 }).lean();
        if (!topUser) continue;
        const role = guild.roles.cache.get(cfg.voiceKingRoleId);
        if (!role) continue;
        // Retire le rôle à l'ancien king
        const currentKings = guild.members.cache.filter(m => m.roles.cache.has(cfg.voiceKingRoleId));
        for (const [, m] of currentKings) {
          await m.roles.remove(role).catch(() => {});
        }
        // Attribue au nouveau king
        const newKing = guild.members.cache.get(topUser.userId);
        if (newKing) {
          await newKing.roles.add(role).catch(() => {});
          if (cfg.voiceKingChannelId) {
            const ch = guild.channels.cache.get(cfg.voiceKingChannelId);
            if (ch) {
              const { EmbedBuilder } = require('discord.js');
              const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('👑 Nouveau King du Vocal !')
                .setDescription(`${newKing} est le **King du Vocal** cette semaine avec **${topUser.voiceMinutes || 0} minutes** passées en vocal ! 🎙️`)
                .setThumbnail(newKing.user.displayAvatarURL())
                .setTimestamp();
              ch.send({ embeds: [embed] }).catch(() => {});
            }
          }
        }
      }
      logger.info('Bot', 'King du Vocal hebdomadaire attribué');
    } catch (err) { logger.error('Bot', 'Erreur King du Vocal', err); }
    
    // Réinitialise le classement hebdomadaire 7777 en même temps
    try {
      const { resetWeeklyLeaderboard } = require('./bot/systems/table7777');
      const configs = await require('./bot/src/db/models/Config').find().lean();
      for (const cfg of configs) {
        await resetWeeklyLeaderboard(cfg.guildId);
      }
      logger.info('Bot', 'Classement hebdomadaire 7777 réinitialisé');
    } catch (err) { logger.error('Bot', 'Erreur reset 7777', err); }
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

// ── Tracker d'invitations — tenir le cache à jour en temps réel ────────────
client.on('inviteCreate', invite => {
  require('./bot/src/systems/inviteTracker').onInviteCreate(invite);
});
client.on('inviteDelete', invite => {
  require('./bot/src/systems/inviteTracker').onInviteDelete(invite);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) { await handleCommand(interaction, client); return; }

    // ── Ping toggle DM — gestion des boutons de sélection de pings ──
    if (interaction.isButton() && interaction.customId.startsWith('ping_toggle:')) {
      const [, pingId, roleId] = interaction.customId.split(':');
      // Les DMs n'ont pas de guild — on cherche le serveur via les guilds du bot
      let targetGuild = null;
      for (const [, g] of client.guilds.cache) {
        try {
          const mem = await g.members.fetch(interaction.user.id).catch(() => null);
          if (mem) { targetGuild = g; break; }
        } catch {}
      }
      if (!targetGuild || !roleId) {
        return interaction.reply({ content: '❌ Impossible de trouver ton serveur.', ephemeral: true });
      }
      const mem = await targetGuild.members.fetch(interaction.user.id).catch(() => null);
      if (!mem) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });

      const hasRole = mem.roles.cache.has(roleId);
      if (hasRole) {
        await mem.roles.remove(roleId).catch(() => {});
        await interaction.reply({ content: `🔕 Ping **désactivé** — tu ne recevras plus ces notifications.`, ephemeral: true });
      } else {
        await mem.roles.add(roleId).catch(() => {});
        await interaction.reply({ content: `🔔 Ping **activé** — tu recevras ces notifications !`, ephemeral: true });
      }
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) { await handleButton(interaction, client); return; }
    if (interaction.isModalSubmit()) { await handleModal(interaction, client); return; }
  } catch (err) {
    const cmdInfo = interaction.isChatInputCommand() ? `/` + interaction.commandName : (interaction.customId || '?');
    logger.error('Bot', `[${cmdInfo}] Interaction error:`, err?.message || err);
    console.error('Full interaction error:', err); // Log complet
    // Sans ça, l'utilisateur reste bloqué sur "BOT PETIT MONDE réfléchit..." indéfiniment
    // dès qu'une commande plante après avoir déjà déferré sa réponse.
    const errorMsg = err?.message || 'Erreur inconnue';
    const reply = { content: `❌ Une erreur est survenue: ${errorMsg}`.substring(0, 2000), ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
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

    // Salon "face-reveal" — poste automatiquement l'embed Smash/Pass quand un membre
    // upload une image directement dans le salon (plus besoin de /smash facereveal soumettre)
    if (cfg?.faceRevealChannelId && message.channel.id === cfg.faceRevealChannelId) {
      const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
      if (image) {
        const { postFaceReveal } = require('./bot/src/systems/faceReveal');
        const result = await postFaceReveal(message.channel, message.guild, message.guild.id, {
          imageUrl: image.url,
          authorId: message.author.id,
          authorName: message.author.username,
        }).catch(() => null);
        if (result) await message.delete().catch(() => {});
      } else {
        // Pas d'image → on supprime pour garder le salon propre (uniquement des face reveals)
        await message.delete().catch(() => {});
      }
      return;
    }

    // Salon "counting" — compter 1, 2, 3... à la suite (avec système de bluff)
    const countingSystem = require('./bot/src/systems/counting');
    const countingHandled = await countingSystem.handleMessage(message);
    if (countingHandled) return; // pas d'XP si le message a été traité par le counting

    // Salons exclus du gain d'XP (configuré via /notif exclusion)
    if (cfg?.xpExcludedChannelIds?.includes(message.channel.id)) return;

    const baseXpPerMsg = cfg?.xpPerMessage || 15;
    const cooldown = (cfg?.xpCooldown || 60) * 1000;

    const user = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
    const now = Date.now();
    if (user && user.lastMessageAt && (now - user.lastMessageAt.getTime()) < cooldown) return;

    // Bonus XP "Champion du Counting" (+X% pendant 24h, voir countingLeaderboard.js)
    // Multiplicateur combiné : Champion Counting + bonus quêtes temporaires (max 3 cumulables)
    const { getCountingXpMultiplier } = require('./bot/src/systems/countingLeaderboard');
    const { getXpMultiplier: getBonusMultiplier } = require('./bot/src/systems/bonusXp');
    const { getActiveMalusPercent } = require('./bot/src/systems/counting');
    const [countingMult, bonusMult, malusPercent] = await Promise.all([
      getCountingXpMultiplier(message.author.id, message.guild.id).catch(() => 1),
      getBonusMultiplier(message.author.id, message.guild.id).catch(() => 1),
      getActiveMalusPercent(message.author.id, message.guild.id).catch(() => 0),
    ]);
    const malusMult = malusPercent > 0 ? (1 - malusPercent / 100) : 1;
    const xpMultiplier = countingMult * bonusMult * malusMult;
    const xpPerMsg = Math.max(1, Math.round(baseXpPerMsg * xpMultiplier));

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
          ...(message.attachments.some(a => a.contentType?.startsWith('image/')) ? { imagesDay: 1 } : {}),
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

      // Rôle de niveau — cumulable (garde tous) ou évolutif (swap)
      const cfg = await require('./bot/src/db/models/Config').findOne({ guildId: message.guild.id }).lean().catch(() => null);
      if (cfg?.levelRoles?.length) {
        const allSorted = [...cfg.levelRoles].sort((a, b) => b.level - a.level);
        const member = message.member;
        if (member) {
          const topEvolutif = allSorted.find(lr => !lr.stackable && lr.level <= newLevel);
          for (const lr of allSorted) {
            if (lr.stackable) {
              if (lr.level <= newLevel && !member.roles.cache.has(lr.roleId)) {
                member.roles.add(lr.roleId).catch(() => {});
              }
            } else {
              if (topEvolutif && lr.roleId === topEvolutif.roleId) {
                if (!member.roles.cache.has(lr.roleId)) member.roles.add(lr.roleId).catch(() => {});
              } else {
                if (member.roles.cache.has(lr.roleId)) member.roles.remove(lr.roleId).catch(() => {});
              }
            }
          }
        }
      }
    }

    // ── Rôles hebdo (weekXp) — mis à jour à chaque message ──────────────
    if (!cfg) return; // cfg déjà chargé plus haut, sinon skip
    if (cfg?.weeklyLevelRoles?.length) {
      const weekXp = updated.weekXp || 0;
      const weekSorted = [...cfg.weeklyLevelRoles].sort((a, b) => b.level - a.level);
      const weekMatch  = weekSorted.find(lr => lr.level <= weekXp);
      const mem = message.member;
      if (mem) {
        for (const lr of weekSorted) {
          const hasIt = mem.roles.cache.has(lr.roleId);
          if (weekMatch && lr.roleId === weekMatch.roleId) {
            if (!hasIt) {
              await mem.roles.add(lr.roleId).catch(() => {});
              // Tip : nouveau rôle hebdo débloqué
              const roleObj = message.guild.roles.cache.get(lr.roleId);
              if (roleObj) {
                const { sendTip, TIPS } = require('./bot/src/systems/tips');
                await sendTip(message, TIPS.weeklyRoleUp(roleObj.name, weekXp));
              }
            }
          } else {
            if (hasIt) mem.roles.remove(lr.roleId).catch(() => {});
          }
        }
      }
    }

    // ── Tips missions du jour ─────────────────────────────────────────────
    {
      const { sendTip, TIPS } = require('./bot/src/systems/tips');
      const prev = user || {}; // état avant la mise à jour
      const msgs  = updated.messagesDay  || 0;
      const bumps = updated.bumpDay      || 0;
      const vocal = updated.vocalMinutesToday || 0;
      const react = updated.reactionsToday   || 0;
      const inv   = updated.invitesToday     || 0;

      // Seuils : dès qu'on franchit le cap (avant = dessous, après = dessus)
      const justHit = (field, threshold) =>
        (prev[field] || 0) < threshold && (updated[field] || 0) >= threshold;

      if (justHit('messagesDay', 20))
        await sendTip(message, TIPS.missionComplete('💬 20 messages', 0));
      if (justHit('bumpDay', 1))
        await sendTip(message, TIPS.missionComplete('🚀 1 bump', 0));
      if (justHit('vocalMinutesToday', 20))
        await sendTip(message, TIPS.missionComplete('🎙️ 20 min vocal', 0));
      if (justHit('reactionsToday', 5))
        await sendTip(message, TIPS.missionComplete('⭐ 5 réactions', 0));
      if (justHit('invitesToday', 1))
        await sendTip(message, TIPS.missionComplete('📨 1 invite', 0));

      // Toutes les missions complétées ?
      const allDone = msgs >= 20 && bumps >= 1 && vocal >= 20 && react >= 5 && inv >= 1;
      const wasAllDone = (prev.messagesDay||0) >= 20 && (prev.bumpDay||0) >= 1
        && (prev.vocalMinutesToday||0) >= 20 && (prev.reactionsToday||0) >= 5
        && (prev.invitesToday||0) >= 1;
      if (allDone && !wasAllDone)
        await sendTip(message, TIPS.allMissionsDone());
    }
  } catch (err) {
    logger.error('Bot', 'Erreur messageCreate', err);
  }
});

// ── Vocal XP ──────────────────────────────────────────────────────────────
const voiceJoinTimes = new Map(); // uniquement pour le message de fin de session (cosmétique)
const tempVoiceChannels = new Set(); // IDs des salons vocaux temporaires actifs

// ── Crédit XP vocal — toutes les 5 minutes, à tout le monde RÉELLEMENT connecté ──
// Remplace l'ancien système (join/leave en mémoire) qui ne donnait JAMAIS d'XP réelle
// (le calcul ne servait qu'au texte du DM) et perdait toute la session à chaque
// redéploiement du bot. Ici, l'XP est créditée en continu pendant que la personne est
// en vocal — un redémarrage du bot ne fait perdre que les minutes pendant lesquelles
// il était hors-ligne, jamais toute la session.
const VOICE_XP_INTERVAL_MIN = 5;
const VOICE_XP_PER_MIN = 5;
// Bonus de fidélité — plus la session vocale continue est longue, plus le taux d'XP/min
// augmente. +10% par heure pleine passée, jusqu'à +100% au bout de 10h. Calculé sur
// voiceSessionStartedAt (persisté en base, donc ça survit aux redémarrages du bot —
// seul un vrai départ du vocal réinitialise le compteur de fidélité, pas un redéploiement).
const LOYALTY_BONUS_PER_HOUR = 0.10;
const LOYALTY_BONUS_MAX = 1.0; // plafond +100%

async function creditVoiceXp(client) {
  const User = require('./bot/src/db/models/User');
  const { handleLevelUp } = require('./bot/src/systems/levelUp');

  for (const guild of client.guilds.cache.values()) {
    for (const [, channel] of guild.channels.cache) {
      if (!channel.isVoiceBased?.()) continue;
      if (guild.afkChannelId && channel.id === guild.afkChannelId) continue; // pas l'XP en étant juste AFK

      for (const [, member] of channel.members) {
        if (member.user.bot) continue; // exclut le Ghost Bot et tout autre bot

        try {
          // Si on n'a pas encore de début de session enregistré pour ce membre (premier
          // tick après son arrivée, ou après un redémarrage du bot pendant qu'il était déjà
          // co), on le démarre maintenant — jamais bloquant, jamais de perte totale.
          let existing = await User.findOne({ userId: member.id, guildId: guild.id }).lean();
          if (!existing?.voiceSessionStartedAt) {
            await User.updateOne(
              { userId: member.id, guildId: guild.id },
              { voiceSessionStartedAt: new Date() },
              { upsert: true }
            );
            existing = { ...existing, voiceSessionStartedAt: new Date() };
          }

          const hoursConnected = (Date.now() - new Date(existing.voiceSessionStartedAt).getTime()) / 3_600_000;
          const loyaltyMult = 1 + Math.min(LOYALTY_BONUS_MAX, hoursConnected * LOYALTY_BONUS_PER_HOUR);
          const xpGain = Math.round(VOICE_XP_INTERVAL_MIN * VOICE_XP_PER_MIN * loyaltyMult);

          const updated = await User.findOneAndUpdate(
            { userId: member.id, guildId: guild.id },
            { $inc: { xp: xpGain, totalXp: xpGain, vocalMinutes: VOICE_XP_INTERVAL_MIN, vocalMinutesToday: VOICE_XP_INTERVAL_MIN } },
            { upsert: true, new: true }
          );

          const newLevel = Math.floor(0.1 * Math.sqrt(updated.totalXp));
          if (newLevel > (updated.level || 0)) {
            await User.updateOne({ userId: member.id, guildId: guild.id }, { level: newLevel });
            const fakeMessage = { author: member.user, member, guild, channel: null };
            await handleLevelUp(fakeMessage, newLevel, updated).catch(() => {});
          }

          require('./bot/src/systems/quetes').trackVocalProgress(member.id, guild.id, guild, VOICE_XP_INTERVAL_MIN).catch(() => {});
        } catch (err) {
          logger.error('Bot', `Erreur crédit XP vocal pour ${member.id}`, err);
        }
      }
    }
  }
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const uid = newState.id || oldState.id;
  const gid = newState.guild?.id || oldState.guild?.id;
  if (!gid) return;

  // Rôle vocal — attribuer/retirer selon l'état
  try {
    const Config = require('./bot/src/db/models/Config');
    const vcfg = await Config.findOne({ guildId: gid }).lean();
    if (vcfg?.voiceRoleId) {
      const guild = newState.guild || oldState.guild;
      const mem = guild?.members.cache.get(uid);
      if (mem) {
        const joinedVoice = !oldState.channelId && newState.channelId;
        const leftVoice = oldState.channelId && !newState.channelId;
        if (joinedVoice && !mem.roles.cache.has(vcfg.voiceRoleId)) {
          mem.roles.add(vcfg.voiceRoleId).catch(() => {});
        } else if (leftVoice && mem.roles.cache.has(vcfg.voiceRoleId)) {
          mem.roles.remove(vcfg.voiceRoleId).catch(() => {});
        }
      }
    }

    // ── Salons vocaux temporaires ─────────────────────────────────────
    if (vcfg?.tempVoiceEnabled && vcfg?.tempVoiceCreateChannelId) {
      const guild = newState.guild || oldState.guild;

      // Quelqu'un rejoint le salon "créer un vocal"
      if (newState.channelId === vcfg.tempVoiceCreateChannelId) {
        const member = guild?.members.cache.get(uid);
        if (member) {
          const username = member.displayName || member.user.username;
          const channelName = (vcfg.tempVoiceNameTemplate || '🎙️ {username}')
            .replace('{username}', username)
            .replace('{tag}', member.user.tag || username);
          const options = {
            name: channelName,
            type: 2, // GUILD_VOICE
            parent: vcfg.tempVoiceCategoryId || newState.channel?.parentId || null,
            userLimit: vcfg.tempVoiceMaxUsers || 0,
          };
          try {
            const newChan = await guild.channels.create(options);
            await member.voice.setChannel(newChan).catch(() => {});
            // stocker ce canal comme temporaire
            tempVoiceChannels.add(newChan.id);
          } catch (e) {
            console.error('[TempVoice] Erreur création salon:', e.message);
          }
        }
      }

      // Quelqu'un quitte un salon temporaire → si vide, supprimer
      if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
        const chan = guild?.channels.cache.get(oldState.channelId);
        if (chan && chan.members.size === 0) {
          tempVoiceChannels.delete(oldState.channelId);
          chan.delete('Salon vocal temporaire vide').catch(() => {});
        }
      }
    }
  } catch { /* ignore */ }

  // Rejoint un salon — on note juste l'heure pour le message de fin de session (cosmétique)
  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(`${gid}:${uid}`, Date.now());
  }
  // Quitte un salon
  if (oldState.channelId && !newState.channelId) {
    // Réinitialise le compteur de fidélité — une vraie sortie du vocal remet le bonus à zéro
    // (contrairement à un simple redémarrage du bot, qui ne génère pas cet événement).
    require('./bot/src/db/models/User').updateOne(
      { userId: uid, guildId: gid },
      { voiceSessionStartedAt: null }
    ).catch(() => {});

    const key = `${gid}:${uid}`;
    const joinTime = voiceJoinTimes.get(key);
    voiceJoinTimes.delete(key);
    if (!joinTime) return; // pas de session connue (ex: bot redémarré pendant qu'il était co) — l'XP a quand même été créditée par le cron

    const minutes = Math.floor((Date.now() - joinTime) / 60000);
    if (minutes < 2) return; // pas de DM pour une session trop courte

    try {
      const xpGained = minutes * VOICE_XP_PER_MIN; // déjà réellement crédité via le cron pendant la session (hors bonus de fidélité, donc indicatif)
      const member = newState.guild?.members.cache.get(uid) || oldState.guild?.members.cache.get(uid);
      if (member) {
        const { TIPS } = require('./bot/src/systems/tips');
        await member.user.send(TIPS.vocalXp(minutes, xpGained)).catch(() => {});
      }
    } catch { /* DMs fermés */ }
  }
});

// ── GuildMemberAdd ─────────────────────────────────────────────────────────
const welcomeCooldowns = new Map(); // `${guildId}:${userId}` → timestamp dernier message envoyé
client.on('guildMemberAdd', async member => {
  try {
    // Garde-fou : si ce membre a déjà reçu un message de bienvenue dans les 60
    // dernières secondes (rejoin en boucle, double event Discord, etc.), on ne
    // spamme pas le salon une 2e fois.
    const cooldownKey = `${member.guild.id}:${member.id}`;
    const last = welcomeCooldowns.get(cooldownKey);
    if (last && Date.now() - last < 60_000) return;
    welcomeCooldowns.set(cooldownKey, Date.now());
    if (welcomeCooldowns.size > 5000) {
      const cutoff = Date.now() - 60_000;
      for (const [k, t] of welcomeCooldowns) if (t < cutoff) welcomeCooldowns.delete(k);
    }

    const Config = require('./bot/src/db/models/Config');
    const cfg = await Config.findOne({ guildId: member.guild.id });

    // ── Tracker d'invitations — qui a invité ce membre ? ────────────────────
    const inviteTracker = require('./bot/src/systems/inviteTracker');
    const inviteInfo = await inviteTracker.resolveUsedInvite(member).catch(() => null);
    await inviteTracker.recordJoin(member, inviteInfo);

    // Log dans le salon de logs si configuré
    const logChannelId = cfg?.logChannelId || cfg?.logsChannelId;
    if (logChannelId) {
      const logCh = member.guild.channels.cache.get(logChannelId);
      if (logCh) {
        let inviteLine = '❓ Invitation inconnue (widget, découverte, lien vanity effacé...)';
        if (inviteInfo?.type === 'vanity') inviteLine = `🔗 Lien personnalisé du serveur (**/${inviteInfo.code}**)`;
        else if (inviteInfo?.inviterId) inviteLine = `👤 Invité par <@${inviteInfo.inviterId}> (code **${inviteInfo.code}**)`;
        else if (inviteInfo?.code) inviteLine = `🔗 Code **${inviteInfo.code}** (créateur inconnu, ex: invitation supprimée)`;

        logCh.send({
          embeds: [{
            color: 0x57F287,
            title: '📥 Nouveau membre',
            description: `<@${member.id}> a rejoint le serveur.\n\n${inviteLine}`,
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => {});
      }
    }

    const { EmbedBuilder } = require('discord.js');
    const memberCount = member.guild.memberCount;
    const fill = (str) => (str || '')
      .replace(/\{user\}/g, `<@${member.id}>`)
      .replace(/\{username\}/g, member.user.username)
      .replace(/\{server\}/g, member.guild.name)
      .replace(/\{membercount\}/g, memberCount);

    // 1. Message COURT dans le chat général (configurable ou par défaut)
    const chatChannelId = cfg?.welcomeChannelId || cfg?.announceChannelId;
    if (chatChannelId) {
      const chatCh = member.guild.channels.cache.get(chatChannelId);
      if (chatCh) {
        // Message court style Etherya : "Bienvenue @user ! Nous sommes désormais XXX membres."
        const shortText = cfg?.welcomeShortText
          ? fill(cfg.welcomeShortText)
          : `Bienvenue <@${member.id}> ! Nous sommes désormais **${memberCount}** membres. 🎉`;
        chatCh.send({ content: shortText }).catch(() => {});
      }
    }

    // 1b. Embed COMPLET dans le salon bienvenue dédié (style Etherya)
    if (cfg?.welcomeCardEnabled && cfg?.welcomeCardChannelId) {
      const cardCh = member.guild.channels.cache.get(cfg.welcomeCardChannelId);
      if (cardCh) {
        const color = cfg.welcomeColor ? parseInt(cfg.welcomeColor.replace('#',''), 16) : 0x2ecc71;
        const embed = new EmbedBuilder().setColor(color);

        // Titre
        const titleText = cfg.welcomeTitle ? fill(cfg.welcomeTitle) : `🎉 Bienvenue sur ${member.guild.name} !`;
        embed.setTitle(titleText);

        // Description
        const descText = cfg.welcomeDesc
          ? fill(cfg.welcomeDesc)
          : `Hey <@${member.id}>, on est ravis de t'accueillir parmi nous !\n\nTu es le **${memberCount}e** membre du serveur.`;
        embed.setDescription(descText);

        // Author
        if (cfg.welcomeAuthor) {
          const authorOpts = { name: fill(cfg.welcomeAuthor) };
          if (cfg.welcomeAuthorIcon) authorOpts.iconURL = cfg.welcomeAuthorIcon;
          if (cfg.welcomeAuthorUrl) authorOpts.url = cfg.welcomeAuthorUrl;
          embed.setAuthor(authorOpts);
        }

        // Thumbnail
        const thumbMode = cfg.welcomeThumbnail || 'avatar';
        if (thumbMode === 'avatar') embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
        else if (thumbMode === 'server') embed.setThumbnail(member.guild.iconURL({ dynamic: true, size: 256 }) || null);
        else if (thumbMode === 'custom' && cfg.welcomeThumbnailUrl) embed.setThumbnail(cfg.welcomeThumbnailUrl);

        // Champs custom
        if (cfg.welcomeFields && cfg.welcomeFields.length > 0) {
          const fields = cfg.welcomeFields
            .filter(f => f.name || f.value)
            .map(f => ({ name: fill(f.name || '⠀'), value: fill(f.value || '⠀'), inline: !!f.inline }));
          if (fields.length) embed.addFields(fields);
        }

        // Footer
        if (cfg.welcomeFooter) {
          const footerOpts = { text: fill(cfg.welcomeFooter) };
          if (cfg.welcomeFooterIcon) footerOpts.iconURL = cfg.welcomeFooterIcon;
          embed.setFooter(footerOpts);
        }
        if (cfg.welcomeTimestamp) embed.setTimestamp();

        // Génération de la carte canvas style Etherya (avatar sur bannière)
        if (cfg.welcomeImage) {
          try {
            const { buildWelcomeAttachment } = require('./bot/src/systems/welcomeCard');
            const borderColor = cfg.welcomeColor || '#a855f7';
            const attachment = await buildWelcomeAttachment(member, cfg.welcomeImage, borderColor);
            embed.setImage('attachment://welcome.png');
            const cardContent = `<@${member.id}>`;
            await cardCh.send({ content: cardContent, embeds: [embed], files: [attachment] });
          } catch (canvasErr) {
            // Fallback sans canvas si @napi-rs/canvas pas installé
            logger.debug('Bot', 'Canvas welcome card failed, fallback image', canvasErr?.message);
            embed.setImage(cfg.welcomeImage);
            const cardContent = `<@${member.id}>`;
            await cardCh.send({ content: cardContent, embeds: [embed] }).catch(() => {});
          }
        } else {
          const cardContent = `<@${member.id}>`;
          await cardCh.send({ content: cardContent, embeds: [embed] }).catch(() => {});
        }
      }
    }

    // 1c. Message interactif style Etherya (avec boutons sections)
    try {
      const { sendWelcomeMessage } = require('./bot/src/systems/welcomeInteractive');
      await sendWelcomeMessage(member);
    } catch (err) {
      logger.debug('Bot', 'Welcome message interactif impossible', err);
    }

    // 2. DM de bienvenue (présentation + pings intégrés)
    try {
      const { sendWelcomeDM } = require('./bot/src/systems/presentation');
      await sendWelcomeDM(member, client);
    } catch (err) {
      logger.debug('Bot', 'DM bienvenue impossible pour ' + member.user?.tag);
    }

    // 3. Attribuer les rôles à l'arrivée
    if (cfg?.membreRoleId) {
      member.roles.add(cfg.membreRoleId).catch(() => {});
    }
    // Rôles additionnels configurés dans le dashboard (joinRoleIds)
    if (cfg?.joinRoleIds?.length) {
      for (const rid of cfg.joinRoleIds) {
        if (rid && rid !== cfg.membreRoleId) member.roles.add(rid).catch(() => {});
      }
    }

  } catch (err) {
    logger.error('Bot', 'Erreur guildMemberAdd', err);
  }
});

// ── GuildMemberRemove — départ (kick, ban, ou départ volontaire) ────────────
client.on('guildMemberRemove', async member => {
  try {
    const inviteTracker = require('./bot/src/systems/inviteTracker');
    await inviteTracker.recordLeave(member);

    const Config = require('./bot/src/db/models/Config');
    const cfg = await Config.findOne({ guildId: member.guild.id }).lean();
    const logChannelId = cfg?.logChannelId || cfg?.logsChannelId;
    if (logChannelId) {
      const logCh = member.guild.channels.cache.get(logChannelId);
      if (logCh) {
        const joinedAt = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'date inconnue';
        logCh.send({
          embeds: [{
            color: 0xFF5252,
            title: '📤 Membre parti',
            description: `**${member.user?.tag || member.id}** a quitté le serveur.\nÉtait arrivé ${joinedAt}.`,
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error('Bot', 'Erreur guildMemberRemove', err);
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

      // Pool de GIFs — un tiré au hasard pour que ça ne soit jamais le même visuel.
      // Si rien n'est configuré, on retombe sur un petit pool de GIFs "boost" par défaut.
      const DEFAULT_BOOST_GIFS = [
        'https://media.tenor.com/2roX9dKbsOYAAAAC/discord-boost.gif',
        'https://media.tenor.com/-vV7C_K-65gAAAAC/discord-nitro-boost.gif',
        'https://media.tenor.com/3l3kxzQ4_RsAAAAC/nitro-boost-discord.gif',
      ];
      const gifPool = (cfg?.boostGifUrls?.length ? cfg.boostGifUrls : null)
        || (cfg?.boostGifUrl ? [cfg.boostGifUrl] : null)
        || DEFAULT_BOOST_GIFS;
      const gif = gifPool[Math.floor(Math.random() * gifPool.length)];

      // Liste d'avantages — n'affiche que ce qui est réellement configuré, pour rester honnête.
      const perks = [];
      if (cfg?.boostRoleId) perks.push(`> 💜 Rôle <@&${cfg.boostRoleId}> à vie`);
      if (cfg?.boostXpBonus) perks.push(`> ⭐ **+${cfg.boostXpBonus} XP** offerts instantanément`);
      perks.push('> 🎖️ Ton pseudo mis en avant comme Booster du serveur');
      perks.push('> 🙏 Notre reconnaissance éternelle (et un peu de favoritisme)');

      const boosterCount = newMember.guild.members.cache.filter(m => m.premiumSince).size;

      const embed = new EmbedBuilder()
        .setColor(0xFF73FA)
        .setTitle('💜 NOUVEAU BOOST !')
        .setDescription(
          `**${newMember.displayName}** vient de booster **${newMember.guild.name}** ! 🚀\n\n` +
          `${perks.join('\n')}\n\n` +
          `On est maintenant à **${boosterCount} booster${boosterCount > 1 ? 's' : ''}** — chaque boost débloque des avantages pour TOUT le serveur (qualité audio, emojis, bannière...).\n\n` +
          `**Toi aussi tu peux booster ?** Un clic sur le nom du serveur en haut à gauche → Booster. 💜`
        )
        .setThumbnail(newMember.displayAvatarURL())
        .setImage(gif)
        .setFooter({ text: 'Merci de soutenir le serveur 💜' })
        .setTimestamp();

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

      const pingLine = [
        cfg?.boostPingRoleId ? `<@&${cfg.boostPingRoleId}>` : null,
        `🎉 ${newMember} vient de booster, lâchez-lui un ❤️ !`,
      ].filter(Boolean).join(' ');

      await ch.send({ content: pingLine, embeds: [embed] }).catch(() => {});
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
global.discordClient = client; // exposé pour le dashboard (sendEmbedToChannel)

// ── Serveur HTTP (keep-alive pour Render Web Service + page de statut publique) ──
const http = require('http');
const { buildStatusPage, getStatusData } = require('./bot/src/web/statusPage');
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  // Render ping souvent le chemin exact "/" — on garde un /health ultra simple pour les checks externes
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }
  // API JSON publique — utilisée par le site web externe (ex: site React) pour afficher
  // le nom/icône du serveur et les stats en live, sans jamais avoir à les coder en dur.
  if (req.url === '/api/stats') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=15');
    try {
      const data = await getStatusData(client);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      logger.error('Bot', 'Erreur API /api/stats', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Erreur interne' }));
    }
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
