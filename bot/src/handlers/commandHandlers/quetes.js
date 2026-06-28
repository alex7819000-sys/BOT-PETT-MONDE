// src/handlers/commandHandlers/quetes.js — /quete creer|liste|terminer|supprimer|recompenser|bonus
'use strict';
const { EmbedBuilder } = require('discord.js');
const Quest = require('../../db/models/Quest');
const { COLORS } = require('../../config/constants');
const { createContestQuest, rewardQuest, refreshPanel } = require('../../systems/quetes');
const { getActiveBonuses, BONUS_TIERS, MAX_BONUSES } = require('../../systems/bonusXp');
const Config = require('../../db/models/Config');

function genId() {
  return 'qst_' + Math.random().toString(36).slice(2, 9);
}

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (['creer', 'terminer', 'recompenser'].includes(sub)) {
    const { PermissionFlagsBits } = require('discord.js');
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ Réservé aux modérateurs et admins.', ephemeral: true });
    }
  }

  // ── /quete creer ──────────────────────────────────────────────────────
  if (sub === 'creer') {
    await interaction.deferReply();
    const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);

    const titre = interaction.options.getString('titre');
    const xp = interaction.options.getInteger('xp');
    const type = interaction.options.getString('type');
    const cible = interaction.options.getInteger('cible') || 1;
    const salon = interaction.options.getChannel('salon');
    const duree = interaction.options.getInteger('duree_jours') || 7;
    const bonus = interaction.options.getInteger('bonus') || null; // 25, 50 ou 100
    const kakera = interaction.options.getInteger('kakera') || 0;
    const durationHours = cfg?.bonusDurationHours || 24;

    if (type === 'contest') {
      const quest = await createContestQuest(interaction.guild, {
        title: titre,
        xpReward: xp,
        bonusPercent: bonus,
        kakera,
        durationDays: duree,
        channelName: titre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 80) || 'defi-du-moment',
        createdBy: interaction.user.id,
      });
      return interaction.editReply({ content: `✅ Défi concours créé ! Salon : <#${quest.contestChannelId}>` });
    }

    if (type === 'messages_channel' && !salon) {
      return interaction.editReply({ content: '❌ Choisis un salon pour ce type de quête.' });
    }

    let desc = '';
    if (type === 'messages_channel') desc = `Envoie ${cible} messages dans <#${salon.id}>`;
    else if (type === 'first_to_messages') desc = `Sois le premier à envoyer ${cible} messages !`;
    else if (type === 'bump') desc = 'Bump le serveur';
    else if (type === 'vocal_minutes') desc = `Passe ${cible} minutes en vocal`;
    else desc = `Envoie ${cible} messages au total`;

    const quest = await Quest.create({
      guildId: gid,
      questId: genId(),
      type: type === 'first_to_messages' ? 'urgent' : 'event',
      title: titre,
      description: desc,
      kind: type,
      target: cible,
      channelId: salon?.id,
      xpReward: xp,
      bonusReward: bonus ? { percent: bonus, durationHours } : undefined,
      kakera,
      endsAt: new Date(Date.now() + duree * 24 * 60 * 60 * 1000),
      createdBy: interaction.user.id,
    });

    if (cfg) await refreshPanel(interaction.guild, cfg);

    let confirmMsg = `✅ Quête **${titre}** créée ! (${xp} XP`;
    if (bonus) confirmMsg += ` + ⭐ +${bonus}% XP pendant ${durationHours}h`;
    if (kakera) confirmMsg += ` + 🪙 ${kakera} kakera`;
    confirmMsg += ')';
    return interaction.editReply({ content: confirmMsg });
  }

  // ── /quete liste ──────────────────────────────────────────────────────
  if (sub === 'liste') {
    await interaction.deferReply();
    const quests = await Quest.find({ guildId: gid, active: true }).lean();
    if (!quests.length) return interaction.editReply({ content: '📭 Aucune quête active pour le moment.' });

    const tagMap = { daily: '📅', urgent: '🚨', event: '⏳', contest: '🏆' };
    const lines = quests.map(q => {
      const tag = tagMap[q.type] || '📋';
      const fin = q.endsAt ? `<t:${Math.floor(new Date(q.endsAt).getTime() / 1000)}:R>` : 'sans limite';
      let rewardStr = `🎁 ${q.xpReward} XP`;
      if (q.bonusReward?.percent) {
        const tier = BONUS_TIERS.find(t => t.percent === q.bonusReward.percent);
        rewardStr += ` + ${tier?.emoji || '⭐'} ${tier?.label}`;
      }
      if (q.kakera) rewardStr += ` + 🪙 ${q.kakera} kakera`;
      return `${tag} **${q.title}** — ${q.description}\n${rewardStr} · fin ${fin} · ID: \`${q.questId}\``;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('📋 Quêtes actives')
      .setDescription(lines.join('\n\n'));
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /quete terminer ───────────────────────────────────────────────────
  if (sub === 'terminer') {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getString('id');
    const quest = await Quest.findOne({ guildId: gid, questId: id });
    if (!quest) return interaction.editReply({ content: '❌ Quête introuvable.' });
    quest.active = false;
    quest.endsAt = new Date();
    await quest.save();
    const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);
    if (cfg) await refreshPanel(interaction.guild, cfg);
    return interaction.editReply({ content: `✅ Quête **${quest.title}** clôturée manuellement.` });
  }

  // ── /quete recompenser ────────────────────────────────────────────────
  if (sub === 'recompenser') {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getString('id');
    const membre = interaction.options.getMember('membre');
    const quest = await Quest.findOne({ guildId: gid, questId: id });
    if (!quest) return interaction.editReply({ content: '❌ Quête introuvable.' });
    const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);
    await rewardQuest(quest, membre.id, interaction.guild, cfg);
    return interaction.editReply({ content: `✅ ${membre.displayName} a reçu les récompenses de **${quest.title}**.` });
  }

  // ── /quete bonus (voir les bonus actifs d'un membre) ──────────────────
  if (sub === 'bonus') {
    await interaction.deferReply({ ephemeral: true });
    const membre = interaction.options.getMember('membre') || interaction.member;
    const bonuses = await getActiveBonuses(membre.id, gid);

    if (!bonuses.length) {
      return interaction.editReply({ content: `${membre.displayName} n'a aucun bonus XP actif.` });
    }

    const lines = bonuses.map(b => {
      const tier = BONUS_TIERS.find(t => t.percent === b.percent);
      const exp = `<t:${Math.floor(new Date(b.expiresAt).getTime() / 1000)}:R>`;
      return `${tier?.emoji || '⭐'} **${tier?.label || `+${b.percent}%`}** — expire ${exp}`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`🎁 Bonus XP de ${membre.displayName}`)
      .setDescription(`${lines.join('\n')}\n\n*${bonuses.length}/${MAX_BONUSES} slots utilisés*`);
    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handle };
