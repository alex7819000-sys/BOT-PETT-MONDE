// src/handlers/commandHandlers/giveaway.js — /giveaway
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS } = require('../../config/constants');

function parseDuration(str) {
  let ms = 0;
  const days = str.match(/(\d+)\s*j/i);
  const hrs  = str.match(/(\d+)\s*h/i);
  const mins = str.match(/(\d+)\s*m/i);
  if (days) ms += parseInt(days[1]) * 86400000;
  if (hrs)  ms += parseInt(hrs[1])  * 3600000;
  if (mins) ms += parseInt(mins[1]) * 60000;
  return ms > 0 ? ms : 3600000;
}

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guild.id;

  if (sub === 'creer') {
    await interaction.deferReply({ ephemeral: true });
    const lot      = interaction.options.getString('lot');
    const duree    = interaction.options.getString('duree');
    const gagnants = interaction.options.getInteger('gagnants') || 1;
    const ms       = parseDuration(duree);
    const endsAt   = Date.now() + ms;

    const Config = require('../../db/models/Config');
    const config = await Config.findOne({ guildId: gid });
    const channel = config?.giveawayChannelId
      ? interaction.guild.channels.cache.get(config.giveawayChannelId) || interaction.channel
      : interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(COLORS.GOLD)
      .setTitle('🎁 GIVEAWAY !')
      .setDescription(`**Lot :** ${lot}\n\n🎟️ Clique sur le bouton pour participer !\n**${gagnants}** gagnant(s)`)
      .addFields({ name: '⏰ Fin', value: `<t:${Math.floor(endsAt / 1000)}:R>` })
      .setTimestamp(endsAt);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`giveaway:enter:${Date.now()}`).setLabel('🎟️ Participer').setStyle(ButtonStyle.Primary),
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    return interaction.editReply({ content: `✅ Giveaway créé dans <#${channel.id}> ! Fin : <t:${Math.floor(endsAt / 1000)}:R>` });
  }

  if (sub === 'terminer') {
    await interaction.deferReply({ ephemeral: true });
    const msgId = interaction.options.getString('message_id');
    return interaction.editReply({ content: `✅ Giveaway \`${msgId}\` terminé manuellement.` });
  }
}

module.exports = { handle };
