// src/systems/guerre/index.js — Guerre Chien vs Chat — salon spam
'use strict';
const { EmbedBuilder } = require('discord.js');
const User    = require('../../db/models/User');
const Config  = require('../../db/models/Config');
const { ANIMAL_APIS } = require('../../config/constants');
const { addXP } = require('../xp');
const logger = require('../../utils/logger');

// Cooldown léger pour pas flood l'API image
const WAR_COOLDOWN = new Map(); // userId → timestamp
const WAR_CD_MS    = 1_500; // 1.5s seulement
const XP_PER_POINT = 3;

// Regex flexibles
const DOG_REGEX = /\bw+[oua]+[aeiou]*f+\b|\b(chien|chienne|toutou|doggo|dog)\b/i;
const CAT_REGEX = /\bm+i+[aeiou]*[ao]+u*\b|\b(chat|chatte|minou|kitty|cat)\b/i;

function getMemberTeam(member, config) {
  if (config?.warDogRoleId && member.roles.cache.has(config.warDogRoleId)) return 'dog';
  if (config?.warCatRoleId && member.roles.cache.has(config.warCatRoleId)) return 'cat';
  return null;
}

async function fetchAnimalImage(type) {
  try {
    const result = await (ANIMAL_APIS[type] || ANIMAL_APIS.dog)();
    return result.image;
  } catch (_) { return null; }
}

async function handleWarTrigger(message) {
  const content = message.content.toLowerCase();
  const uid     = message.author.id;
  const gid     = message.guild.id;

  const config = await Config.findOne({ guildId: gid });
  if (!config?.warChatChannelId || message.channel.id !== config.warChatChannelId) return;

  const isDog = DOG_REGEX.test(content);
  const isCat = CAT_REGEX.test(content);

  // Pas un trigger → on laisse passer, rien supprimé
  if (!isDog && !isCat) return;

  const trigger = isDog ? 'dog' : 'cat';

  // Cooldown léger pour pas flood l'API
  const last = WAR_COOLDOWN.get(uid);
  if (last && Date.now() - last < WAR_CD_MS) return;
  WAR_COOLDOWN.set(uid, Date.now());

  const member      = message.member;
  const currentTeam = getMemberTeam(member, config);

  // Pas d'équipe → petit guide, on laisse le message
  if (!currentTeam) {
    const warn = await message.channel.send({
      content: `<@${uid}> Tu n'as pas encore d'équipe ! Va dans **Salons et rôles** → choisis 🐶 ou 🐱`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 6000);
    return;
  }

  // Bonne équipe OU mauvaise équipe → on répond quand même avec l'image du trigger
  // (le chaos est voulu — chacun spam son animal)

  // XP seulement si bonne équipe
  if (currentTeam === trigger) {
    await Config.updateOne(
      { guildId: gid },
      { $inc: { [trigger === 'dog' ? 'warDogPoints' : 'warCatPoints']: 1 } }
    );
    await User.updateOne({ userId: uid, guildId: gid }, { $inc: { teamXp: 1 } }, { upsert: true });
    await addXP(uid, gid, XP_PER_POINT);
  }

  // Récupérer image + stats
  const imgUrl = await fetchAnimalImage(trigger);
  const { dogs, cats } = await getWarStats(gid);
  const total  = dogs + cats || 1;
  const dogPct = Math.round((dogs / total) * 100);
  const catPct = 100 - dogPct;
  const bar    = (pct, len = 10) => '█'.repeat(Math.round(pct / 100 * len)) + '░'.repeat(len - Math.round(pct / 100 * len));

  const embed = new EmbedBuilder()
    .setColor(trigger === 'dog' ? 0x8B4513 : 0xFF69B4)
    .setDescription(
      `🐶 \`${bar(dogPct)}\` ${dogPct}%\n` +
      `🐱 \`${bar(catPct)}\` ${catPct}%`
    );

  if (imgUrl) embed.setImage(imgUrl); // grande image au lieu de thumbnail

  await message.reply({ embeds: [embed] });
}

async function joinTeam(interaction, team) {
  const config = await Config.findOne({ guildId: interaction.guild.id });
  const roleId = team === 'dog' ? config?.warDogRoleId : config?.warCatRoleId;
  if (!roleId) {
    return interaction.reply({ content: '❌ Rôles non configurés. Fais `/setup guerre`.', ephemeral: true });
  }
  return interaction.reply({
    content: `Pour rejoindre **${team === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat'}** → va dans **Salons et rôles** !`,
    ephemeral: true,
  });
}

async function getWarStats(guildId) {
  const config = await Config.findOne({ guildId });
  const dogs   = config?.warDogPoints || 0;
  const cats   = config?.warCatPoints || 0;
  const total  = dogs + cats || 1;
  return { dogs, cats, dogPct: Math.round((dogs / total) * 100), catPct: Math.round((cats / total) * 100) };
}

async function runWarCeremony(client, guildId) {
  const config    = await Config.findOne({ guildId });
  const channelId = config?.warChannelId || config?.announceChannelId;
  if (!channelId) return;
  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  const { dogs, cats, dogPct, catPct } = await getWarStats(guildId);
  const winner   = dogs >= cats ? 'dog' : 'cat';
  const winLabel = winner === 'dog' ? '🐶 CHIENS' : '🐱 CHATS';
  const bar = pct => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

  const embed = new EmbedBuilder()
    .setColor(winner === 'dog' ? 0x8B4513 : 0xFF69B4)
    .setTitle(`⚔️ Résultat de la Guerre — ${winLabel} GAGNENT !`)
    .addFields(
      { name: '🐶 Chiens', value: `\`${bar(dogPct)}\` ${dogs} pts (${dogPct}%)`, inline: false },
      { name: '🐱 Chats',  value: `\`${bar(catPct)}\` ${cats} pts (${catPct}%)`, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'La guerre repart lundi !' });

  await channel.send({ content: '@everyone ⚔️ Résultats de la guerre !', embeds: [embed] });
  await Config.updateOne({ guildId }, { warDogPoints: 0, warCatPoints: 0 });
  logger.info('Guerre', `Vainqueur : ${winLabel}`);
}

module.exports = { handleWarTrigger, joinTeam, getWarStats, runWarCeremony };
