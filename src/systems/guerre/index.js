// src/systems/guerre/index.js — Guerre Chien vs Chat (rôles Discord)
'use strict';
const { EmbedBuilder } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const { COLORS } = require('../../config/constants');
const logger = require('../../utils/logger');

const WAR_COOLDOWN = new Map(); // userId -> timestamp
const WAR_CD_MS    = 3_000;

// Détecte l'équipe d'un membre via son rôle Discord
function getMemberTeam(member, config) {
  if (config?.warDogRoleId && member.roles.cache.has(config.warDogRoleId)) return 'dog';
  if (config?.warCatRoleId && member.roles.cache.has(config.warCatRoleId)) return 'cat';
  return null;
}

async function handleWarTrigger(message) {
  const content = message.content.toLowerCase();
  const uid     = message.author.id;
  const gid     = message.guild.id;

  // Uniquement dans le salon guerre configuré
  const config = await Config.findOne({ guildId: gid });
  if (!config?.warChatChannelId || message.channel.id !== config.warChatChannelId) return;

  let trigger = null;
  if (/\b(woaf|woof|wouf|ouaf|chien|doggo|dog|bark)\b|🐶/.test(content)) trigger = 'dog';
  else if (/\b(miaou|meow|miao|chat|kitty|cat)\b|🐱/.test(content)) trigger = 'cat';
  if (!trigger) return;

  // Cooldown 3s
  const last = WAR_COOLDOWN.get(uid);
  if (last && Date.now() - last < WAR_CD_MS) {
    // Supprimer silencieusement pendant le cooldown
    await message.delete().catch(() => {});
    return;
  }
  WAR_COOLDOWN.set(uid, Date.now());

  // Lire l'équipe depuis le rôle Discord
  const member = message.member;
  const team   = getMemberTeam(member, config);

  // ── Pas d'équipe → supprimer + guider vers l'onboarding ─────────────
  if (!team) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `<@${uid}> Tu n'as pas encore choisi ton équipe ! Va dans **Salons et rôles** (en haut à gauche) pour rejoindre 🐶 Team Chien ou 🐱 Team Chat.`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 8000);
    return;
  }

  // ── Mauvaise équipe → supprimer + taquiner ───────────────────────────
  if (team !== trigger) {
    await message.delete().catch(() => {});
    const taunt = team === 'dog'
      ? `🐶 <@${uid}> essaie de miaouler… UN CHIEN QUI MIAULE 💀`
      : `🐱 <@${uid}> essaie de woafer… UN CHAT QUI ABOIE 💀`;
    const msg = await message.channel.send(taunt);
    setTimeout(() => msg.delete().catch(() => {}), 5000);
    return;
  }

  // ── Bonne équipe → supprimer message + afficher belle carte ──────────
  await message.delete().catch(() => {});

  await Config.updateOne(
    { guildId: gid },
    { $inc: { [trigger === 'dog' ? 'warDogPoints' : 'warCatPoints']: 1 } }
  );
  await User.updateOne({ userId: uid, guildId: gid }, { $inc: { teamXp: 1 }, team: trigger }, { upsert: true });

  const { dogs, cats } = await getWarStats(gid);
  const total   = dogs + cats || 1;
  const dogPct  = Math.round((dogs / total) * 100);
  const catPct  = 100 - dogPct;
  const bar     = (pct, len = 12) => '█'.repeat(Math.round(pct / 100 * len)) + '░'.repeat(len - Math.round(pct / 100 * len));

  const funDog = ['Woaf ! 🐶', 'Bon chien ! 🐾', 'Pat pat ! 👋🐶', 'Les chiens avancent ! 🐕'];
  const funCat = ['Miaou ! 🐱', 'Chat honoré ! 🐾', 'Les chats dominent ! 😼', 'Purr… 🐱'];
  const fun    = trigger === 'dog' ? funDog[Math.floor(Math.random() * funDog.length)] : funCat[Math.floor(Math.random() * funCat.length)];

  const embed = new EmbedBuilder()
    .setColor(trigger === 'dog' ? 0x8B4513 : 0xFF69B4)
    .setDescription(
      `**${fun}** — <@${uid}> marque 1 point pour **${trigger === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat'}** !\n\n` +
      `🐶 \`${bar(dogPct)}\` ${dogPct}%\n` +
      `🐱 \`${bar(catPct)}\` ${catPct}%`
    );

  const msg = await message.channel.send({ embeds: [embed] });
  setTimeout(() => msg.delete().catch(() => {}), 6000);
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

  await channel.send({ content: '@everyone ⚔️ Les résultats de la guerre !', embeds: [embed] });
  await Config.updateOne({ guildId }, { warDogPoints: 0, warCatPoints: 0 });
  logger.info('Guerre', `Vainqueur : ${winLabel}`);
}

// Gardé pour /guerre equipe si quelqu'un veut voir son équipe
async function joinTeam(interaction, team) {
  const config = await Config.findOne({ guildId: interaction.guild.id });
  const roleId = team === 'dog' ? config?.warDogRoleId : config?.warCatRoleId;
  if (!roleId) {
    return interaction.reply({ content: '❌ Les rôles de guerre ne sont pas configurés. Fais `/setup guerre`.', ephemeral: true });
  }
  return interaction.reply({
    content: `Pour rejoindre **${team === 'dog' ? '🐶 Team Chien' : '🐱 Team Chat'}**, va dans **Salons et rôles** → sélectionne ton équipe dans l'onboarding !`,
    ephemeral: true,
  });
}

module.exports = { handleWarTrigger, joinTeam, getWarStats, runWarCeremony };
