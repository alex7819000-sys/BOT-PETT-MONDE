// src/systems/counting/index.js — Système de counting
'use strict';
const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Config = require('../../db/models/Config');
const { addXP } = require('../xp');
const logger = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

// ── XP par type ───────────────────────────────────────────────────────────
const XP_RULES = {
  multiple100: { xp: 100, emoji: '💯', label: 'PALIER 100 !',    color: COLORS.GOLD,   autodelete: 0    },
  multiple10:  { xp: 30,  emoji: '🔟', label: 'Multiple de 10',  color: COLORS.GOLD,   autodelete: 6000 },
  multiple5:   { xp: 15,  emoji: '5️⃣', label: 'Multiple de 5',   color: COLORS.ORANGE, autodelete: 5000 },
  normal:      { xp: 5,   emoji: '✅', label: null,               color: null,          autodelete: 3000 },
};

function getRule(n) {
  if (n % 100 === 0) return XP_RULES.multiple100;
  if (n % 10  === 0) return XP_RULES.multiple10;
  if (n % 5   === 0) return XP_RULES.multiple5;
  return XP_RULES.normal;
}

async function handleCounting(message) {
  const gid = message.guild.id;
  const uid = message.author.id;

  const config = await Config.findOne({ guildId: gid });
  if (!config?.countingChannelId || message.channel.id !== config.countingChannelId) return false;

  const content = message.content.trim();
  const number  = parseInt(content, 10);

  // Message non numérique → supprimer silencieusement
  if (isNaN(number) || number.toString() !== content) {
    await message.delete().catch(() => {});
    return true;
  }

  const expected  = (config.countingCurrent || 0) + 1;
  const isCorrect = number === expected;
  const isDouble  = config.countingLastUserId === uid;

  // ── Erreur ────────────────────────────────────────────────────────────
  if (!isCorrect || isDouble) {
    await message.delete().catch(() => {});

    const timeoutMin = config.countingTimeoutMinutes || 5;
    const timeoutMs  = timeoutMin * 60 * 1000;
    const reason     = isDouble
      ? `<@${uid}> a compté **deux fois de suite** !`
      : `<@${uid}> s'est trompé ! Le bon chiffre était **${expected}**.`;

    // Bloquer l'accès au salon
    try {
      await message.channel.permissionOverwrites.edit(uid, { SendMessages: false }, { reason: 'Counting : erreur' });
      setTimeout(async () => {
        await message.channel.permissionOverwrites.edit(uid, { SendMessages: null }).catch(() => {});
        await message.channel.send({ content: `🔓 <@${uid}> peut à nouveau compter !` })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }, timeoutMs);
    } catch (err) {
      logger.error('Counting', 'Permission override failed', err);
    }

    const previousCount = config.countingCurrent || 0;
    await Config.updateOne({ guildId: gid }, { countingCurrent: 0, countingLastUserId: null });

    const embed = new EmbedBuilder()
      .setColor(COLORS.RED)
      .setTitle('💥 Counting Ruiné !')
      .setDescription(
        `❌ ${reason}\n\n` +
        `📊 Record : **${config.countingRecord || 0}** | Vous étiez à **${previousCount}**\n` +
        `⏱️ <@${uid}> est banni du counting pendant **${timeoutMin} min**\n\n` +
        `*Recommencez à partir de **1** !*`
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return true;
  }

  // ── Succès ────────────────────────────────────────────────────────────
  const rule = getRule(number);
  await addXP(uid, gid, rule.xp);
  await message.react(rule.emoji).catch(() => {});

  // Mise à jour state
  const updates = { countingCurrent: number, countingLastUserId: uid };
  if (number > (config.countingRecord || 0)) updates.countingRecord = number;
  await Config.updateOne({ guildId: gid }, updates);

  // ── Notification XP ──────────────────────────────────────────────────

  if (number % 100 === 0) {
    // Palier 100 → embed permanent + ping
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle(`💯 PALIER ${number} ATTEINT !`)
      .setDescription(
        `🎊 Bravo à tout le serveur ! **${number}** !!\n` +
        `<@${uid}> pose le chiffre et empoche **+${rule.xp} XP** ⚡\n\n` +
        `📈 Record du serveur : **${Math.max(number, config.countingRecord || 0)}**`
      )
      .setTimestamp();
    await message.channel.send({ content: '@everyone 💯', embeds: [embed] });

  } else if (number % 10 === 0) {
    // Multiple de 10 → embed + auto-delete 6s
    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setDescription(`🔟 **Multiple de 10 !** <@${uid}> gagne **+${rule.xp} XP** ⚡ *(${number})*`)
    const m = await message.channel.send({ embeds: [embed] });
    setTimeout(() => m.delete().catch(() => {}), rule.autodelete);

  } else if (number % 5 === 0) {
    // Multiple de 5 → message simple + auto-delete 5s
    const m = await message.channel.send(
      `5️⃣ **Multiple de 5 !** <@${uid}> gagne **+${rule.xp} XP** ⚡ *(${number})*`
    );
    setTimeout(() => m.delete().catch(() => {}), rule.autodelete);

  } else {
    // Chiffre normal → petit message auto-delete 3s
    const m = await message.channel.send(
      `✅ <@${uid}> **+${rule.xp} XP** ⚡ *(${number})*`
    );
    setTimeout(() => m.delete().catch(() => {}), rule.autodelete);
  }

  logger.debug('Counting', `${number} par ${uid} (+${rule.xp} XP)`);
  return true;
}

module.exports = { handleCounting };
