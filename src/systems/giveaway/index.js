// src/systems/giveaway/index.js — Style Mudae (embed sombre, champs détaillés) — v5
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Giveaway = require('../../db/models/Giveaway');
const Config   = require('../../db/models/Config');
const User     = require('../../db/models/User');
const logger   = require('../../utils/logger');

// ── Formatage durée humaine ───────────────────────────────────────────────
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s} seconde${s > 1 ? 's' : ''}`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m} minute${m > 1 ? 's' : ''}`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h} heure${h > 1 ? 's' : ''}`;
  const d = Math.floor(h / 24);
  return `${d} jour${d > 1 ? 's' : ''}`;
}

function formatDate(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function formatRelative(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

// ── Embed en cours ────────────────────────────────────────────────────────
function buildActiveEmbed(giveaway) {
  const totalTickets   = [...giveaway.participants.values()].reduce((a, b) => a + b, 0);
  const participantCount = giveaway.participants.size;

  return new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle(`🎁 GIVEAWAY — ${giveaway.prize}`)
    .addFields(
      { name: 'Participants',     value: `${participantCount}`,    inline: true },
      { name: 'Entrées totales',  value: `${totalTickets}`,        inline: true },
      { name: 'Gagnant(s)',       value: `${giveaway.winnerCount}`, inline: true },
      { name: 'Se termine',       value: `${formatDate(giveaway.endsAt)}\n${formatRelative(giveaway.endsAt)}`, inline: false },
    )
    .setFooter({ text: `Clique sur 🎟️ pour participer  •  Organisé par` })
    .setTimestamp(giveaway.endsAt);
}

// ── Embed terminé (style screenshot Mudae) ────────────────────────────────
function buildEndedEmbed(giveaway, guild) {
  const totalTickets    = [...giveaway.participants.values()].reduce((a, b) => a + b, 0);
  const participantCount = giveaway.participants.size;

  const winnersValue = giveaway.winners.length > 0
    ? giveaway.winners.map(id => `<@${id}>`).join('\n')
    : '*Aucun participant*';

  // Pseudo de l'organisateur (résolu dynamiquement si possible)
  const organiserValue = giveaway.hostedBy ? `<@${giveaway.hostedBy}>` : '*Inconnu*';

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`GIVEAWAY TERMINÉ — ${giveaway.prize}`)
    .addFields(
      { name: 'Gagnant(s)',      value: winnersValue,                inline: false },
      { name: 'Participants',    value: `${participantCount}`,       inline: true  },
      { name: 'Entrées totales', value: `${totalTickets}`,           inline: true  },
      { name: 'Terminé',         value: `${formatDate(giveaway.endsAt)}`, inline: false },
      { name: 'Organisé par',    value: organiserValue,              inline: false },
    )
    .setFooter({ text: 'Le tirage au sort est terminé. Merci à tous les participants !' })
    .setTimestamp();

  return embed;
}

// ── Bouton participer ─────────────────────────────────────────────────────
function buildButton(ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_enter')
      .setLabel(ended ? 'Terminé' : '🎟️ Participer')
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended),
  );
}

// ── Créer un giveaway ─────────────────────────────────────────────────────
async function createGiveaway(interaction, prize, durationMinutes, winnerCount) {
  try {
    const cfg = await Config.findOne({ guildId: interaction.guildId });
    const channelId = cfg?.giveawayChannelId || interaction.channelId;
    const channel   = await interaction.guild.channels.fetch(channelId).catch(() => interaction.channel);

    const endsAt  = new Date(Date.now() + durationMinutes * 60 * 1000);
    const giveaway = await Giveaway.create({
      guildId:     interaction.guildId,
      channelId:   channel.id,
      prize,
      winnerCount,
      endsAt,
      hostedBy:    interaction.user.id,
    });

    // Ping rôle giveaway si configuré
    const ping = cfg?.giveawayRoleId ? `<@&${cfg.giveawayRoleId}>` : '';

    const msg = await channel.send({
      content:    ping || undefined,
      embeds:     [buildActiveEmbed(giveaway)],
      components: [buildButton()],
    });

    giveaway.messageId = msg.id;
    await giveaway.save();

    const delay = endsAt - Date.now();
    setTimeout(() => endGiveaway(giveaway._id, interaction.guild), Math.max(delay, 1000));

    return { success: true, channel };
  } catch (err) {
    logger.error('[Giveaway] createGiveaway:', err);
    return { success: false };
  }
}

// ── Participer ────────────────────────────────────────────────────────────
async function handleEnter(interaction) {
  try {
    const giveaway = await Giveaway.findOne({
      guildId:   interaction.guildId,
      messageId: interaction.message.id,
      ended:     false,
    });

    if (!giveaway) {
      return interaction.reply({ content: '❌ Ce giveaway est terminé.', ephemeral: true });
    }

    const userId  = interaction.user.id;
    const user    = await User.findOne({ userId, guildId: interaction.guildId });
    const tickets = Math.max(1, user?.giveawayTickets || 1);

    if (giveaway.participants.get(userId)) {
      return interaction.reply({
        content: `✅ Tu participes déjà avec **${giveaway.participants.get(userId)} ticket(s)**.`,
        ephemeral: true,
      });
    }

    giveaway.participants.set(userId, tickets);
    await giveaway.save();

    // Mettre à jour l'embed avec les nouveaux compteurs
    try {
      await interaction.message.edit({ embeds: [buildActiveEmbed(giveaway)] });
    } catch (_) {}

    await interaction.reply({
      content: `🎟️ Tu participes avec **${tickets} ticket(s)** !${tickets === 1 ? '\n*Complète des missions pour plus de tickets !*' : ''}`,
      ephemeral: true,
    });
  } catch (err) {
    logger.error('[Giveaway] handleEnter:', err);
  }
}

// ── Terminer un giveaway ──────────────────────────────────────────────────
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
    const seen    = new Set();
    const needed  = Math.min(giveaway.winnerCount, new Set(pool).size);

    while (winners.length < needed && seen.size < pool.length * 3) {
      const idx    = Math.floor(Math.random() * pool.length);
      const winner = pool[idx];
      seen.add(idx);
      if (!winners.includes(winner)) winners.push(winner);
    }

    giveaway.winners = winners;
    await giveaway.save();

    // Mettre à jour le message
    try {
      const channel = await guild.channels.fetch(giveaway.channelId);
      const msg     = await channel.messages.fetch(giveaway.messageId);

      await msg.edit({
        embeds:     [buildEndedEmbed(giveaway, guild)],
        components: [buildButton(true)],
      });

      // Message de félicitations
      if (winners.length > 0) {
        const mention = winners.map(id => `<@${id}>`).join(', ');
        await channel.send(`🎉 Félicitations ${mention} ! Vous avez gagné **${giveaway.prize}** !`);
      } else {
        await channel.send(`😔 Personne n'a participé au giveaway **${giveaway.prize}**. Dommage !`);
      }
    } catch (err) {
      logger.error('[Giveaway] edit message failed:', err);
    }
  } catch (err) {
    logger.error('[Giveaway] endGiveaway:', err);
  }
}

// ── Replanifier au démarrage ──────────────────────────────────────────────
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
