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

  // ── Remerciement quotidien des boosters ──────────────────────────────────
  const cron = require('node-cron');
  const Config = require('./bot/src/db/models/Config');

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
  if (message.author.bot || !message.guild) return;
  try {
    const { handleMessage } = require('./bot/src/systems/singe');
    // XP via le système de base
    const User = require('./bot/src/db/models/User');
    const Config = require('./bot/src/db/models/Config');
    const cfg = await Config.findOne({ guildId: message.guild.id });
    const xpPerMsg = cfg?.xpPerMessage || 15;
    const cooldown = (cfg?.xpCooldown || 60) * 1000;

    const user = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
    const now = Date.now();
    if (user && user.lastMessageAt && (now - user.lastMessageAt.getTime()) < cooldown) return;

    const updated = await User.findOneAndUpdate(
      { userId: message.author.id, guildId: message.guild.id },
      {
        $inc: { xp: xpPerMsg, totalXp: xpPerMsg, weekXp: xpPerMsg, messageCount: 1 },
        $set: { lastMessageAt: new Date(), username: message.author.username },
      },
      { upsert: true, new: true }
    );

    // Level up check
    const newLevel = Math.floor(0.1 * Math.sqrt(updated.totalXp));
    if (newLevel > (updated.level || 0)) {
      await User.updateOne({ userId: message.author.id, guildId: message.guild.id }, { level: newLevel });
      const rankChannelId = cfg?.rankChannelId;
      const ch = rankChannelId ? message.guild.channels.cache.get(rankChannelId) : message.channel;
      if (ch) {
        const { getEmojis } = require('./bot/src/utils/getEmoji');
        const E = await getEmojis(message.guild.id, 'XP', 'WIN');
        ch.send(`${E.WIN} **${message.author.displayName}** passe au **niveau ${newLevel}** ! ${E.XP}`).catch(() => {});
      }
      // Rôle de niveau
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
    if (!cfg?.announceChannelId) return;
    const ch = member.guild.channels.cache.get(cfg.announceChannelId);
    if (!ch) return;
    ch.send(`👋 Bienvenue **${member.displayName}** sur le serveur !`).catch(() => {});
  } catch {}
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
client.login(process.env.DISCORD_TOKEN);

// ── Serveur HTTP (keep-alive pour Render Web Service) ──────────────────────
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  logger.info('Bot', `HTTP keep-alive sur le port ${PORT}`);
});
