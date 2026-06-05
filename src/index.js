// src/index.js — Point d'entrée Bot PETIT MONDE v5
'use strict';
require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const http = require('http');

const { validateEnv }      = require('./config/env');
const { connectDB }        = require('./db/connect');
const { registerCommands, handleCommand } = require('./handlers/commands');
const { handleButton }     = require('./handlers/buttons');
const { handleModal }      = require('./handlers/modals');
const { handleMessage }    = require('./handlers/messages');
const { startSchedulers }  = require('./schedulers');
const logger               = require('./utils/logger');

validateEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,   // Ghost Bot
    GatewayIntentBits.GuildInvites,       // Invite Tracker
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ── Ready ─────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  logger.info('Bot', `Connecté en tant que ${client.user.tag}`);
  logger.info('Bot', `Serveur cible : ${process.env.GUILD_ID}`);

  await connectDB();
  await registerCommands();
  await startSchedulers(client);

  // ── Charger les invitations au démarrage ──────────────────────────────
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
      const { loadInvites } = require('./systems/invitetracker');
      await loadInvites(guild);
    }
  } catch (_) {}

  // ── Ghost Bot — se connecter si configuré ─────────────────────────────
  try {
    const Config = require('./db/models/Config');
    const config = await Config.findOne({ guildId: process.env.GUILD_ID });
    if (config?.ghostBotChannelId) {
      const { startVoicePresence } = require('./systems/voicepresence');
      await startVoicePresence(client, process.env.GUILD_ID, config.ghostBotChannelId);
    }
  } catch (_) {}

  // ── Giveaway — replanifier les actifs ─────────────────────────────────
  try {
    const { rescheduleGiveaways } = require('./systems/giveaway');
    await rescheduleGiveaways(client);
  } catch (_) {}

  logger.info('Bot', '✅ Bot v5 PETIT MONDE — 100% opérationnel');
});

// ── Interactions ──────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) return handleCommand(interaction, client);
  if (interaction.isButton())           return handleButton(interaction, client);
  if (interaction.isModalSubmit())      return handleModal(interaction, client);
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'leaderboard:type') {
      await interaction.deferUpdate();
      const { sendLeaderboard } = require('./handlers/commandHandlers/xp');
      return sendLeaderboard(interaction, interaction.guild.id, interaction.values[0]);
    }
  }
});

// ── Messages ──────────────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  handleMessage(message, client).catch(err => logger.error('Message', 'Handler error', err));
});

// ── Invite Tracker ────────────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  const { handleMemberJoin } = require('./systems/invitetracker');
  handleMemberJoin(member).catch(() => {});
});

client.on('inviteCreate', async invite => {
  const { handleInviteCreate } = require('./systems/invitetracker');
  handleInviteCreate(invite).catch(() => {});
});

client.on('inviteDelete', async invite => {
  const { handleInviteDelete } = require('./systems/invitetracker');
  handleInviteDelete(invite).catch(() => {});
});

// ── Errors ────────────────────────────────────────────────────────────────
client.on('error', err => logger.error('Client', 'Discord error', err));
process.on('unhandledRejection', err => logger.error('Process', 'Unhandled rejection', err));
process.on('uncaughtException',  err => { logger.error('Process', 'Uncaught exception', err); process.exit(1); });

// ── Graceful shutdown ─────────────────────────────────────────────────────
process.on('SIGTERM', () => { logger.info('Bot', 'SIGTERM reçu'); client.destroy(); process.exit(0); });
process.on('SIGINT',  () => { logger.info('Bot', 'SIGINT reçu');  client.destroy(); process.exit(0); });

// ── Serveur Express — site web + API ──────────────────────────────────────
const express = require('express');
const path    = require('path');
const PORT    = process.env.PORT || 10000;
const app     = express();

app.use(express.static(path.join(__dirname, '../website')));

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', bot: client.user?.tag || 'starting', uptime: process.uptime() });
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const User = require('./db/models/User');
    const gid  = process.env.GUILD_ID;
    const guild = client.guilds.cache.get(gid);
    const users = await User.find({ guildId: gid, totalXp: { $gt: 0 } }).sort({ totalXp: -1 }).limit(20);
    const data = await Promise.all(users.map(async (u, i) => {
      let avatar = null, username = u.userId;
      try {
        const m = await guild?.members.fetch(u.userId).catch(() => null);
        avatar = m?.user.displayAvatarURL({ size: 64, format: 'png' }) || null;
        username = m?.displayName || u.userId;
      } catch {}
      return { rank: i + 1, userId: u.userId, username, avatar, xp: u.totalXp, weekXp: u.weekXp, level: u.level, crowns: u.crownCount || 0 };
    }));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const User   = require('./db/models/User');
    const gid    = process.env.GUILD_ID;
    const guild  = client.guilds.cache.get(gid);
    const totalUsers = await User.countDocuments({ guildId: gid });
    res.json({ memberCount: guild?.memberCount || 0, activeUsers: totalUsers, guildName: guild?.name || 'PETIT MONDE', icon: guild?.iconURL({ size: 128, format: 'png' }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../website/index.html'));
});

app.listen(PORT, () => logger.info('HTTP', `Serveur démarré sur port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
