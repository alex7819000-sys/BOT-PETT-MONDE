// src/systems/quiz.js — Quiz (bouton répondre)
'use strict';
const mongoose = require('mongoose');
const User = require('../db/models/User');
const { XP, COLORS } = require('../config/constants');
const { EmbedBuilder } = require('discord.js');

const qSchema = new mongoose.Schema({
  guildId: String, messageId: String, channelId: String,
  question: String, correctAnswer: String,
  answers: [{ label: String, value: String }],
  answered: [String], // userId[]
  ended: { type: Boolean, default: false },
  winners: [String],
}, { timestamps: true });
const Quiz = mongoose.models.Quiz || mongoose.model('Quiz', qSchema);

async function handleQuizAnswer(interaction, answer) {
  await interaction.deferReply({ ephemeral: true });
  const uid = interaction.user.id;
  const gid = interaction.guild.id;

  const quiz = await Quiz.findOne({ guildId: gid, messageId: interaction.message.id });
  if (!quiz)       return interaction.editReply({ content: '❌ Quiz introuvable.' });
  if (quiz.ended)  return interaction.editReply({ content: '⏰ Ce quiz est terminé !' });
  if (quiz.answered.includes(uid)) return interaction.editReply({ content: '✅ Tu as déjà répondu à ce quiz !' });

  quiz.answered.push(uid);

  if (answer === quiz.correctAnswer) {
    quiz.winners.push(uid);
    await quiz.save();
    // Bonus XP
    await User.findOneAndUpdate(
      { userId: uid, guildId: gid },
      { $inc: { xp: XP.QUIZ_BONUS, totalXp: XP.QUIZ_BONUS, weekXp: XP.QUIZ_BONUS, dailyXp: XP.QUIZ_BONUS, quizWins: 1 } },
      { upsert: true }
    );
    return interaction.editReply({ content: `✅ **Bonne réponse !** +${XP.QUIZ_BONUS} XP` });
  } else {
    await quiz.save();
    return interaction.editReply({ content: `❌ Mauvaise réponse. La bonne réponse était : **${quiz.correctAnswer}**` });
  }
}

module.exports = { handleQuizAnswer, Quiz };
