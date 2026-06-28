// src/systems/quetes.js — Quêtes H24 automatiques + bonus XP temporaires + kakera Mudae
'use strict';
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const Quest = require('../db/models/Quest');
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const { COLORS } = require('../config/constants');
const { addBonus, getActiveBonuses, MAX_BONUSES, BONUS_TIERS } = require('./bonusXp');

function genId() {
  return 'qst_' + Math.random().toString(36).slice(2, 9);
}

function nextWeeklyReset() {
  const now = new Date();
  const d = new Date(now);
  const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Génère un bonus aléatoire pour une quête ───────────────────────────────
// Odds : 60% → +25%, 30% → +50%, 10% → +100%
function rollBonusTier() {
  const r = Math.random();
  if (r < 0.6) return 25;
  if (r < 0.9) return 50;
  return 100;
}

// ── Pool de templates de quêtes (toutes durées confondues) ─────────────────
function buildTemplates(textChannelIds = []) {
  const randomChannel = textChannelIds.length
    ? textChannelIds[Math.floor(Math.random() * textChannelIds.length)]
    : null;

  const templates = [
    // ── Quotidiennes classiques ──
    { title: '💬 Bavard du jour',        description: 'Envoie 30 messages aujourd\'hui',           kind: 'messages_total',    target: 30,  xpReward: 150, type: 'daily',  durationHours: 24 },
    { title: '🚀 Bumpeur dévoué',         description: 'Bump le serveur une fois',                  kind: 'bump',              target: 1,   xpReward: 300, type: 'daily',  durationHours: 24 },
    { title: '🎙️ Pilier du vocal',        description: 'Passe 30 minutes en vocal',                 kind: 'vocal_minutes',     target: 30,  xpReward: 200, type: 'daily',  durationHours: 24 },
    { title: '🔥 Moulin à paroles',       description: 'Envoie 60 messages aujourd\'hui',           kind: 'messages_total',    target: 60,  xpReward: 250, type: 'daily',  durationHours: 24 },
    { title: '🎤 Marathon vocal',         description: 'Passe 60 minutes en vocal',                 kind: 'vocal_minutes',     target: 60,  xpReward: 350, type: 'daily',  durationHours: 24 },

    // ── Urgentes (course au premier) ──
    { title: '⚡ Sprint de messages',     description: 'Sois le premier à envoyer 20 messages !',   kind: 'first_to_messages', target: 20,  xpReward: 400, type: 'urgent', durationHours: 6  },
    { title: '🏃 Coureur de fond',        description: 'Sois le premier à envoyer 50 messages !',   kind: 'first_to_messages', target: 50,  xpReward: 600, type: 'urgent', durationHours: 12 },
    { title: '⚡ Bump flash',             description: 'Sois le premier à bumper le serveur !',     kind: 'bump',              target: 1,   xpReward: 500, type: 'urgent', durationHours: 3, winnerOnly: true },

    // ── Avec salon spécifique (si dispo) ──
    ...(randomChannel ? [
      { title: '📍 Anime ce salon',       description: `Envoie 15 messages dans <#${randomChannel}>`, kind: 'messages_channel', target: 15, xpReward: 180, type: 'daily', channelId: randomChannel, durationHours: 24 },
      { title: '🌊 Flood ce salon',       description: `Envoie 30 messages dans <#${randomChannel}>`, kind: 'messages_channel', target: 30, xpReward: 300, type: 'event', channelId: randomChannel, durationHours: 8  },
    ] : []),

    // ── Événements courts (4-8h) ──
    { title: '💥 Blitz vocal',            description: 'Passe 15 minutes en vocal dans les 4h',     kind: 'vocal_minutes',     target: 15,  xpReward: 280, type: 'event', durationHours: 4  },
    { title: '🌅 Matinal actif',          description: 'Envoie 20 messages avant midi',              kind: 'messages_total',    target: 20,  xpReward: 200, type: 'event', durationHours: 8  },
  ];

  return templates;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  while (copy.length && result.length < n) {
    result.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return result;
}

// ── Génère l'embed panneau permanent ──────────────────────────────────────
async function buildPanelEmbed(guildId) {
  const quests = await Quest.find({ guildId, active: true }).lean();
  const now = new Date();

  if (!quests.length) {
    return new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('📋 Quêtes actives')
      .setDescription('Aucune quête active pour le moment. Revenez bientôt !')
      .setTimestamp();
  }

  const tagMap = { daily: '📅', urgent: '🚨', event: '⏳', contest: '🏆' };
  const sections = {};

  for (const q of quests) {
    const tag = tagMap[q.type] || '📋';
    const key = q.type;
    if (!sections[key]) sections[key] = [];

    const fin = q.endsAt
      ? `<t:${Math.floor(new Date(q.endsAt).getTime() / 1000)}:R>`
      : 'pas de limite';

    let rewardStr = `🎁 **${q.xpReward} XP**`;
    if (q.bonusReward?.percent) {
      const tier = BONUS_TIERS.find(t => t.percent === q.bonusReward.percent);
      rewardStr += ` + ${tier?.emoji || '⭐'} **${tier?.label || `+${q.bonusReward.percent}%`}** (${q.bonusReward.durationHours}h)`;
    }
    if (q.kakera) rewardStr += ` + 🪙 **${q.kakera} kakera**`;

    sections[key].push(`**${tag} ${q.title}**\n${q.description}\n${rewardStr} · fin ${fin}`);
  }

  const order = ['urgent', 'event', 'daily', 'contest'];
  const lines = [];
  for (const type of order) {
    if (sections[type]?.length) {
      lines.push(sections[type].join('\n\n'));
    }
  }

  return new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('📋 Quêtes & Défis actifs')
    .setDescription(lines.join('\n\n─────────────────\n\n'))
    .setFooter({ text: 'Les bonus XP s\'accumulent jusqu\'à 3 max • Max 3 bonus actifs simultanément' })
    .setTimestamp();
}

// ── Met à jour ou crée le panneau permanent dans le salon quêtes ──────────
async function refreshPanel(guild, cfg) {
  const channelId = cfg?.questsChannelId;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  try {
    const embed = await buildPanelEmbed(guild.id);

    // Cherche un message épinglé du bot pour le mettre à jour
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const botPanel = messages?.find(m => m.author.id === guild.client.user.id && m.embeds[0]?.title?.includes('Quêtes'));

    if (botPanel) {
      await botPanel.edit({ embeds: [embed] }).catch(() => {});
    } else {
      const sent = await channel.send({ embeds: [embed] }).catch(() => null);
      if (sent) await sent.pin().catch(() => {});
    }
  } catch (err) {
    require('../utils/logger').error('Quetes', 'Erreur refresh panel', err);
  }
}

// ── Génération périodique H24 ─────────────────────────────────────────────
// Appelée toutes les 6h par un cron (ex : 0 */6 * * *)
// Génère 1-2 nouvelles quêtes si moins de 4 quêtes actives
async function generatePeriodicQuests(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id });
      if (cfg?.questsEnabled === false) continue;

      // Compte les quêtes actives non-daily (les daily sont gérées séparément)
      const activeCount = await Quest.countDocuments({ guildId: guild.id, active: true });
      if (activeCount >= 5) continue; // Assez de quêtes actives

      const textChannels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText && c.id !== cfg?.questsChannelId)
        .map(c => c.id);

      const templates = buildTemplates(textChannels);
      const toCreate = pickRandom(templates.filter(t => t.type !== 'daily'), 2);

      for (const tpl of toCreate) {
        const bonusPercent = rollBonusTier();
        const durationHours = cfg?.bonusDurationHours || 24;

        await Quest.create({
          guildId: guild.id,
          questId: genId(),
          type: tpl.type,
          title: tpl.title,
          description: tpl.description,
          kind: tpl.kind,
          target: tpl.target,
          channelId: tpl.channelId,
          xpReward: tpl.xpReward,
          bonusReward: { percent: bonusPercent, durationHours },
          startsAt: new Date(),
          endsAt: new Date(Date.now() + tpl.durationHours * 3600 * 1000),
          createdBy: 'bot',
        });
      }

      if (toCreate.length) {
        await refreshPanel(guild, cfg);

        // Ping uniquement sur les quêtes spéciales (urgentes/events/contests) — pas
        // sur les 3 quêtes quotidiennes de routine, pour ne pas user le ping pour rien.
        if (cfg?.defisRoleId && cfg?.questsChannelId) {
          const channel = guild.channels.cache.get(cfg.questsChannelId);
          if (channel) {
            const titles = toCreate.map(t => `**${t.title}**`).join(', ');
            await channel.send({
              content: `<@&${cfg.defisRoleId}> 🔥 Nouveau(x) défi(s) disponible(s) : ${titles} !`,
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      require('../utils/logger').error('Quetes', `Erreur génération périodique (${guild.id})`, err);
    }
  }
}

// ── Génération quotidienne (minuit) ─────────────────────────────────────────
async function generateDailyQuests(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id });
      if (cfg?.questsEnabled === false) continue;

      // Désactive les anciennes quêtes quotidiennes
      await Quest.updateMany({ guildId: guild.id, type: 'daily', active: true }, { active: false });

      const textChannels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText && c.id !== cfg?.questsChannelId)
        .map(c => c.id);

      const templates = buildTemplates(textChannels);
      const dailyTemplates = templates.filter(t => t.type === 'daily');
      const chosen = pickRandom(dailyTemplates, 3);
      const durationHours = cfg?.bonusDurationHours || 24;

      for (const tpl of chosen) {
        const bonusPercent = rollBonusTier();
        await Quest.create({
          guildId: guild.id,
          questId: genId(),
          type: 'daily',
          title: tpl.title,
          description: tpl.description,
          kind: tpl.kind,
          target: tpl.target,
          channelId: tpl.channelId,
          xpReward: tpl.xpReward,
          bonusReward: { percent: bonusPercent, durationHours },
          startsAt: new Date(),
          endsAt: new Date(new Date().setHours(23, 59, 59, 999)),
          createdBy: 'bot',
        });
      }

      await refreshPanel(guild, cfg);
    } catch (err) {
      require('../utils/logger').error('Quetes', `Erreur génération quotidienne (${guild.id})`, err);
    }
  }
}

// ── Récompense un membre ──────────────────────────────────────────────────
async function rewardQuest(quest, userId, guild, cfg) {
  // 1. XP de base
  await User.findOneAndUpdate(
    { userId, guildId: guild.id },
    { $inc: { xp: quest.xpReward, totalXp: quest.xpReward, weekXp: quest.xpReward, dailyXp: quest.xpReward } },
    { upsert: true }
  );

  let bonusGiven = null;
  let overflowXp = 0;

  // 2. Bonus XP temporaire (si la quête en a un)
  if (quest.bonusReward?.percent) {
    const result = await addBonus(userId, guild.id, quest.bonusReward.percent, quest.bonusReward.durationHours || 24);
    if (result.added) {
      bonusGiven = result;
      // Attribue le rôle Discord correspondant
      const roleKey = { 25: cfg?.bonusRole25Id, 50: cfg?.bonusRole50Id, 100: cfg?.bonusRole100Id }[quest.bonusReward.percent];
      if (roleKey) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          member.roles.add(roleKey).catch(() => {});
          // Programmer la suppression du rôle après expiration
          const ms = (quest.bonusReward.durationHours || 24) * 3600 * 1000;
          setTimeout(() => {
            guild.members.fetch(userId).then(m => m.roles.remove(roleKey)).catch(() => {});
          }, ms);
        }
      }
    } else {
      // Déjà 3 bonus → XP de compensation
      overflowXp = result.overflowXp || 0;
      if (overflowXp) {
        await User.findOneAndUpdate(
          { userId, guildId: guild.id },
          { $inc: { xp: overflowXp, totalXp: overflowXp, weekXp: overflowXp, dailyXp: overflowXp } }
        );
      }
    }
  }

  // 3. Kakera Mudae (si la quête en a)
  if (quest.kakera && cfg?.mudaeChannelId) {
    const mudaeCh = guild.channels.cache.get(cfg.mudaeChannelId);
    if (mudaeCh) {
      mudaeCh.send(`$dk <@${userId}> ${quest.kakera}`).catch(() => {});
    }
  }

  // 4. Message d'annonce dans le salon quêtes
  const targetChannelId = cfg?.questsChannelId || quest.channelId;
  const ch = targetChannelId ? guild.channels.cache.get(targetChannelId) : null;
  if (ch) {
    let rewardMsg = `🎉 <@${userId}> a complété **${quest.title}** → **${quest.xpReward} XP**`;
    if (bonusGiven) {
      const tier = { 25: '⭐ +25% XP', 50: '🌟 +50% XP', 100: '💫 +100% XP' }[quest.bonusReward.percent];
      rewardMsg += ` + ${tier} pendant **${quest.bonusReward.durationHours}h** !`;
    } else if (overflowXp) {
      rewardMsg += ` + **${overflowXp} XP bonus** (tu as déjà 3 bonus actifs !)`;
    }
    if (quest.kakera) rewardMsg += ` + 🪙 **${quest.kakera} kakera**`;
    await ch.send({ content: rewardMsg }).catch(() => {});
  }

  // ── Tip éphémère en DM à l'user ──────────────────────────────────────────
  try {
    const { sendTip, TIPS } = require('./tips');
    const member = guild.members.cache.get(userId);
    if (member) {
      await member.user.send(TIPS.questDone(quest.title, quest.xpReward)).catch(() => {});
      // Tip bonus XP si bonus accordé
      if (bonusGiven?.added) {
        await member.user.send(
          TIPS.bonusXpActive(bonusGiven.percent, quest.bonusReward?.durationHours || 24)
        ).catch(() => {});
      }
    }
  } catch { /* DMs fermés */ }

  // 5. Refresh le panneau
  if (cfg) await refreshPanel(guild, cfg);
}

// ── Suivi progression messages ─────────────────────────────────────────────
async function trackMessageProgress(message) {
  if (!message.guild || message.author.bot) return;
  const gid = message.guild.id;

  const activeQuests = await Quest.find({
    guildId: gid,
    active: true,
    kind: { $in: ['messages_channel', 'messages_total', 'first_to_messages'] },
  });
  if (!activeQuests.length) return;

  const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);
  const userId = message.author.id;

  for (const quest of activeQuests) {
    if (quest.kind === 'messages_channel' && quest.channelId !== message.channel.id) continue;
    if (quest.winnerUserId) continue;

    const progressKey = `progress.${userId}`;
    const updated = await Quest.findOneAndUpdate(
      { _id: quest._id, active: true, winnerUserId: { $exists: false } },
      { $inc: { [progressKey]: 1 } },
      { new: true }
    );
    if (!updated) continue;

    const current = updated.progress.get(userId) || 0;
    if (current < updated.target) continue;

    if (updated.kind === 'first_to_messages') {
      const won = await Quest.findOneAndUpdate(
        { _id: quest._id, winnerUserId: { $exists: false } },
        { winnerUserId: userId, active: false },
        { new: true }
      );
      if (won) await rewardQuest(won, userId, message.guild, cfg);
      continue;
    }

    if (!updated.completedBy.includes(userId)) {
      const claimed = await Quest.findOneAndUpdate(
        { _id: quest._id, completedBy: { $ne: userId } },
        { $push: { completedBy: userId } },
        { new: true }
      );
      if (claimed) await rewardQuest(claimed, userId, message.guild, cfg);
    }
  }
}

// ── Suivi bump ─────────────────────────────────────────────────────────────
async function trackBumpProgress(userId, guildId, guild) {
  const cfg = await Config.findOne({ guildId }).lean().catch(() => null);
  const activeQuests = await Quest.find({ guildId, active: true, kind: 'bump' });

  for (const quest of activeQuests) {
    if (quest.winnerUserId) continue;
    const progressKey = `progress.${userId}`;
    const updated = await Quest.findOneAndUpdate(
      { _id: quest._id, active: true },
      { $inc: { [progressKey]: 1 } },
      { new: true }
    );
    if (!updated) continue;
    const current = updated.progress.get(userId) || 0;
    if (current < updated.target) continue;

    if (quest.type === 'urgent') {
      const won = await Quest.findOneAndUpdate(
        { _id: quest._id, winnerUserId: { $exists: false } },
        { winnerUserId: userId, active: false },
        { new: true }
      );
      if (won) await rewardQuest(won, userId, guild, cfg);
    } else if (!updated.completedBy.includes(userId)) {
      const claimed = await Quest.findOneAndUpdate(
        { _id: quest._id, completedBy: { $ne: userId } },
        { $push: { completedBy: userId } },
        { new: true }
      );
      if (claimed) await rewardQuest(claimed, userId, guild, cfg);
    }
  }
}

// ── Suivi vocal ────────────────────────────────────────────────────────────
async function trackVocalProgress(userId, guildId, guild, minutes) {
  const cfg = await Config.findOne({ guildId }).lean().catch(() => null);
  const activeQuests = await Quest.find({ guildId, active: true, kind: 'vocal_minutes' });

  for (const quest of activeQuests) {
    const progressKey = `progress.${userId}`;
    const updated = await Quest.findOneAndUpdate(
      { _id: quest._id, active: true },
      { $inc: { [progressKey]: minutes } },
      { new: true }
    );
    if (!updated) continue;
    const current = updated.progress.get(userId) || 0;
    if (current < updated.target) continue;
    if (!updated.completedBy.includes(userId)) {
      const claimed = await Quest.findOneAndUpdate(
        { _id: quest._id, completedBy: { $ne: userId } },
        { $push: { completedBy: userId } },
        { new: true }
      );
      if (claimed) await rewardQuest(claimed, userId, guild, cfg);
    }
  }
}

// ── Quête concours ─────────────────────────────────────────────────────────
async function createContestQuest(guild, { title, description, channelName, xpReward, bonusPercent, kakera, durationDays, createdBy }) {
  const cfg = await Config.findOne({ guildId: guild.id }).lean().catch(() => null);
  const channel = await guild.channels.create({
    name: channelName || 'defi-du-moment',
    type: ChannelType.GuildText,
    topic: `${title} — poste ton contenu ici, celui qui a le plus de réactions gagne !`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] },
    ],
  });

  const endsAt = new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000);
  const durationHours = cfg?.bonusDurationHours || 24;

  const quest = await Quest.create({
    guildId: guild.id,
    questId: genId(),
    type: 'contest',
    title,
    description: description || `Poste ton contenu dans <#${channel.id}> — le plus de réactions gagne !`,
    kind: 'contest_reactions',
    xpReward: xpReward || 500,
    bonusReward: bonusPercent ? { percent: bonusPercent, durationHours } : undefined,
    kakera: kakera || 0,
    contestChannelId: channel.id,
    startsAt: new Date(),
    endsAt,
    createdBy,
  });

  let rewardStr = `🎁 **${quest.xpReward} XP**`;
  if (bonusPercent) rewardStr += ` + ⭐ **+${bonusPercent}% XP** (${durationHours}h)`;
  if (kakera) rewardStr += ` + 🪙 **${kakera} kakera**`;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.PURPLE)
        .setTitle(`🏆 ${title}`)
        .setDescription(`${quest.description}\n\n${rewardStr}\n⏰ Fin le <t:${Math.floor(endsAt.getTime() / 1000)}:F>`),
    ],
  }).catch(() => {});

  return quest;
}

// ── Résolution quêtes expirées ─────────────────────────────────────────────
async function resolveExpiredQuests(client) {
  const expired = await Quest.find({ active: true, endsAt: { $lte: new Date() } });
  for (const quest of expired) {
    try {
      const guild = client.guilds.cache.get(quest.guildId);
      if (!guild) { quest.active = false; await quest.save(); continue; }
      const cfg = await Config.findOne({ guildId: guild.id }).lean().catch(() => null);

      if (quest.kind === 'contest_reactions' && quest.contestChannelId) {
        const channel = guild.channels.cache.get(quest.contestChannelId);
        if (channel) {
          const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
          let best = null, bestCount = 0;
          if (messages) {
            for (const msg of messages.values()) {
              if (msg.author.bot) continue;
              const total = msg.reactions.cache.reduce((sum, r) => sum + r.count, 0);
              if (total > bestCount) { bestCount = total; best = msg; }
            }
          }
          if (best) {
            quest.winnerUserId = best.author.id;
            await rewardQuest(quest, best.author.id, guild, cfg);
            await channel.send({ content: `🏆 Bravo <@${best.author.id}> ! Ton contenu a gagné avec **${bestCount}** réactions !` }).catch(() => {});
          } else {
            await channel.send({ content: `⏰ Le défi est terminé, mais personne n'a participé... 😢` }).catch(() => {});
          }
        }
      } else if (!quest.winnerUserId && quest.completedBy.length === 0 && quest.type !== 'daily') {
        const targetChannelId = cfg?.questsChannelId;
        const ch = targetChannelId ? guild.channels.cache.get(targetChannelId) : null;
        if (ch) await ch.send({ content: `⏰ La quête **${quest.title}** est terminée — personne ne l'a complétée !` }).catch(() => {});
      }

      quest.active = false;
      await quest.save();
      await refreshPanel(guild, cfg);
    } catch (err) {
      require('../utils/logger').error('Quetes', `Erreur résolution quête ${quest.questId}`, err);
    }
  }
}

module.exports = {
  generateDailyQuests,
  generatePeriodicQuests,
  trackMessageProgress,
  trackBumpProgress,
  trackVocalProgress,
  createContestQuest,
  resolveExpiredQuests,
  rewardQuest,
  refreshPanel,
  nextWeeklyReset,
};
