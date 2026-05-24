// src/systems/quiz/index.js — Quiz anime quotidien
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios     = require('axios');
const ActiveQuiz = require('../../db/models/Quiz');
const User      = require('../../db/models/User');
const Config    = require('../../db/models/Config');
const logger    = require('../../utils/logger');
const { COLORS, EMOJIS, XP } = require('../../config/constants');
const { safeReply } = require('../../utils/permissions');

const OTAKU_ROLES = [
  { level: 1,  label: '🎌 Weeb Débutant',    key: 'weeb' },
  { level: 5,  label: '⚔️ Otaku Confirmé',    key: 'otaku' },
  { level: 20, label: '👑 Senpai Suprême',    key: 'senpai' },
  { level: 50, label: '🐉 Sensei Légendaire', key: 'sensei' },
];

async function fetchQuizQuestion() {
  try {
    const { data } = await axios.get('https://api.jikan.moe/v4/random/characters', { timeout: 8000 });
    const char = data.data;
    const image = char.images?.jpg?.image_url;
    if (!image) return null;

    const anime = char.anime?.[0]?.anime?.title || null;
    const correctName = char.name;

    // Générer 3 mauvaises réponses depuis d'autres persos
    const fakeNames = ['Naruto Uzumaki', 'Goku', 'Luffy', 'Levi Ackerman', 'Rem', 'Zero Two', 'Itachi Uchiha', 'Sakura Haruno', 'Killua Zoldyck', 'Hinata Hyuga'];
    const wrongs = fakeNames.filter(n => n !== correctName).sort(() => Math.random() - 0.5).slice(0, 3);

    const options = [correctName, ...wrongs].sort(() => Math.random() - 0.5);
    return { question: 'Quel est ce personnage ?', answer: correctName, options, anime, imageUrl: image };
  } catch (err) {
    logger.error('Quiz', 'Jikan API failed', err);
    return null;
  }
}

async function postDailyQuiz(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.quizChannelId && !config?.animeChannelId) return;
  const channelId = config.quizChannelId || config.animeChannelId;
  const guild     = client.guilds.cache.get(guildId);
  const channel   = guild?.channels.cache.get(channelId);
  if (!channel) return;

  // Fermer quiz précédent si encore actif
  await ActiveQuiz.deleteOne({ guildId });

  const q = await fetchQuizQuestion();
  if (!q) return logger.warn('Quiz', 'Impossible de générer une question');

  const embed = new EmbedBuilder()
    .setColor(COLORS.TEAL)
    .setTitle(`${EMOJIS.ANIME} Quiz Anime du Jour !`)
    .setDescription(`**${q.question}**${q.anime ? `\n*Indice : apparaît dans **${q.anime}***` : ''}`)
    .setImage(q.imageUrl)
    .addFields({ name: 'Récompense', value: `Premier à répondre → **+${XP.QUIZ_BONUS} XP** ⚡`, inline: false })
    .setTimestamp()
    .setFooter({ text: 'Soyez le premier à trouver !' });

  const row = new ActionRowBuilder().addComponents(
    q.options.map(opt =>
      new ButtonBuilder()
        .setCustomId(`quiz:answer:${Buffer.from(opt).toString('base64').slice(0, 80)}`)
        .setLabel(opt.length > 80 ? opt.slice(0, 77) + '...' : opt)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await ActiveQuiz.create({ guildId, ...q, messageId: msg.id, channelId });
  logger.info('Quiz', `Question postée : ${q.answer}`);
}

async function handleQuizAnswer(interaction, encodedAnswer) {
  await interaction.deferUpdate();
  const gid    = interaction.guild.id;
  const uid    = interaction.user.id;
  const answer = Buffer.from(encodedAnswer, 'base64').toString('utf8');
  const quiz   = await ActiveQuiz.findOne({ guildId: gid });

  if (!quiz || quiz.answered) {
    return interaction.followUp({ content: '⏰ Trop tard, le quiz est déjà terminé !', ephemeral: true });
  }

  const correct = answer === quiz.answer;

  if (correct) {
    quiz.answered = true;
    quiz.winnerId = uid;
    await quiz.save();

    // Donner XP
    const xpSys = require('../xp');
    await xpSys.addXP(uid, gid, XP.QUIZ_BONUS);

    // Incrémenter wins quiz
    const user = await User.findOneAndUpdate(
      { userId: uid, guildId: gid },
      { $inc: { quizScore: 1, quizWins: 1 } },
      { upsert: true, new: true },
    );

    // Vérifier niveau otaku
    await checkOtakuLevel(interaction.guild, uid, gid, user.quizWins + 1);

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(COLORS.GREEN)
      .setTitle(`✅ Quiz résolu ! — ${quiz.answer}`)
      .setDescription(`🏆 <@${uid}> a trouvé en premier ! **+${XP.QUIZ_BONUS} XP** ⚡`);

    await interaction.editReply({ embeds: [embed], components: [] });
    await interaction.followUp({ content: `🎉 Bravo <@${uid}> ! La réponse était **${quiz.answer}** !` });
  } else {
    await interaction.followUp({ content: `❌ Mauvaise réponse ! Continue d'essayer...`, ephemeral: true });
  }
}

async function checkOtakuLevel(guild, userId, guildId, wins) {
  const config = await Config.findOne({ guildId });
  for (const tier of OTAKU_ROLES.reverse()) {
    if (wins >= tier.level) {
      await User.updateOne({ userId, guildId }, { otakuLevel: tier.key });
      logger.info('Quiz', `${userId} → ${tier.label}`);
      break;
    }
  }
}

async function getQuizLeaderboard(guildId, limit = 10) {
  return User.find({ guildId, quizWins: { $gt: 0 } }).sort({ quizWins: -1 }).limit(limit);
}

module.exports = { postDailyQuiz, handleQuizAnswer, getQuizLeaderboard };
