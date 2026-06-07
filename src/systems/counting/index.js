// src/systems/counting/index.js — Counting (Infinis) — v5 (singe aléatoire max 12h)
'use strict';
const { EmbedBuilder } = require('discord.js');
const Config = require('../../db/models/Config');
const { addXP, checkDailyGameBonus } = require('../xp');
const logger = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

const XP_RULES = {
  multiple100: { xp: 100, emoji: '💯', color: COLORS.GOLD,   autodelete: 0    },
  multiple10:  { xp: 30,  emoji: '🔟', color: COLORS.GOLD,   autodelete: 6000 },
  multiple5:   { xp: 15,  emoji: '5️⃣', color: COLORS.ORANGE, autodelete: 5000 },
  normal:      { xp: 5,   emoji: '✅', color: null,           autodelete: 3000 },
};

function getRule(n) {
  if (n % 100 === 0) return XP_RULES.multiple100;
  if (n % 10  === 0) return XP_RULES.multiple10;
  if (n % 5   === 0) return XP_RULES.multiple5;
  return XP_RULES.normal;
}

// Durée aléatoire : entre le minimum configuré et max 12h
function getRandomTimeout(configMin) {
  const minMs  = (configMin || 5) * 60 * 1000;
  const maxMs  = 12 * 60 * 60 * 1000; // 12h
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

async function handleCounting(message) {
  const gid = message.guild.id;
  const uid = message.author.id;

  const config = await Config.findOne({ guildId: gid });
  if (!config?.countingChannelId || message.channel.id !== config.countingChannelId) return false;

  const content = message.content.trim();
  const number  = parseInt(content, 10);

  // Non numérique → supprimer silencieusement
  if (isNaN(number) || number.toString() !== content) {
    await message.delete().catch(() => {});
    return true;
  }

  const expected  = (config.countingCurrent || 0) + 1;
  const isCorrect = number === expected;
  const isDouble  = config.countingLastUserId === uid;

  // ── Erreur ─────────────────────────────────────────────────────────────
  if (!isCorrect || isDouble) {
    await message.delete().catch(() => {});

    const timeoutMs  = getRandomTimeout(config.countingTimeoutMinutes);
    const timeoutMin = Math.round(timeoutMs / 60000);
    const reason     = isDouble
      ? `<@${uid}> a compté **deux fois de suite** !`
      : `<@${uid}> s'est trompé ! Le bon chiffre était **${expected}**.`;

    // 🐒 Rôle Singe — durée aléatoire
    if (config?.singeRoleId) {
      try {
        await message.member.roles.add(config.singeRoleId);
        setTimeout(() => message.member.roles.remove(config.singeRoleId).catch(() => {}), timeoutMs);
      } catch (_) {}
    }

    // Bloquer l'accès au salon counting
    try {
      await message.channel.permissionOverwrites.edit(uid, { SendMessages: false }, { reason: 'Counting : erreur' });
      setTimeout(async () => {
        await message.channel.permissionOverwrites.edit(uid, { SendMessages: null }).catch(() => {});
        const m = await message.channel.send({ content: `🔓 <@${uid}> peut à nouveau compter !` });
        setTimeout(() => m.delete().catch(() => {}), 5000);
      }, timeoutMs);
    } catch (err) {
      logger.error('Counting', 'Permission override failed', err);
    }

    const previousCount = config.countingCurrent || 0;
    await Config.updateOne({ guildId: gid }, { countingCurrent: 0, countingLastUserId: null });

    // Afficher durée en h ou min
    const durationStr = timeoutMin >= 60
      ? `${Math.round(timeoutMin / 60)}h`
      : `${timeoutMin} min`;

    const embed = new EmbedBuilder()
      .setColor(COLORS.RED)
      .setTitle('💥 Counting Ruiné !')
      .setDescription(
        `❌ ${reason}\n\n` +
        `📊 Record : **${config.countingRecord || 0}** | Vous étiez à **${previousCount}**\n` +
        `⏱️ <@${uid}> reçoit le rôle 🐒 Singe pendant **${durationStr}**\n\n` +
        `*Recommencez à partir de **1** !*`
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return true;
  }

  // ── Succès ─────────────────────────────────────────────────────────────
  const rule = getRule(number);
  await addXP(uid, gid, rule.xp, null, message.guild);
  const dailyBonus = await checkDailyGameBonus(uid, gid, message.channel.id, message.guild);
  if (dailyBonus) await message.channel.send(`🎯 <@${uid}> **+${dailyBonus} XP bonus** — première action du jour dans Infinis ! 🔢`).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000)).catch(()=>{});
  await message.react(rule.emoji).catch(() => {});

  const updates = { countingCurrent: number, countingLastUserId: uid };
  if (number > (config.countingRecord || 0)) updates.countingRecord = number;
  await Config.updateOne({ guildId: gid }, updates);

  if (number % 100 === 0) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`💯 PALIER ${number} ATTEINT !`)
      .setDescription(
        `🎊 **${number}** !! Bravo à tous !\n` +
        `<@${uid}> empoche **+${rule.xp} XP** ⚡\n\n` +
        `📈 Record du serveur : **${Math.max(number, config.countingRecord || 0)}**`
      )
      .setTimestamp();
    await message.channel.send({ content: '@everyone 💯', embeds: [embed] });

  } else if (number % 10 === 0) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setDescription(`🔟 **Multiple de 10 !** <@${uid}> gagne **+${rule.xp} XP** ⚡ *(${number})*`);
    const m = await message.channel.send({ embeds: [embed] });
    setTimeout(() => m.delete().catch(() => {}), 6000);

  } else if (number % 5 === 0) {
    const m = await message.channel.send(`5️⃣ **Multiple de 5 !** <@${uid}> gagne **+${rule.xp} XP** ⚡ *(${number})*`);
    setTimeout(() => m.delete().catch(() => {}), 5000);

  } else {
    const m = await message.channel.send(`✅ <@${uid}> **+${rule.xp} XP** ⚡ *(${number})*`);
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  return true;
}

module.exports = { handleCounting };
