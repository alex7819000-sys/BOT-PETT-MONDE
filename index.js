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
