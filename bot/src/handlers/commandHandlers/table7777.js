'use strict';

const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { rollTable7777, getLeaderboard, getWeeklyLeaderboard, getUserCollection, COMBOS } = require('../../systems/table7777');
const logger = require('../../utils/logger');

/**
 * Gère /7777 roll
 */
async function handleRoll(interaction) {
  try {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const result = await rollTable7777(userId, guildId);

    // Construction de l'embed
    const embed = new EmbedBuilder()
      .setColor(result.isSpecial ? '#FFD700' : '#2E7D32')
      .setTitle(result.isSpecial ? '🌟 SPÉCIAL ! 🌟' : '🎲 Roulette 7777')
      .setDescription(`Tu as obtenu le chiffre **${result.number}**`);

    if (result.isSpecial) {
      embed.addFields({ name: '✨ Très rare !', value: `Tu as trouvé un chiffre spécial (0.5% de chance) !` });
    }

    if (result.newNumber) {
      embed.addFields({ name: '📍 Nouveau pour toi !', value: `Tu n'avais jamais obtenu ce chiffre avant.` });
    }

    embed.addFields(
      { name: '🎯 Jetons gagnés', value: `+${result.jetonsGained}`, inline: true },
      { name: '💰 Total jetons', value: `${result.collection.jetons}`, inline: true },
      { name: '📊 Collection', value: `${result.collection.totalFound}/10001 chiffres`, inline: true }
    );

    if (result.newCombo) {
      embed.addFields({
        name: `🎉 COMBO DÉBLOQUÉ ! ${result.newCombo.emoji}`,
        value: `**${result.newCombo.name}** — +100 jetons bonus !`,
      });
    }

    embed.setThumbnail(interaction.user.displayAvatarURL());
    embed.setFooter({ text: 'Réessaye plus tard !' });

    return interaction.followUp({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleRoll', err);
    return interaction.followUp({ content: '❌ Erreur lors du tirage.', ephemeral: true });
  }
}

/**
 * Gère /7777 collection
 */
async function handleCollection(interaction) {
  try {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const collection = await getUserCollection(userId, guildId);
    if (!collection) {
      return interaction.followUp({ content: '❌ Tu n\'as pas encore de collection. Fais `/7777 roll` pour commencer !', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor('#7B68EE')
      .setTitle('📚 Ta Collection 7777')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '💰 Jetons', value: `${collection.jetons}`, inline: true },
        { name: '📊 Chiffres trouvés', value: `${collection.totalFound}/10001`, inline: true },
        { name: '✨ Spéciaux trouvés', value: `${collection.specialFound}/23`, inline: true },
        { name: '🎯 Tirages totaux', value: `${collection.totalRolls}`, inline: true }
      );

    if (collection.completedCombos && collection.completedCombos.length > 0) {
      const combosText = collection.completedCombos
        .map(c => `${c.emoji} **${c.name}**`)
        .join('\n');
      embed.addFields({ name: '🎉 Combos débloqués', value: combosText });
    } else {
      embed.addFields({ name: '🎉 Combos débloqués', value: '_Aucun combo complété pour l\'instant_' });
    }

    return interaction.followUp({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleCollection', err);
    return interaction.followUp({ content: '❌ Erreur lors de la récupération de ta collection.', ephemeral: true });
  }
}

/**
 * Gère /7777 leaderboard
 */
async function handleLeaderboard(interaction) {
  try {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    const top = await getLeaderboard(guildId);

    if (!top || top.length === 0) {
      return interaction.followUp({ content: '❌ Pas assez de données pour un classement.', ephemeral: true });
    }

    let ranking = '';
    for (let i = 0; i < top.length; i++) {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      ranking += `${medal} <@${top[i].userId}> — **${top[i].jetons}** jetons (${top[i].specialFound?.length || 0} spéciaux)\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 Classement Global — Jetons 7777')
      .setDescription(ranking)
      .setFooter({ text: 'Plus de jetons = plus fort !' });

    return interaction.followUp({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleLeaderboard', err);
    return interaction.followUp({ content: '❌ Erreur lors de la récupération du classement.', ephemeral: true });
  }
}

/**
 * Gère /7777 semaine
 */
async function handleWeekly(interaction) {
  try {
    await interaction.deferReply();

    const guildId = interaction.guildId;
    const top = await getWeeklyLeaderboard(guildId);

    if (!top || top.length === 0) {
      return interaction.followUp({ content: '❌ Pas assez de données pour un classement de semaine.', ephemeral: true });
    }

    let ranking = '';
    for (let i = 0; i < top.length; i++) {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
      ranking += `${medal} <@${top[i].userId}> — **${top[i].weeklyJetons}** jetons cette semaine (${top[i].weeklyRolls} tirages)\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#00BCD4')
      .setTitle('📅 Classement de la Semaine — 7777')
      .setDescription(ranking)
      .setFooter({ text: 'Réinitialisation chaque lundi !' });

    return interaction.followUp({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleWeekly', err);
    return interaction.followUp({ content: '❌ Erreur lors de la récupération du classement hebdomadaire.', ephemeral: true });
  }
}

module.exports = {
  handleRoll,
  handleCollection,
  handleLeaderboard,
  handleWeekly,
};
