'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Giveaway = require('../../db/models/Giveaway');
const User = require('../../db/models/User');
const logger = require('../../utils/logger');

function buildEmbed(giveaway, ended = false) {
  const totalTickets = [...giveaway.participants.values()].reduce((a, b) => a + b, 0);
  const participantCount = giveaway.participants.size;

  const embed = new EmbedBuilder()
    .setColor(ended ? 0x95a5a6 : 0xf1c40f)
    .setTitle(ended ? '🎉 Giveaway terminé !' : '🎁 GIVEAWAY')
    .addFields(
      { name: '🏆 Lot', value: giveaway.prize, inline: true },
      { name: '🎟️ Participants', value: `${participantCount} membres (${totalTickets} tickets)`, inline: true },
      { name: '👑 Gagnants', value: `${giveaway.winnerCount}`, inline: true },
    )
    .setTimestamp(ended ? new Date() : giveaway.endsAt)
    .setFooter({ text: ended ? 'Terminé' : `Se termine le` });

  if (ended && giveaway.winners.length > 0) {
    embed.addFields({ name: '🥳 Gagnant(s)', value: giveaway.winners.map(id => `<@${id}>`).join(', ') });
  }

  return embed;
}

function buildButton(ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel(ended ? 'Terminé' : '🎟️ Participer')
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended)
  );
}

async function createGiveaway(interaction, prize, durationMinutes, winnerCount) {
  try {
    const config = require('../../db/models/Config');
    const cfg = await config.findOne({ guildId: interaction.guildId });
    const channelId = cfg?.giveawayChannelId || interaction.channelId;
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => interaction.channel);

    const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    const giveaway = await Giveaway.create({
      guildId: interaction.guildId,
      channelId: channel.id,
      prize,
      winnerCount,
      endsAt,
      hostedBy: interaction.user.id,
    });

    const msg = await channel.send({
      embeds: [buildEmbed(giveaway)],
      components: [buildButton()],
    });

    giveaway.messageId = msg.id;
    await giveaway.save();

    // Scheduler fin
    const delay = endsAt - Date.now();
    setTimeout(() => endGiveaway(giveaway._id, interaction.guild), delay);

    return { success: true, channel };
  } catch (err) {
    logger.error('[Giveaway] createGiveaway:', err);
    return { success: false };
  }
}

async function handleEnter(interaction) {
  try {
    const giveaway = await Giveaway.findOne({
      guildId: interaction.guildId,
      messageId: interaction.message.id,
      ended: false,
    });

    if (!giveaway) {
      return interaction.reply({ content: '❌ Ce giveaway est terminé.', ephemeral: true });
    }

    const userId = interaction.user.id;
    const user = await User.findOne({ userId, guildId: interaction.guildId });
    const tickets = Math.max(1, user ? user.giveawayTickets : 1);

    if (giveaway.participants.get(userId)) {
      return interaction.reply({
        content: `✅ Tu participes déjà avec **${giveaway.participants.get(userId)} ticket(s)**.`,
        ephemeral: true
      });
    }

    giveaway.participants.set(userId, tickets);
    await giveaway.save();

    await interaction.reply({
      content: `🎟️ Tu participes avec **${tickets} ticket(s)** ! (${tickets > 1 ? 'Missions complétées cette semaine' : 'Complète des missions pour plus de tickets'})`,
      ephemeral: true
    });
  } catch (err) {
    logger.error('[Giveaway] handleEnter:', err);
  }
}

async function endGiveaway(giveawayId, guild) {
  try {
    const giveaway = await Giveaway.findById(giveawayId);
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;

    // Tirage au sort pondéré par tickets
    const pool = [];
    for (const [userId, tickets] of giveaway.participants) {
      for (let i = 0; i < tickets; i++) pool.push(userId);
    }

    const winners = [];
    const usedIndexes = new Set();
    const needed = Math.min(giveaway.winnerCount, new Set(pool).size);

    while (winners.length < needed) {
      const idx = Math.floor(Math.random() * pool.length);
      const winner = pool[idx];
      if (!winners.includes(winner)) winners.push(winner);
      if (usedIndexes.size > pool.length * 2) break;
      usedIndexes.add(idx);
    }

    giveaway.winners = winners;
    await giveaway.save();

    // Mettre à jour le message
    try {
      const channel = await guild.channels.fetch(giveaway.channelId);
      const msg = await channel.messages.fetch(giveaway.messageId);
      await msg.edit({ embeds: [buildEmbed(giveaway, true)], components: [buildButton(true)] });

      // Annonce
      const mention = winners.map(id => `<@${id}>`).join(', ');
      await channel.send(`🎉 Félicitations ${mention} ! Vous avez gagné **${giveaway.prize}** !`);
    } catch {}
  } catch (err) {
    logger.error('[Giveaway] endGiveaway:', err);
  }
}

// Replanifier les giveaways actifs au démarrage
async function rescheduleGiveaways(client) {
  try {
    const actifs = await Giveaway.find({ ended: false });
    for (const g of actifs) {
      const delay = Math.max(0, g.endsAt - Date.now());
      const guild = await client.guilds.fetch(g.guildId).catch(() => null);
      if (guild) setTimeout(() => endGiveaway(g._id, guild), delay);
    }
    if (actifs.length > 0) logger.info(`[Giveaway] ${actifs.length} giveaway(s) replanifié(s)`);
  } catch (err) {
    logger.error('[Giveaway] rescheduleGiveaways:', err);
  }
}

module.exports = { createGiveaway, handleEnter, endGiveaway, rescheduleGiveaways };
