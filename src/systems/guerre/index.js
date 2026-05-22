// src/systems/guerre/index.js — Guerre Chien vs Chat
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User   = require('../../db/models/User');
const Config = require('../../db/models/Config');
const { COLORS, EMOJIS } = require('../../config/constants');
const logger = require('../../utils/logger');

const COOLDOWN_ANIMAL = new Map(); // userId -> timestamp

async function handleWarTrigger(message) {
  const content = message.content.toLowerCase();
  const uid = message.author.id;
  const gid = message.guild.id;

  let team = null;
  if (/\b(woaf|woof|wouf|ouaf|chien|doggo|dog|bark)\b|🐶/.test(content)) team = 'dog';
  else if (/\b(miaou|meow|miao|chat|kitty|cat)\b|🐱/.test(content)) team = 'cat';
  if (!team) return;

  // Cooldown 30s par user
  const lastTrigger = COOLDOWN_ANIMAL.get(uid);
  if (lastTrigger && Date.now() - lastTrigger < 30_000) return;
  COOLDOWN_ANIMAL.set(uid, Date.now());

  const user = await User.findOne({ userId: uid, guildId: gid });

  // Pas encore d'équipe → proposer de rejoindre
  if (!user?.team) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.BLUE)
      .setTitle('⚔️ Guerre Chien vs Chat !')
      .setDescription('Rejoins une équipe pour participer à la guerre hebdomadaire !')
      .addFields(
        { name: '🐶 Équipe Chien', value: 'Dis **woaf** !', inline: true },
        { name: '🐱 Équipe Chat',  value: 'Dis **miaou** !', inline: true },
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('war:join:dog').setLabel('🐶 Rejoindre Chiens').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('war:join:cat').setLabel('🐱 Rejoindre Chats').setStyle(ButtonStyle.Success),
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  // Mauvaise équipe → taquiner
  if (user.team === 'dog' && team === 'cat') {
    return message.reply(`🐶 Traître ! Un chien qui miaule ?! Honte à toi ${message.author} !`);
  }
  if (user.team === 'cat' && team === 'dog') {
    return message.reply(`🐱 LOL ! Un chat qui fait woaf ?! C'est pitoyable ${message.author} 😂`);
  }

  // Bonne équipe → points + message fun
  await User.updateOne({ userId: uid, guildId: gid }, { $inc: { teamXp: 1 } });
  await Config.updateOne(
    { guildId: gid },
    { $inc: { [team === 'dog' ? 'warDogPoints' : 'warCatPoints']: 1 } },
  );

  const msgs = {
    dog: ['Bon chien ! 🐶', 'Woaf ! +1 point pour les chiens !', '🐶 Les chiens avancent !', 'Pat pat ! Bonne bête !'],
    cat: ['Miaou parfait ! 🐱', '+1 point pour les chats !', '🐱 Les chats dominent !', 'Chat honoré ! 🐱'],
  };
  const rnd = msgs[team][Math.floor(Math.random() * msgs[team].length)];
  await message.react(team === 'dog' ? '🐶' : '🐱').catch(() => {});
}

async function joinTeam(interaction, team) {
  await interaction.deferUpdate();
  const uid = interaction.user.id;
  const gid = interaction.guild.id;

  const user = await User.findOneAndUpdate(
    { userId: uid, guildId: gid },
    { team },
    { upsert: true, new: true },
  );

  const label = team === 'dog' ? '🐶 Équipe Chien' : '🐱 Équipe Chat';
  await interaction.followUp({
    content: `Tu rejoins **${label}** ! Chaque "${team === 'dog' ? 'woaf' : 'miaou'}" rapporte 1 point à ton équipe.`,
    ephemeral: true,
  });
}

async function getWarStats(guildId) {
  const config = await Config.findOne({ guildId });
  const dogs   = config?.warDogPoints || 0;
  const cats   = config?.warCatPoints || 0;
  const total  = dogs + cats || 1;
  return {
    dogs, cats,
    dogPct: Math.round((dogs / total) * 100),
    catPct: Math.round((cats / total) * 100),
  };
}

async function runWarCeremony(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.warChannelId && !config?.announceChannelId) return;
  const channelId = config.warChannelId || config.announceChannelId;
  const guild     = client.guilds.cache.get(guildId);
  const channel   = guild?.channels.cache.get(channelId);
  if (!channel) return;

  const { dogs, cats, dogPct, catPct } = await getWarStats(guildId);
  const winner  = dogs >= cats ? 'dog' : 'cat';
  const winEmoji = winner === 'dog' ? '🐶' : '🐱';
  const winLabel = winner === 'dog' ? 'CHIENS' : 'CHATS';
  const bar = (pct) => '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

  const embed = new EmbedBuilder()
    .setColor(winner === 'dog' ? 0x8B4513 : 0xFF69B4)
    .setTitle(`⚔️ Résultat de la Guerre — ${winEmoji} ${winLabel} GAGNENT !`)
    .addFields(
      { name: '🐶 Chiens', value: `\`${bar(dogPct)}\` ${dogs} pts (${dogPct}%)`, inline: false },
      { name: '🐱 Chats',  value: `\`${bar(catPct)}\` ${cats} pts (${catPct}%)`, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'La guerre repart lundi !' });

  await channel.send({ content: '@everyone ⚔️ Les résultats de la guerre !', embeds: [embed] });

  // Reset points
  await Config.updateOne({ guildId }, { warDogPoints: 0, warCatPoints: 0 });
  logger.info('Guerre', `Vainqueur : ${winLabel}`);
}

module.exports = { handleWarTrigger, joinTeam, getWarStats, runWarCeremony };
