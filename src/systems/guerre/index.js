// src/systems/guerre/index.js — Guerre Chien vs Chat
'use strict';
const { EmbedBuilder } = require('discord.js');
const axios  = require('axios');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const { COLORS, ANIMAL_APIS } = require('../../config/constants');
const { addXP } = require('../xp');
const logger = require('../../utils/logger');

const WAR_COOLDOWN = new Map();
const WAR_CD_MS    = 3_000;
const XP_PER_POINT = 3; // XP par point de guerre

// Regex flexibles — accepte toutes les variantes longues
const DOG_REGEX = /\bw[aeiouyw]*[oa][aeiouyw]*f*\b|\b(chien|chienne|toutou|doggo|dog)\b/i;
const CAT_REGEX = /\bm+[iy]+[aeiou]*[ou]+[u]*\b|\b(chat|chatte|minou|kitty|cat)\b/i;

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

  let trigger = null;
  if (DOG_REGEX.test(content)) trigger = 'dog';
  else if (CAT_REGEX.test(content)) trigger = 'cat';
  if (!trigger) return;

  // Cooldown 3s
  const last = WAR_COOLDOWN.get(uid);
  if (last && Date.now() - last < WAR_CD_MS) {
    await message.delete().catch(() => {});
    return;
  }
  WAR_COOLDOWN.set(uid, Date.now());

  const member = message.member;
  const team   = getMemberTeam(member, config);

  // Pas d'équipe
  if (!team) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `<@${uid}> Tu n'as pas encore choisi ton équipe ! Va dans **Salons et rôles** → choisis 🐶 ou 🐱`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 8000);
    return;
  }

  // Mauvaise équipe
  if (team !== trigger) {
    await message.delete().catch(() => {});
    const taunt = team === 'dog'
      ? `🐶 <@${uid}> essaie de miaouler... UN CHIEN QUI MIAULE 💀`
      : `🐱 <@${uid}> essaie de woafer... UN CHAT QUI ABOIE 💀`;
    const msg = await message.channel.send(taunt);
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return;
  }

  // Bonne équipe → supprimer message + donner XP + afficher carte + image animal
  await message.delete().catch(() => {});

  await Config.updateOne(
    { guildId: gid },
    { $inc: { [trigger === 'dog' ? 'warDogPoints' : 'warCatPoints']: 1 } }
  );
  await User.updateOne({ userId: uid, guildId: gid }, { $inc: { teamXp: 1 } }, { upsert: true });
  await addXP(uid, gid, XP_PER_POINT);

  const { dogs, cats } = await getWarStats(gid);
  const total   = dogs + cats || 1;
  const dogPct  = Math.round((dogs / total) * 100);
  const catPct  = 100 - dogPct;
  const bar     = (pct, len = 12) => '█'.repeat(Math.round(pct / 100 * len)) + '░'.repeat(len - Math.round(pct / 100 * len));

  const funDog = ['Woaf ! 🐶', 'Bon chien ! 🐾', 'Pat pat ! 👋🐶', 'Les chiens avancent !'];
  const funCat = ['Miaou ! 🐱', 'Chat honoré ! 🐾', 'Les chats dominent ! 😼', 'Purr... 🐱'];
  const fun    = trigger === 'dog'
    ? funDog[Math.floor(Math.random() * funDog.length)]
    : funCat[Math.floor(Math.random() * funCat.length)];

  // Récupérer image animal
  const imgUrl = await fetchAnimalImage(trigger === 'dog' ? 'dog' : 'cat');

  const embed = new EmbedBuilder()
    .setColor(trigger === 'dog' ? 0x8B4513 : 0xFF69B4)
    .setDescription(
      `**${fun}** <@${uid}> marque 1 point pour **${trigger === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat'}** !\n` +
      `⚡ **+${XP_PER_POINT} XP** gagné !\n\n` +
      `🐶 \`${bar(dogPct)}\` ${dogPct}%\n` +
      `🐱 \`${bar(catPct)}\` ${catPct}%`
    );

  if (imgUrl) embed.setThumbnail(imgUrl);

  const msg = await message.channel.send({ embeds: [embed] });
  setTimeout(() => msg.delete().catch(() => {}), 7000);
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
