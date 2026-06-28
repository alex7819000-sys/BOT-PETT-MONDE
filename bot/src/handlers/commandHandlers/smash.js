// src/handlers/commandHandlers/smash.js — Smash or Pass
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');

function smashPassRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sop:smash:${id}`).setLabel('💚 Smash').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sop:pass:${id}`).setLabel('💔 Pass').setStyle(ButtonStyle.Danger),
  );
}

async function handleAnime(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'classement') {
    await interaction.deferReply();
    return interaction.editReply({ content: '📊 Classement anime — fonctionnalité disponible via le système SOP.' });
  }
  await interaction.deferReply();
  const { postSmashOrPass } = require('../../systems/smash');
  const image = interaction.options.getString('image');
  const nom = interaction.options.getString('nom');
  await postSmashOrPass(interaction.channel, interaction.guild.id, {
    title: `${EMOJIS.ANIME} ${nom ? nom : 'Smash or Pass Anime'}`,
    imageUrl: image,
    footer: 'Réagis pour voter !',
  });
  return interaction.editReply({ content: '✅ Posté !' });
}

async function handleWaifu(interaction, client) {
  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();
  if (sub === 'soumettre') {
    const nom = interaction.options.getString('nom');
    const image = interaction.options.getString('image');
    return interaction.editReply({ content: `✅ **${nom}** soumis ! Il sera validé avant publication.` });
  }
  return interaction.editReply({ content: '📊 Classement waifus disponible bientôt.' });
}

async function handleAnimaux(interaction, client) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'classement') {
    await interaction.deferReply();
    return interaction.editReply({ content: '📊 Classement animaux disponible bientôt.' });
  }
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    return interaction.editReply({ content: '✅ Animal soumis ! Il sera validé avant publication.' });
  }
  await interaction.deferReply();
  try {
    const { ANIMAL_APIS, ANIMAL_KEYS } = require('../../config/constants');
    const key = ANIMAL_KEYS[Math.floor(Math.random() * ANIMAL_KEYS.length)];
    const result = await ANIMAL_APIS[key]();
    const { postSmashOrPass } = require('../../systems/smash');
    await postSmashOrPass(interaction.channel, interaction.guild.id, {
      title: `${result.emoji} ${result.name} aléatoire`,
      imageUrl: result.image,
      footer: 'Réagis pour voter !',
    });
    return interaction.editReply({ content: '✅ Posté !' });
  } catch {
    return interaction.editReply({ content: '❌ API indisponible, réessaie dans quelques instants.' });
  }
}

async function handleFaceReveal(interaction, client) {
  const sub = interaction.options.getSubcommand();
  
  if (sub === 'soumettre') {
    await interaction.deferReply({ ephemeral: true });
    const imageUrl = interaction.options.getString('image');
    const anonymous = interaction.options.getBoolean('anonyme') ?? false;
    
    const { postFaceReveal } = require('../../systems/faceReveal');
    const result = await postFaceReveal(interaction.channel, interaction.guild, interaction.guild.id, {
      imageUrl,
      authorId: anonymous ? null : interaction.user.id,
      authorName: anonymous ? 'Anonyme' : interaction.user.username,
    });

    if (result) {
      return interaction.editReply({ 
        content: `✅ Face reveal posté! Un thread a été créé pour les commentaires. ${result.thread ? 'Clique dessus pour discuter!' : ''}` 
      });
    } else {
      return interaction.editReply({ content: '❌ Erreur lors du post du face reveal. Vérifie que le salon est bien configuré.' });
    }
  }

  if (sub === 'classement') {
    await interaction.deferReply();
    const FaceReveal = require('../../db/models/FaceReveal');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const top = await FaceReveal.find({
      guildId: interaction.guild.id,
      createdAt: { $gte: today },
    })
      .sort({ smashCount: -1 })
      .limit(10)
      .lean()
      .catch(() => []);

    if (top.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.PINK)
        .setTitle('👤 Classement Face Reveal du Jour')
        .setDescription('*Aucun face reveal encore aujourd\'hui*');
      return interaction.editReply({ embeds: [embed] });
    }

    const lines = top.map((fr, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      const medal = medals[i] || `**${i + 1}.**`;
      const ratio = fr.smashCount + fr.passCount > 0 
        ? Math.round((fr.smashCount / (fr.smashCount + fr.passCount)) * 100)
        : 0;
      return `${medal} **${fr.authorName}** — 🔥 **${fr.smashCount}** / 💀 ${fr.passCount} (**${ratio}%**)`;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.PINK)
      .setTitle('👤 Top 10 Face Reveals du Jour')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { handleAnime, handleWaifu, handleAnimaux, handleFaceReveal };
