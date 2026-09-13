'use strict';
// systems/relance.js — Renvoi du DM de bienvenue aux membres inactifs

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../db/models/Config');
const User   = require('../db/models/User');
const logger = require('../utils/logger');

// Couleurs disponibles (les mêmes que dans le système présentation)
const COLORS = [
  { name: 'Rouge',    hex: 0xE74C3C },
  { name: 'Orange',   hex: 0xE67E22 },
  { name: 'Jaune',    hex: 0xF1C40F },
  { name: 'Vert',     hex: 0x2ECC71 },
  { name: 'Cyan',     hex: 0x1ABC9C },
  { name: 'Bleu',     hex: 0x3498DB },
  { name: 'Violet',   hex: 0x9B59B6 },
  { name: 'Rose',     hex: 0xFF73FA },
  { name: 'Blanc',    hex: 0xFFFFFF },
  { name: 'Noir',     hex: 0x2C2F33 },
];

/**
 * Construit et envoie le DM de bienvenue à un membre.
 * @param {GuildMember} member
 * @param {string} color  Nom de couleur (optionnel)
 * @param {Object} config  Config MongoDB du serveur
 */
async function sendRelanceDM(member, color, config) {
  const hex = COLORS.find(c => c.name.toLowerCase() === (color || '').toLowerCase())?.hex ?? 0xFFD700;

  const roleName = config?.confirmedRoleId
    ? `<@&${config.confirmedRoleId}>`
    : '**Membre Confirmé ✅**';

  const embed = new EmbedBuilder()
    .setColor(hex)
    .setTitle(`✨ Bienvenue sur ${member.guild.name} !`)
    .setThumbnail(member.guild.iconURL({ dynamic: true }))
    .setDescription(
      `Hey <@${member.id}> ! 👋\n\n` +
      `On est contents de t'avoir parmi nous ! Tu n'as pas encore eu le temps de te présenter — c'est l'occasion !\n\n` +
      `**Par où commencer ?**\n` +
      `📋 Lis les règles\n` +
      `🗂️ Présente-toi dans le forum\n` +
      `💬 Rejoins les discussions !\n\n` +
      `> 🎖️ En te présentant tu obtiens le rôle ${roleName} !`
    )
    .setFooter({ text: 'Clique sur le bouton ci-dessous pour commencer ta présentation !' });

  const guildId = member.guild.id;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:open_modal:1:${guildId}`)
      .setLabel('📋 Me présenter maintenant')
      .setStyle(ButtonStyle.Primary),
  );
  const rowInfo = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('info:serv')
      .setLabel('❓ Comment ça marche ?')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('info:xp')
      .setLabel('⭐ Le système XP ?')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('info:regles')
      .setLabel('📜 Les règles ?')
      .setStyle(ButtonStyle.Secondary),
  );
  const rowColor = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`info:couleur:${guildId}`)
      .setLabel('🎨 Choisir ma couleur de pseudo')
      .setStyle(ButtonStyle.Success),
  );

  await member.send({ embeds: [embed], components: [row, rowInfo, rowColor] });
}

/**
 * Envoie le DM de relance à tous les membres inactifs (pas de totalXp ou dernière activité > X jours)
 * ou à un membre précis si userId est fourni.
 */
async function relanceMembers(guild, { userId = null, couleur = null, joursInactif = 7 } = {}) {
  const config = await Config.findOne({ guildId: guild.id });
  const results = { envoyes: 0, echecs: 0, ignores: 0 };

  let members = [];

  if (userId) {
    // Un seul membre ciblé
    const m = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (m) members = [m];
  } else {
    // Tous les membres humains
    await guild.members.fetch();
    members = [...guild.members.cache.values()].filter(m => !m.user.bot);
  }

  const cutoff = new Date(Date.now() - joursInactif * 24 * 60 * 60 * 1000);

  for (const member of members) {
    try {
      // Si pas de cible spécifique : filtre les membres inactifs
      if (!userId) {
        const userData = await User.findOne({ userId: member.id, guildId: guild.id }).lean();
        const lastMsg = userData?.lastMessageAt;
        const hasActivity = lastMsg && lastMsg > cutoff;
        if (hasActivity) { results.ignores++; continue; }
      }

      await sendRelanceDM(member, couleur, config);
      results.envoyes++;

      // Petite pause pour éviter le rate-limit Discord
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.echecs++;
      logger.debug('Relance', `DM impossible pour ${member.user.tag}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Envoie le DM à TOUS les membres humains du serveur, sans aucun filtre.
 */
async function relanceTous(guild, { couleur = null } = {}) {
  const config = await Config.findOne({ guildId: guild.id });
  const results = { envoyes: 0, echecs: 0 };

  await guild.members.fetch();
  const members = [...guild.members.cache.values()].filter(m => !m.user.bot);

  for (const member of members) {
    try {
      await sendRelanceDM(member, couleur, config);
      results.envoyes++;
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.echecs++;
      logger.debug('Relance', `DM impossible pour ${member.user.tag}`);
    }
  }

  return results;
}

module.exports = { relanceMembers, relanceTous, COLORS };
