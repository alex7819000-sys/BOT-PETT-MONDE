// src/systems/guerre/index.js — Guerre Chien vs Chat — salon spam
'use strict';
const { EmbedBuilder } = require('discord.js');
const User    = require('../../db/models/User');
const Config  = require('../../db/models/Config');
const { ANIMAL_APIS } = require('../../config/constants');
const { addXP, checkDailyGameBonus } = require('../xp');
const logger = require('../../utils/logger');

// Cooldown léger pour pas flood l'API image
const WAR_COOLDOWN = new Map(); // userId → timestamp
const WAR_CD_MS    = 1_500; // 1.5s seulement
const XP_PER_POINT = 3;

// Tracker retournement de situation : guildId → { leader: 'dog'|'cat', announced: bool }
const WAR_LEADER = new Map();

// Regex flexibles
const DOG_REGEX = /\b(w+[oua]+[aeiou]*f+|woaf+|waf+|ouaf+|chien|chienne|toutou|doggo|dog|🐶|🐕)\b/i;
const CAT_REGEX = /\b(m+i+a+o+u*|miaou+|miau+|chat|chatte|minou|kitty|cat|🐱|🐈)\b/i;

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

  // Auto-assign : le mot dit = l'équipe rejointe (change à tout moment)
  if (currentTeam !== trigger) {
    const oldRoleId = trigger === 'dog' ? config?.warCatRoleId : config?.warDogRoleId;
    const newRoleId = trigger === 'dog' ? config?.warDogRoleId : config?.warCatRoleId;
    if (!newRoleId) return;
    try {
      if (oldRoleId && member.roles.cache.has(oldRoleId)) await member.roles.remove(oldRoleId);
      await member.roles.add(newRoleId);
      const label = trigger === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat';
      const switched = currentTeam !== null;
      const notif = await message.channel.send(
        switched
          ? `↩️ <@${uid}> a changé de camp → **${label}** !`
          : `✅ <@${uid}> rejoint **${label}** !`
      );
      setTimeout(() => notif.delete().catch(() => {}), 4000);
    } catch (_) {}
  }

  // Équilibrage dynamique : les perdants ont un multiplicateur bonus
  {
    const cfg2   = await Config.findOne({ guildId: gid });
    const dogs   = cfg2?.warDogPoints || 0;
    const cats   = cfg2?.warCatPoints || 0;
    const total  = dogs + cats || 1;
    const dogPct = dogs / total;
    const catPct = cats / total;
    const losingTeam = dogs <= cats ? 'dog' : 'cat';
    const gap = Math.abs(dogPct - catPct);

    let multiplier = 1;
    let underdog   = false;
    if (gap >= 0.40) { multiplier = trigger === losingTeam ? 2   : 1; underdog = gap >= 0.40; }
    else if (gap >= 0.20) { multiplier = trigger === losingTeam ? 1.5 : 1; }

    const pts = Math.ceil(1 * multiplier);
    await Config.updateOne(
      { guildId: gid },
      { $inc: { [trigger === 'dog' ? 'warDogPoints' : 'warCatPoints']: pts } }
    );
    await User.updateOne({ userId: uid, guildId: gid }, { $inc: { teamXp: pts } }, { upsert: true });
    await addXP(uid, gid, XP_PER_POINT * multiplier, null, message.guild);
    const dailyBonus = await checkDailyGameBonus(uid, gid, message.channel.id, message.guild);
    if (dailyBonus) await message.channel.send(`🎯 <@${uid}> **+${dailyBonus} XP bonus** — première action du jour dans Guerre Chien vs Chat ! ⚔️`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000)).catch(()=>{});

    // Notif si écart critique (une fois toutes les 50 contributions)
    if (underdog && Math.random() < 0.04) {
      const behind = losingTeam === 'dog' ? '🐶 Chiens' : '🐱 Chats';
      await message.channel.send(
        `⚠️ **${behind}** sont en difficulté ! Leurs points valent **x2** pour rattraper — à vous de jouer !`
      ).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
    }

    // Détection retournement de situation → ping annonce
    const cfg3      = await Config.findOne({ guildId: gid });
    const newDogs   = cfg3?.warDogPoints || 0;
    const newCats   = cfg3?.warCatPoints || 0;
    const newTotal  = newDogs + newCats || 1;
    const newLeader = newDogs >= newCats ? 'dog' : 'cat';
    const prev      = WAR_LEADER.get(gid) || { leader: newLeader, announced: false };

    // Retournement = le leader a changé depuis la dernière fois
    if (prev.leader !== newLeader && newTotal > 20) {
      WAR_LEADER.set(gid, { leader: newLeader, announced: true });
      const winner  = newLeader === 'dog' ? '🐶 Chiens' : '🐱 Chats';
      const loser   = newLeader === 'dog' ? '🐱 Chats'  : '🐶 Chiens';
      const pingRole = cfg3?.announceRoleId ? `<@&${cfg3.announceRoleId}>` : '@everyone';
      const annCh    = cfg3?.announceChannelId
        ? message.guild.channels.cache.get(cfg3.announceChannelId)
        : null;
      const newDogPct2 = Math.round((newDogs / newTotal) * 100);
      const newCatPct2 = 100 - newDogPct2;
      const bar = (pct, len = 10) => '█'.repeat(Math.round(pct / 100 * len)) + '░'.repeat(len - Math.round(pct / 100 * len));
      const msg2 = [
        `${pingRole}`,
        `🔄 **RETOURNEMENT DE SITUATION !**`,
        `**${winner}** viennent de passer devant **${loser}** !`,
        ``,
        `🐶 \`${bar(newDogPct2)}\` ${newDogPct2}%`,
        `🐱 \`${bar(newCatPct2)}\` ${newCatPct2}%`,
        ``,
        `⚔️ Foncez dans <#${cfg3?.warChatChannelId}> pour renverser la situation !`,
      ].join('\n');
      if (annCh) await annCh.send(msg2);
    } else if (prev.leader === newLeader) {
      WAR_LEADER.set(gid, { leader: newLeader, announced: false });
    }
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
