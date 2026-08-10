// bot/src/systems/levelUp.js — Level up : embed riche + bouton info + DM
'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { COLORS } = require('../config/constants');

// ── Messages de félicitations ──────────────────────────────────────────────────
const CONGRATULATIONS = [
  (name, lvl) => `💫 ${name} vient de passer **niveau ${lvl}** — bientôt une vraie star !`,
  (name, lvl) => `👑 ${name} >> **Niveau ${lvl}** atteint ! T'es sur la bonne voie !`,
  (name, lvl) => `🔥 Respect ${name} ! **Niveau ${lvl}**, tu domines !`,
  (name, lvl) => `⚡ ${name} monte ! **Niveau ${lvl}** — continue comme ça !`,
  (name, lvl) => `✨ ${name} a grind et ça se voit — **niveau ${lvl}** !`,
  (name, lvl) => `💪 ${name} vient de franchir le **niveau ${lvl}** — un vrai roi en devenir !`,
];

// ── Barre de progression (16 blocs) ───────────────────────────────────────────
function progressBar(current, needed, size = 16) {
  const fill = Math.min(Math.floor((current / needed) * size), size);
  return '█'.repeat(fill) + '░'.repeat(size - fill);
}

// ── Handler principal ──────────────────────────────────────────────────────────
async function handleLevelUp(message, newLevel, user) {
  try {
    const Config = require('../db/models/Config');
    const User   = require('../db/models/User');

    const cfg = await Config.findOne({ guildId: message.guild.id }).lean().catch(() => null);
    const levelUpChannelId = cfg?.levelUpChannelId || cfg?.rankChannelId;
    const ch = levelUpChannelId
      ? message.guild.channels.cache.get(levelUpChannelId)
      : message.channel;
    if (!ch) return;

    // ── Stats fraîches ──────────────────────────────────────────────────────
    const totalXp  = user.totalXp || 0;
    const weekXp   = user.weekXp  || 0;

    // XP pour passer au niveau suivant (formule : lvl * lvl * 100)
    const xpForNext    = (newLevel + 1) * (newLevel + 1) * 100;
    const xpForCurrent = newLevel * newLevel * 100;
    const xpInLevel    = Math.max(0, user.xp || 0);   // user.xp = XP dans le niveau actuel
    const xpNeeded     = Math.max(1, xpForNext - xpForCurrent);
    const bar          = progressBar(xpInLevel, xpNeeded);

    // Rang global
    const rank = await User.countDocuments({ guildId: message.guild.id, totalXp: { $gt: totalXp } }) + 1;

    // ── Rôle principal débloqué ────────────────────────────────────────────
    // On affiche le palier le plus haut franchi depuis le dernier niveau connu,
    // pas seulement une égalité stricte — ça capture aussi les sauts de niveau
    // (ex: niveau 9 → 12 avec un palier à 10 configuré).
    let roleDebloque = null;
    if (cfg?.levelRoles?.length) {
      const oldLevel = user.level || 0;
      const sorted   = [...cfg.levelRoles].sort((a, b) => b.level - a.level);
      const matched  = sorted.find(lr => lr.level > oldLevel && lr.level <= newLevel);
      if (matched) roleDebloque = matched;
    }

    // ── Rôle hebdo actuel ──────────────────────────────────────────────────
    let roleHebdo = null;
    if (cfg?.weeklyLevelRoles?.length) {
      const sorted  = [...cfg.weeklyLevelRoles].sort((a, b) => b.level - a.level);
      const matched = sorted.find(lr => lr.level <= weekXp);
      if (matched) roleHebdo = matched;
    }

    // ── Message de félicitations ───────────────────────────────────────────
    const congrats = CONGRATULATIONS[Math.floor(Math.random() * CONGRATULATIONS.length)](
      `<@${message.author.id}>`, newLevel
    );

    // ── Champ rôles ────────────────────────────────────────────────────────
    const rolesLines = [];
    if (roleDebloque) rolesLines.push(`🎖️ Rôle principal débloqué → <@&${roleDebloque.roleId}>`);
    if (roleHebdo)    rolesLines.push(`📅 Rôle hebdo actuel → <@&${roleHebdo.roleId}>`);

    // ── Embed principal ─────────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setAuthor({
        name: message.member.displayName,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('🏆 LEVEL UP !')
      .setDescription(congrats)
      .addFields(
        { name: '📊 Niveau',       value: `**${newLevel}**`,                                inline: true },
        { name: '🏆 Classement',   value: `**#${rank}**`,                                  inline: true },
        { name: '\u200b',          value: '\u200b',                                         inline: true },
        { name: '⭐ XP Total',     value: `**${totalXp.toLocaleString('fr-FR')} XP**`,     inline: true },
        { name: '📅 XP Semaine',   value: `**${weekXp.toLocaleString('fr-FR')} XP**`,      inline: true },
        { name: '\u200b',          value: '\u200b',                                         inline: true },
        {
          name: `Progression vers Niv. ${newLevel + 1} (${xpInLevel.toLocaleString('fr-FR')}/${xpNeeded.toLocaleString('fr-FR')} XP)`,
          value: `\`${bar}\``,
        },
      )
      .setFooter({ text: `💡 Clique sur le bouton pour comprendre le système XP` })
      .setTimestamp();

    if (rolesLines.length) {
      embed.addFields({ name: '🎁 Tes rôles', value: rolesLines.join('\n') });
    }

    // ── Bouton info ────────────────────────────────────────────────────────
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`levelup:info:${message.author.id}`)
        .setLabel('ℹ️ Comprendre le système XP')
        .setStyle(ButtonStyle.Secondary),
    );

    await ch.send({
      content: `<@${message.author.id}>`,
      embeds: [embed],
      components: [row],
      allowedMentions: { users: [message.author.id] },
    }).catch(() => {});

    // ── Tip éphémère en DM ──────────────────────────────────────────────────
    const { sendTip, TIPS } = require('./tips');
    await sendTip(message, TIPS.levelUp(newLevel, totalXp, rank));

    // ── Tip rôle débloqué (si nouveau palier exact) ──────────────────────────
    if (roleDebloque) {
      const roleObj = message.guild.roles.cache.get(roleDebloque.roleId);
      if (roleObj) await sendTip(message, TIPS.roleUnlocked(roleObj.name, roleDebloque.level));
    }

  } catch (err) {
    console.error('Erreur handleLevelUp:', err);
  }
}

// ── Handler du bouton "Comprendre le système" — appelé depuis buttons.js ──────
async function handleLevelInfoButton(interaction) {
  const Config = require('../db/models/Config');

  const guildId = interaction.guild?.id || interaction.guildId;
  const cfg = guildId
    ? await Config.findOne({ guildId }).lean().catch(() => null)
    : null;

  // ── Exemples de paliers depuis la config ────────────────────────────────
  let principalLines = '> Aucun palier configuré.';
  let hebdoLines     = '> Aucun palier configuré.';

  if (cfg?.levelRoles?.length) {
    principalLines = [...cfg.levelRoles]
      .sort((a, b) => a.level - b.level)
      .map(lr => `> **Niv. ${lr.level}** → <@&${lr.roleId}>`)
      .join('\n');
  }
  if (cfg?.weeklyLevelRoles?.length) {
    hebdoLines = [...cfg.weeklyLevelRoles]
      .sort((a, b) => a.level - b.level)
      .map(lr => `> **${lr.level.toLocaleString('fr-FR')} XP/sem** → <@&${lr.roleId}>`)
      .join('\n');
  }

  const dmEmbed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle('📖 Le système XP — comment ça marche ?')
    .setDescription(
      `Bienvenue dans le système de niveaux du serveur ! Voici tout ce qu'il faut savoir 👇`
    )
    .addFields(
      {
        name: '⭐ Comment gagner de l\'XP ?',
        value: [
          '> 💬 Envoyer des messages dans les salons',
          '> 🎙️ Passer du temps en vocal',
          '> 🚀 Bumper le serveur',
          '> 📨 Inviter des membres',
          '> ⭐ Réagir aux messages',
          '> ✅ Compléter tes missions quotidiennes',
        ].join('\n'),
      },
      {
        name: '🎖️ Rôles principaux *(permanent)*',
        value:
          `Ces rôles sont basés sur ton **niveau total** — ils ne disparaissent jamais.\n` +
          `Quand tu passes au palier suivant, l'ancien rôle est remplacé par le nouveau.\n\n` +
          principalLines,
      },
      {
        name: '📅 Rôles hebdomadaires *(reset dimanche)*',
        value:
          `Ces rôles sont basés sur ton **XP de la semaine** — ils se remettent à zéro chaque dimanche à minuit.\n` +
          `Plus tu es actif dans la semaine, plus ton rôle hebdo est élevé.\n\n` +
          hebdoLines,
      },
      {
        name: '📊 Commandes utiles',
        value: [
          '> `/niveau` — voir ton niveau, tes rôles et ta progression',
          '> `/top` — classement du serveur',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Bonne chance ! 👑' });

  // ── Envoi en DM ────────────────────────────────────────────────────────
  try {
    await interaction.user.send({ embeds: [dmEmbed] });
    await interaction.reply({
      content: '📬 Je t\'ai envoyé les infos en DM !',
      ephemeral: true,
    });
  } catch {
    // DM bloqués → réponse éphémère directement
    await interaction.reply({
      content: '❌ Tes DMs sont fermés, voici les infos ici :',
      embeds: [dmEmbed],
      ephemeral: true,
    });
  }
}

module.exports = { handleLevelUp, handleLevelInfoButton };
