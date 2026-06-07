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

  // ── Défis — replanifier les actifs ────────────────────────────────────
  try {
    const { rescheduleDefis } = require('./systems/defis');
    await rescheduleDefis(client);
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
    if (interaction.customId.startsWith('color_role:select:')) {
      const guildId     = interaction.customId.split(':')[2];
      const chosenRoleId = interaction.values[0];
      await interaction.deferReply({ ephemeral: true });
      try {
        const Config = require('./db/models/Config');
        const config = await Config.findOne({ guildId });
        const guild  = client.guilds.cache.get(guildId);
        if (!guild) return interaction.followUp({ content: '❌ Serveur introuvable.', ephemeral: true });
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) return interaction.followUp({ content: '❌ Membre introuvable.', ephemeral: true });

        const colorRoleIds = (config?.colorRoleIds || []).map(cr => cr.roleId);

        // Retirer tous les anciens rôles couleur
        const toRemove = member.roles.cache.filter(r => colorRoleIds.includes(r.id) && r.id !== chosenRoleId);
        for (const [, role] of toRemove) await member.roles.remove(role).catch(() => {});

        // Ajouter le nouveau rôle couleur
        await member.roles.add(chosenRoleId);

        const chosenDef = (config?.colorRoleIds || []).find(cr => cr.roleId === chosenRoleId);
        const label = chosenDef ? `${chosenDef.emoji} ${chosenDef.name}` : `<@&${chosenRoleId}>`;
        await interaction.followUp({ content: `✅ Couleur appliquée : **${label}** ! Ton pseudo sur le serveur a maintenant cette couleur.`, ephemeral: true });
      } catch (err) {
        await interaction.followUp({ content: '❌ Erreur lors de l\'attribution de la couleur.', ephemeral: true });
      }
      return;
    }
    if (interaction.customId.startsWith('staff:choix_role:')) {
      const { handleChoixRole } = require('./systems/staff');
      return handleChoixRole(interaction);
    }
    if (interaction.customId.startsWith('reglement:section:')) {
      const { handleSectionSelect } = require('./systems/reglement');
      return handleSectionSelect(interaction);
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

  // Présentation — DM de bienvenue
  const { sendWelcomeDM } = require('./systems/presentation');
  sendWelcomeDM(member, client).catch(() => {});

  // Welcome Boost — x2 XP pendant 7 jours (avec protection anti-alt)
  try {
    const { EmbedBuilder } = require('discord.js');
    const { getOrCreate }  = require('./systems/xp');
    const Config = require('./db/models/Config');
    const config = await Config.findOne({ guildId: member.guild.id });

    // ── Anti-alt : âge minimum du compte Discord ──────────────────────────
    const ACCOUNT_MIN_DAYS = 30; // jours
    const accountAgeDays   = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    const isSuspect        = accountAgeDays < ACCOUNT_MIN_DAYS;

    if (isSuspect) {
      // Log dans le salon staff / log
      const logChannelId = config?.logChannelId || config?.staffClassementChannelId;
      const logChannel   = logChannelId ? member.guild.channels.cache.get(logChannelId) : null;
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(0xFF5252)
          .setTitle('⚠️ Compte suspect détecté')
          .setDescription(
            `<@${member.id}> vient de rejoindre.\n\n` +
            `📅 Compte créé il y a **${accountAgeDays} jour(s)** (minimum : ${ACCOUNT_MIN_DAYS} jours)\n` +
            `🚫 **Welcome Boost non attribué** — possible alt account.\n\n` +
            `ID : \`${member.id}\``
          )
          .setThumbnail(member.displayAvatarURL({ size: 64 }))
          .setTimestamp();
        logChannel.send({ embeds: [embed] }).catch(() => {});
      }
      // Pas de Welcome Boost — on s'arrête là
      return;
    }

    // ── Compte légitime : Welcome Boost calé sur la semaine King ───────
    const user = await getOrCreate(member.id, member.guild.id);

    // Calculer la fin de la semaine King en cours
    const resetDay  = config?.resetDayOfWeek ?? 5; // vendredi par défaut
    const resetHour = config?.resetHour ?? 20;
    const now       = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const currentDay = now.getDay(); // 0=dim, 1=lun, ..., 5=ven
    let daysUntilReset = (resetDay - currentDay + 7) % 7;
    if (daysUntilReset === 0 && now.getHours() >= resetHour) daysUntilReset = 7; // reset déjà passé aujourd'hui → semaine suivante
    
    const boostEnd = new Date(now);
    boostEnd.setDate(boostEnd.getDate() + daysUntilReset);
    boostEnd.setHours(resetHour, 0, 0, 0);

    const daysLeft = Math.ceil((boostEnd - now) / 86400000);
    const isMoreThanHalf = daysUntilReset >= 3; // ≥ 3 jours restants = plus de la moitié

    user.welcomeBoostUntil = boostEnd;
    await user.save();

    const channelId = config?.announceChannelId;
    const channel   = channelId ? member.guild.channels.cache.get(channelId) : null;
    if (channel) {
      const boostDesc = isMoreThanHalf
        ? `🚀 **Welcome Boost actif jusqu'à la fin de la semaine King !**\n` +
          `Tu gagnes **x2 XP** sur tous tes messages pendant encore **${daysLeft} jour(s)**.\n` +
          `Profites-en pour grimper dans le classement ! 👑`
        : `⚡ **Welcome Boost actif !**\n` +
          `Tu arrives en milieu/fin de semaine King, ton boost dure **${daysLeft} jour(s)** (jusqu'au prochain reset).\n` +
          `La semaine prochaine tu repartiras sur un pied d'égalité avec tout le monde ! 🔄`;

      const embed = new EmbedBuilder()
        .setColor(isMoreThanHalf ? 0x57F287 : 0xFFA500)
        .setTitle('🎉 Nouveau membre !')
        .setDescription(
          `Bienvenue <@${member.id}> sur **${member.guild.name}** !\n\n` + boostDesc
        )
        .setThumbnail(member.displayAvatarURL({ size: 128 }))
        .setTimestamp();
      channel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch {}
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

// ── Boost ─────────────────────────────────────────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const wasBooster = oldMember.premiumSince;
    const isBooster  = newMember.premiumSince;
    if (!wasBooster && isBooster) {
      const { handleBoost } = require('./systems/animation');
      await handleBoost(newMember, client);
    }
  } catch (err) { logger.error('Boost', 'Handler error', err); }
});

// ── Réactions — épinglage auto des conseils ────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try {
    const guildId = reaction.message.guild?.id;
    if (!guildId) return;
    const Config = require('./db/models/Config');
    const config = await Config.findOne({ guildId });
    const { checkPinMessage } = require('./systems/animation');
    await checkPinMessage(reaction, config);
  } catch (err) { logger.error('Reaction', 'Handler error', err); }
});

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
