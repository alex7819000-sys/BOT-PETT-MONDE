// src/systems/guerre/index.js — Guerre Chien vs Chat — v5
'use strict';
const { EmbedBuilder } = require('discord.js');
const axios   = require('axios');
const User    = require('../../db/models/User');
const Config  = require('../../db/models/Config');
const { COLORS, ANIMAL_APIS } = require('../../config/constants');
const { addXP } = require('../xp');
const logger = require('../../utils/logger');

const WAR_COOLDOWN = new Map(); // userId → timestamp
const WAR_CD_MS    = 3_000;
const XP_PER_POINT = 3;

// Regex flexibles — woooooaaf, wouf, woof, woaf, miaaaaou, miaou, miiaou, etc.
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

  // Pas un trigger → supprimer le message (salon = woaf/miaou only)
  if (!isDog && !isCat) {
    await message.delete().catch(() => {});
    return;
  }

  const trigger = isDog ? 'dog' : 'cat';

  // Cooldown 3s
  const last = WAR_COOLDOWN.get(uid);
  if (last && Date.now() - last < WAR_CD_MS) {
    await message.delete().catch(() => {});
    return;
  }
  WAR_COOLDOWN.set(uid, Date.now());

  const member    = message.member;
  const currentTeam = getMemberTeam(member, config);

  // ── Pas d'équipe → guide + supprimer ────────────────────────────────
  if (!currentTeam) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `<@${uid}> Tu n'as pas encore choisi ton équipe ! Va dans **Salons et rôles** → choisis 🐶 ou 🐱`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 8000);
    return;
  }

  // ── Mauvaise équipe → proposer de changer ────────────────────────────
  if (currentTeam !== trigger) {
    await message.delete().catch(() => {});

    // Compter les triggers "mauvaise équipe" pour cet user
    const key = `switch:${uid}`;
    const switchCount = (WAR_COOLDOWN.get(key) || 0) + 1;
    WAR_COOLDOWN.set(key, switchCount);

    if (switchCount >= 3) {
      // Après 3 fois → proposer vraiment de changer d'équipe
      WAR_COOLDOWN.delete(key);
      const targetRoleId = trigger === 'dog' ? config.warDogRoleId : config.warCatRoleId;
      const oldRoleId    = trigger === 'dog' ? config.warCatRoleId : config.warDogRoleId;

      try {
        if (oldRoleId)    await member.roles.remove(oldRoleId).catch(() => {});
        if (targetRoleId) await member.roles.add(targetRoleId).catch(() => {});
      } catch (_) {}

      const msg = await message.channel.send(
        `🔄 <@${uid}> a changé d'équipe ! Bienvenue chez **${trigger === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat'}** !`
      );
      setTimeout(() => msg.delete().catch(() => {}), 6000);
    } else {
      const taunt = currentTeam === 'dog'
        ? `🐶 <@${uid}> essaie de miaouler... (${switchCount}/3 — change d'équipe à 3)`
        : `🐱 <@${uid}> essaie de woafer... (${switchCount}/3 — change d'équipe à 3)`;
      const msg = await message.channel.send(taunt);
      setTimeout(() => msg.delete().catch(() => {}), 5000);
    }
    return;
  }

  // ── Bonne équipe → supprimer + XP + carte ───────────────────────────
  await message.delete().catch(() => {});

  await Config.updateOne(
    { guildId: gid },
    { $inc: { [trigger === 'dog' ? 'warDogPoints' : 'warCatPoints']: 1 } }
  );
  await User.updateOne({ userId: uid, guildId: gid }, { $inc: { teamXp: 1 } }, { upsert: true });
  await addXP(uid, gid, XP_PER_POINT);

  const { dogs, cats } = await getWarStats(gid);
  const total  = dogs + cats || 1;
  const dogPct = Math.round((dogs / total) * 100);
  const catPct = 100 - dogPct;
  const bar    = (pct, len = 12) => '█'.repeat(Math.round(pct / 100 * len)) + '░'.repeat(len - Math.round(pct / 100 * len));

  const funDog = ['Woaf ! 🐶', 'Bon chien ! 🐾', 'Pat pat ! 👋🐶', 'Les chiens avancent !'];
  const funCat = ['Miaou ! 🐱', 'Chat honoré ! 🐾', 'Les chats dominent ! 😼', 'Purr... 🐱'];
  const fun    = trigger === 'dog'
    ? funDog[Math.floor(Math.random() * funDog.length)]
    : funCat[Math.floor(Math.random() * funCat.length)];

  const imgUrl = await fetchAnimalImage(trigger);

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
