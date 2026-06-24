// src/handlers/commandHandlers/quetes.js — /quete creer|liste|terminer|supprimer
'use strict';
const { EmbedBuilder } = require('discord.js');
const Quest = require('../../db/models/Quest');
const { COLORS } = require('../../config/constants');
const { createContestQuest, rewardQuest } = require('../../systems/quetes');
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
    const titre = interaction.options.getString('titre');
    const xp = interaction.options.getInteger('xp');
    const type = interaction.options.getString('type'); // messages_channel | messages_total | first_to_messages | contest
    const cible = interaction.options.getInteger('cible') || 1;
    const salon = interaction.options.getChannel('salon');
    const duree = interaction.options.getInteger('duree_jours') || 7;

    if (type === 'contest') {
      const quest = await createContestQuest(interaction.guild, {
        title: titre,
        xpReward: xp,
        durationDays: duree,
        channelName: titre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 80) || 'defi-du-moment',
        createdBy: interaction.user.id,
      });
      return interaction.editReply({ content: `✅ Défi concours créé ! Salon : <#${quest.contestChannelId}>` });
    }

    if (type === 'messages_channel' && !salon) {
      return interaction.editReply({ content: '❌ Choisis un salon pour ce type de quête.' });
    }

    const quest = await Quest.create({
      guildId: gid,
      questId: genId(),
      type: type === 'first_to_messages' ? 'urgent' : 'event',
      title: titre,
      description: type === 'messages_channel'
        ? `Envoie ${cible} messages dans <#${salon.id}>`
        : type === 'first_to_messages'
          ? `Sois le premier à envoyer ${cible} messages dans <#${salon?.id || 'ce salon'}> !`
          : `Envoie ${cible} messages au total`,
      kind: type,
      target: cible,
      channelId: salon?.id,
      xpReward: xp,
      endsAt: new Date(Date.now() + duree * 24 * 60 * 60 * 1000),
      createdBy: interaction.user.id,
    });

    const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);
    if (cfg?.questsChannelId) {
      const ch = interaction.guild.channels.cache.get(cfg.questsChannelId);
      if (ch) {
        await ch.send({
          embeds: [new EmbedBuilder().setColor(COLORS.GOLD).setTitle(`🆕 ${quest.title}`).setDescription(`${quest.description}\n\n🎁 **${xp} XP**`)],
        }).catch(() => {});
      }
    }

    return interaction.editReply({ content: `✅ Quête **${titre}** créée ! (${xp} XP)` });
  }

  // ── /quete liste ──────────────────────────────────────────────────────
  if (sub === 'liste') {
    await interaction.deferReply();
    const quests = await Quest.find({ guildId: gid, active: true }).lean();
    if (!quests.length) return interaction.editReply({ content: '📭 Aucune quête active pour le moment.' });

    const lines = quests.map((q) => {
      const tag = { daily: '📅', urgent: '🚨', event: '⏳', contest: '🏆' }[q.type] || '📋';
      const fin = q.endsAt ? `<t:${Math.floor(new Date(q.endsAt).getTime() / 1000)}:R>` : 'pas de limite';
      return `${tag} **${q.title}** — ${q.description}\n🎁 ${q.xpReward} XP · fin ${fin}`;
    });

    const embed = new EmbedBuilder().setColor(COLORS.GOLD).setTitle('📋 Quêtes actives').setDescription(lines.join('\n\n'));
    return interaction.editReply({ embeds: [embed] });
  }

  // ── /quete terminer (admin, clôture forcée) ────────────────────────────
  if (sub === 'terminer') {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getString('id');
    const quest = await Quest.findOne({ guildId: gid, questId: id });
    if (!quest) return interaction.editReply({ content: '❌ Quête introuvable.' });
    quest.active = false;
    quest.endsAt = new Date();
    await quest.save();
    return interaction.editReply({ content: `✅ Quête **${quest.title}** clôturée manuellement.` });
  }

  // ── /quete recompenser (admin, donner manuellement la récompense à qqn) ─
  if (sub === 'recompenser') {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getString('id');
    const membre = interaction.options.getMember('membre');
    const quest = await Quest.findOne({ guildId: gid, questId: id });
    if (!quest) return interaction.editReply({ content: '❌ Quête introuvable.' });
    const cfg = await Config.findOne({ guildId: gid }).lean().catch(() => null);
    await rewardQuest(quest, membre.id, interaction.guild, cfg);
    return interaction.editReply({ content: `✅ ${membre.displayName} a reçu ${quest.xpReward} XP pour **${quest.title}**.` });
  }
}

module.exports = { handle };
