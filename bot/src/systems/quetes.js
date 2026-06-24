// src/systems/quetes.js — Quêtes à XP : quotidiennes (auto), manuelles (admin/modo),
// urgentes (premier à X), événementielles (concours à réactions type "vidéo la plus drôle")
'use strict';
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const Quest = require('../db/models/Quest');
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const { COLORS } = require('../config/constants');

function genId() {
  return 'qst_' + Math.random().toString(36).slice(2, 9);
}

// Prochain dimanche 00h00 (= prochain reset hebdo d'XP) — utilisé comme échéance par défaut des quêtes "event"
function nextWeeklyReset() {
  const now = new Date();
  const d = new Date(now);
  const daysUntilSunday = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Pool de modèles de quêtes quotidiennes (3 sont tirées au hasard chaque jour) ──
function buildDailyTemplates(randomTextChannelId) {
  return [
    { title: '💬 Bavard du jour', description: 'Envoie 30 messages aujourd\'hui', kind: 'messages_total', target: 30, xpReward: 150 },
    { title: '🚀 Bumpeur dévoué', description: 'Bump le serveur une fois aujourd\'hui', kind: 'bump', target: 1, xpReward: 300 },
    { title: '🎙️ Pilier du vocal', description: 'Passe 30 minutes en vocal aujourd\'hui', kind: 'vocal_minutes', target: 30, xpReward: 200 },
    randomTextChannelId
      ? { title: '📍 Anime ce salon', description: `Envoie 15 messages dans <#${randomTextChannelId}> aujourd'hui`, kind: 'messages_channel', target: 15, xpReward: 180, channelId: randomTextChannelId }
      : null,
  ].filter(Boolean);
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  while (copy.length && result.length < n) {
    result.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return result;
}

// ── Génération quotidienne (appelée par un cron, une fois par jour) ────────
async function generateDailyQuests(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const cfg = await Config.findOne({ guildId: guild.id });
      if (cfg?.questsEnabled === false) continue;

      // Désactive les anciennes quêtes quotidiennes
      await Quest.updateMany({ guildId: guild.id, type: 'daily', active: true }, { active: false });

      const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
      const randomChannelId = textChannels.size ? textChannels.random()?.id : null;
      const templates = buildDailyTemplates(randomChannelId);
      const chosen = pickRandom(templates, 3);

      const created = [];
      for (const tpl of chosen) {
        const quest = await Quest.create({
          guildId: guild.id,
          questId: genId(),
          type: 'daily',
          ...tpl,
          startsAt: new Date(),
          endsAt: new Date(new Date().setHours(23, 59, 59, 999)),
          createdBy: 'bot',
        });
        created.push(quest);
      }

      if (cfg?.questsChannelId && created.length) {
        const ch = guild.channels.cache.get(cfg.questsChannelId);
        if (ch) {
          const embed = new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setTitle('📋 Nouvelles quêtes du jour !')
            .setDescription(created.map((q) => `**${q.title}** — ${q.description} → 🎁 **${q.xpReward} XP**`).join('\n\n'));
          await ch.send({ embeds: [embed] }).catch(() => {});
        }
      }
    } catch (err) {
      require('../utils/logger').error('Quetes', `Erreur génération quotidienne (${guild.id})`, err);
    }
  }
}

// ── Récompense + annonce ────────────────────────────────────────────────────
async function rewardQuest(quest, userId, guild, cfg) {
  await User.findOneAndUpdate(
    { userId, guildId: guild.id },
    { $inc: { xp: quest.xpReward, totalXp: quest.xpReward, weekXp: quest.xpReward, dailyXp: quest.xpReward } },
    { upsert: true }
  );

  const targetChannelId = cfg?.questsChannelId || quest.channelId;
  const ch = targetChannelId ? guild.channels.cache.get(targetChannelId) : null;
  if (ch) {
    await ch.send({ content: `🎉 <@${userId}> a complété la quête **${quest.title}** et gagne **${quest.xpReward} XP** !` }).catch(() => {});
  }
}

// ── Suivi de progression sur les messages (messages_channel / messages_total / first_to_messages) ──
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
    if (quest.winnerUserId) continue; // déjà remportée (course)

    // Incrément atomique en base — évite la race condition si plusieurs messages
    // arrivent en même temps (deux save() concurrents écraseraient sinon la progression).
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
      // Verrou atomique : seul le premier findOneAndUpdate qui matche encore winnerUserId
      // inexistant remporte la course — élimine aussi la race condition sur le gagnant.
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

// ── Quête "contest" (concours à réactions) ──────────────────────────────────
async function createContestQuest(guild, { title, description, channelName, xpReward, durationDays, createdBy }) {
  const channel = await guild.channels.create({
    name: channelName || 'defi-du-moment',
    type: ChannelType.GuildText,
    topic: `${title} — poste ton contenu ici, celui qui a le plus de réactions gagne ${xpReward} XP !`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] },
    ],
  });

  const endsAt = new Date(Date.now() + (durationDays || 7) * 24 * 60 * 60 * 1000);

  const quest = await Quest.create({
    guildId: guild.id,
    questId: genId(),
    type: 'contest',
    title,
    description: description || `Poste ton contenu dans <#${channel.id}> — le plus de réactions gagne !`,
    kind: 'contest_reactions',
    xpReward: xpReward || 500,
    contestChannelId: channel.id,
    startsAt: new Date(),
    endsAt,
    createdBy,
  });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.PURPLE)
        .setTitle(`🏆 ${title}`)
        .setDescription(`${quest.description}\n\n🎁 **${quest.xpReward} XP** pour le gagnant\n⏰ Fin le <t:${Math.floor(endsAt.getTime() / 1000)}:F>`),
    ],
  }).catch(() => {});

  return quest;
}

// ── Résolution des quêtes expirées (cron périodique) ───────────────────────
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
            await channel.send({ content: `🏆 Bravo <@${best.author.id}> ! Ton contenu a gagné avec **${bestCount}** réactions — **${quest.xpReward} XP** offerts !` }).catch(() => {});
          } else if (channel) {
            await channel.send({ content: `⏰ Le défi est terminé, mais personne n'a participé... 😢` }).catch(() => {});
          }
        }
      } else if (!quest.winnerUserId && quest.completedBy.length === 0 && quest.type !== 'daily') {
        const targetChannelId = cfg?.questsChannelId;
        const ch = targetChannelId ? guild.channels.cache.get(targetChannelId) : null;
        if (ch) await ch.send({ content: `⏰ La quête **${quest.title}** est terminée — personne ne l'a complétée cette fois !` }).catch(() => {});
      }

      quest.active = false;
      await quest.save();
    } catch (err) {
      require('../utils/logger').error('Quetes', `Erreur résolution quête ${quest.questId}`, err);
    }
  }
}

module.exports = {
  generateDailyQuests,
  trackMessageProgress,
  createContestQuest,
  resolveExpiredQuests,
  rewardQuest,
  nextWeeklyReset,
};
