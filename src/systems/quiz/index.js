// src/systems/quiz/index.js — Quiz anime quotidien v5 — difficulté + 1 seule tentative
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios      = require('axios');
const ActiveQuiz = require('../../db/models/Quiz');
const User       = require('../../db/models/User');
const Config     = require('../../db/models/Config');
const logger     = require('../../utils/logger');

// ── Points par difficulté ─────────────────────────────────────────────────
const DIFFICULTY = {
  easy:   { label: '🟢 Facile',   xp: 10, emoji: '🟢' },
  medium: { label: '🟡 Moyen',    xp: 25, emoji: '🟡' },
  hard:   { label: '🔴 Difficile', xp: 50, emoji: '🔴' },
};
// Bonus vitesse pour les 3 premiers
const SPEED_BONUS = [15, 10, 5];

// Mauvaises réponses par défaut
const FAKE_NAMES = [
  'Naruto Uzumaki','Goku','Monkey D. Luffy','Levi Ackerman','Rem','Zero Two',
  'Itachi Uchiha','Sakura Haruno','Killua Zoldyck','Hinata Hyuga','Eren Yeager',
  'Mikasa Ackerman','Kaneki Ken','Edward Elric','Rukia Kuchiki','Ichigo Kurosaki',
  'Tanjiro Kamado','Nezuko Kamado','Gojo Satoru','Yuji Itadori',
];

// ── Otaku tiers ───────────────────────────────────────────────────────────
const OTAKU_ROLES = [
  { wins: 1,  label: '🎌 Weeb Débutant',    key: 'weeb' },
  { wins: 5,  label: '⚔️ Otaku Confirmé',    key: 'otaku' },
  { wins: 20, label: '👑 Senpai Suprême',    key: 'senpai' },
  { wins: 50, label: '🐉 Sensei Légendaire', key: 'sensei' },
];

// ── Fetch question depuis Jikan ───────────────────────────────────────────
async function fetchQuestion() {
  try {
    const { data } = await axios.get('https://api.jikan.moe/v4/random/characters', { timeout: 8000 });
    const char = data.data;
    const image = char.images?.jpg?.image_url;
    if (!image || !char.name) return null;

    const anime = char.anime?.[0]?.anime?.title || null;
    const correctName = char.name;

    // Difficulté selon popularité (favorites)
    const fav = char.favorites || 0;
    const difficulty = fav > 5000 ? 'easy' : fav > 500 ? 'medium' : 'hard';

    const wrongs = FAKE_NAMES
      .filter(n => n !== correctName)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [correctName, ...wrongs].sort(() => Math.random() - 0.5);
    return { question: 'Quel est ce personnage ?', answer: correctName, options, anime, imageUrl: image, difficulty };
  } catch (err) {
    logger.error('Quiz', 'Jikan API failed', err);
    return null;
  }
}

// ── Construire l'embed de question ────────────────────────────────────────
function buildQuizEmbed(q, correct = [], total = 0, closed = false) {
  const diff = DIFFICULTY[q.difficulty];
  const desc = closed
    ? `✅ Réponse : **${q.answer}**\n${correct.length} membre(s) ont trouvé !`
    : [
        `**${q.question}**`,
        q.anime ? `*Indice : anime **${q.anime}***` : '',
        '',
        `${diff.emoji} Difficulté : **${diff.label}** — **${diff.xp} XP** si correct`,
        `⚡ Bonus vitesse : 1er **+15**, 2e **+10**, 3e **+5**`,
        '',
        `⚠️ **Une seule tentative — réfléchis bien !**`,
        total > 0 ? `👥 ${total} réponse(s) enregistrée(s)` : '',
      ].filter(Boolean).join('\n');

  return new EmbedBuilder()
    .setColor(closed ? 0x95a5a6 : (q.difficulty === 'hard' ? 0xe74c3c : q.difficulty === 'medium' ? 0xf39c12 : 0x2ecc71))
    .setTitle(closed ? `🎌 Quiz terminé !` : `🎌 Quiz Anime du Jour — ${diff.emoji}`)
    .setDescription(desc)
    .setImage(q.imageUrl)
    .setTimestamp()
    .setFooter({ text: closed ? 'Reviens demain pour le prochain quiz !' : 'Clique sur la bonne réponse — une seule chance !' });
}

// ── Construire les boutons ────────────────────────────────────────────────
function buildButtons(options, disabled = false) {
  return new ActionRowBuilder().addComponents(
    options.map(opt =>
      new ButtonBuilder()
        .setCustomId(`quiz:answer:${Buffer.from(opt).toString('base64').slice(0, 80)}`)
        .setLabel(opt.length > 80 ? opt.slice(0, 77) + '...' : opt)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    )
  );
}

// ── Poster le quiz quotidien ──────────────────────────────────────────────
async function postDailyQuiz(client, guildId) {
  const config = await Config.findOne({ guildId });
  const channelId = config?.quizChannelId || config?.animeChannelId;
  if (!channelId) return;

  const guild   = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(channelId);
  if (!channel) return;

  // Fermer et annoncer résultat du quiz précédent si pas encore fermé
  const prev = await ActiveQuiz.findOne({ guildId });
  if (prev && !prev.closed) {
    try {
      const prevChannel = guild.channels.cache.get(prev.channelId);
      const prevMsg = await prevChannel?.messages.fetch(prev.messageId).catch(() => null);
      if (prevMsg) {
        const embed = buildQuizEmbed(prev, prev.correct, prev.answered.length, true);
        await prevMsg.edit({ embeds: [embed], components: [buildButtons(prev.options, true)] });
        if (prev.correct.length === 0) {
          await prevChannel.send(`⏰ Personne n'a trouvé ! La réponse était **${prev.answer}**. Dommage !`);
        }
      }
    } catch {}
    await ActiveQuiz.deleteOne({ guildId });
  }

  const q = await fetchQuestion();
  if (!q) return logger.warn('Quiz', 'Impossible de générer une question');

  const embed = buildQuizEmbed(q);
  const row   = buildButtons(q.options);
  const msg   = await channel.send({ embeds: [embed], components: [row] });

  await ActiveQuiz.create({
    guildId,
    ...q,
    messageId: msg.id,
    channelId: channel.id,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  });

  logger.info('Quiz', `Question postée [${q.difficulty}] : ${q.answer}`);
}

// ── Gérer la réponse d'un user ────────────────────────────────────────────
async function handleQuizAnswer(interaction, encodedAnswer) {
  await interaction.deferUpdate();
  const gid    = interaction.guildId;
  const uid    = interaction.user.id;
  const answer = Buffer.from(encodedAnswer, 'base64').toString('utf8');
  const quiz   = await ActiveQuiz.findOne({ guildId: gid });

  if (!quiz || quiz.closed) {
    return interaction.followUp({ content: '⏰ Ce quiz est terminé !', ephemeral: true });
  }

  // Une seule tentative
  if (quiz.answered.includes(uid)) {
    return interaction.followUp({
      content: '❌ Tu as déjà répondu à ce quiz — une seule tentative par jour !',
      ephemeral: true,
    });
  }

  // Enregistrer la tentative
  quiz.answered.push(uid);
  const correct = answer === quiz.answer;

  if (correct) {
    quiz.correct.push(uid);
    const rank = quiz.correct.length; // position (1er, 2e, 3e...)
    const diff = DIFFICULTY[quiz.difficulty];
    const speedBonus = SPEED_BONUS[rank - 1] || 0;
    const totalXp = diff.xp + speedBonus;

    await quiz.save();

    // Donner XP
    const xpSys = require('../xp');
    await xpSys.addXP(uid, gid, totalXp, interaction.message);

    // Incrémenter wins
    const user = await User.findOneAndUpdate(
      { userId: uid, guildId: gid },
      { $inc: { quizScore: totalXp, quizWins: 1 } },
      { upsert: true, new: true },
    );

    await checkOtakuLevel(interaction.guild, uid, gid, user.quizWins);

    // Réponse éphem avec les détails
    const rankLabel = rank === 1 ? '🥇 1er !' : rank === 2 ? '🥈 2e !' : rank === 3 ? '🥉 3e !' : `✅ Correct !`;
    await interaction.followUp({
      content: [
        `${rankLabel} **+${diff.xp} XP** (${diff.label})${speedBonus > 0 ? ` + **+${speedBonus} XP** bonus vitesse` : ''} = **+${totalXp} XP** total`,
        rank <= 3 ? `Tu es le ${rank === 1 ? 'premier' : rank === 2 ? 'deuxième' : 'troisième'} à trouver !` : '',
      ].filter(Boolean).join('\n'),
      ephemeral: true,
    });

    // Mettre à jour l'embed avec le compteur
    const updatedEmbed = buildQuizEmbed(quiz, quiz.correct, quiz.answered.length, false);
    await interaction.editReply({ embeds: [updatedEmbed], components: [buildButtons(quiz.options)] });

  } else {
    await quiz.save();
    await interaction.followUp({
      content: `❌ Mauvaise réponse ! Plus de tentative possible pour ce quiz — reviens demain.`,
      ephemeral: true,
    });

    // Mettre à jour le compteur de réponses
    const updatedEmbed = buildQuizEmbed(quiz, quiz.correct, quiz.answered.length, false);
    await interaction.editReply({ embeds: [updatedEmbed], components: [buildButtons(quiz.options)] });
  }
}

// ── Vérifier niveau otaku ─────────────────────────────────────────────────
async function checkOtakuLevel(guild, userId, guildId, wins) {
  const tiers = [...OTAKU_ROLES].sort((a, b) => b.wins - a.wins);
  const tier = tiers.find(t => wins >= t.wins);
  if (!tier) return;

  const user = await User.findOne({ userId, guildId });
  if (user?.otakuLevel === tier.key) return; // déjà à ce niveau

  await User.updateOne({ userId, guildId }, { otakuLevel: tier.key });

  try {
    const member = await guild.members.fetch(userId);
    await member.send({
      embeds: [new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🎌 Nouveau titre Otaku !')
        .setDescription(`Tu as atteint **${tier.label}** avec ${wins} bonne(s) réponse(s) !`)
      ]
    }).catch(() => {});
  } catch {}
}

async function getQuizLeaderboard(guildId, limit = 10) {
  return User.find({ guildId, quizWins: { $gt: 0 } }).sort({ quizWins: -1 }).limit(limit);
}

module.exports = { postDailyQuiz, handleQuizAnswer, getQuizLeaderboard };
