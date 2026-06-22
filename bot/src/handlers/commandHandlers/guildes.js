// src/handlers/commandHandlers/guildes.js — /guilde
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../../config/constants');
const { safeReply }      = require('../../utils/permissions');
const Guild              = require('../../db/models/Guild');
const User               = require('../../db/models/User');

module.exports = {
  async handle(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const sub    = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'creer') {
      const nom   = interaction.options.getString('nom');
      const emoji = interaction.options.getString('emoji') || '⚔️';
      const existing = await Guild.findOne({ guildId, nom });
      if (existing) return interaction.editReply({ content: `❌ Une guilde nommée **${nom}** existe déjà.` });
      await Guild.create({ guildId, nom, emoji, chefId: interaction.user.id, membres: [interaction.user.id] });
      await User.updateOne({ userId: interaction.user.id, guildId }, { team: nom }, { upsert: true });
      return interaction.editReply({ content: `✅ Guilde **${emoji} ${nom}** créée ! Tu en es le chef.` });
    }

    if (sub === 'rejoindre') {
      const nom = interaction.options.getString('nom');
      const guilde = await Guild.findOne({ guildId, nom });
      if (!guilde) return interaction.editReply({ content: `❌ Guilde **${nom}** introuvable.` });
      if (guilde.membres.includes(interaction.user.id)) return interaction.editReply({ content: `❌ Tu es déjà dans cette guilde.` });
      const ancien = await Guild.findOne({ guildId, membres: interaction.user.id });
      if (ancien) {
        ancien.membres = ancien.membres.filter(id => id !== interaction.user.id);
        await ancien.save();
      }
      guilde.membres.push(interaction.user.id);
      await guilde.save();
      await User.updateOne({ userId: interaction.user.id, guildId }, { team: nom }, { upsert: true });
      return interaction.editReply({ content: `✅ Tu as rejoint la guilde **${guilde.emoji} ${nom}** !` });
    }

    if (sub === 'quitter') {
      const guilde = await Guild.findOne({ guildId, membres: interaction.user.id });
      if (!guilde) return interaction.editReply({ content: `❌ Tu n'es dans aucune guilde.` });
      guilde.membres = guilde.membres.filter(id => id !== interaction.user.id);
      await guilde.save();
      await User.updateOne({ userId: interaction.user.id, guildId }, { team: null });
      return interaction.editReply({ content: `✅ Tu as quitté la guilde **${guilde.emoji} ${guilde.nom}**.` });
    }

    if (sub === 'info') {
      const nom = interaction.options.getString('nom');
      const guilde = nom
        ? await Guild.findOne({ guildId, nom })
        : await Guild.findOne({ guildId, membres: interaction.user.id });
      if (!guilde) return interaction.editReply({ content: `❌ Guilde introuvable.` });

      const embed = new EmbedBuilder()
        .setColor(COLORS.GOLD || 0xFFD700)
        .setTitle(`${guilde.emoji} ${guilde.nom}`)
        .addFields(
          { name: '👑 Chef',     value: `<@${guilde.chefId}>`,       inline: true },
          { name: '👥 Membres', value: `${guilde.membres.length}`,   inline: true },
          { name: '⭐ XP',       value: `${guilde.xp}`,              inline: true },
          { name: '🏅 Top membres', value: guilde.membres.slice(0, 5).map(id => `<@${id}>`).join(', ') || '—', inline: false },
        )
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'classement') {
      const guildes = await Guild.find({ guildId }).sort({ xp: -1 }).limit(10);
      if (!guildes.length) return interaction.editReply({ content: '❌ Aucune guilde créée.' });
      const lines = guildes.map((g, i) => `**${i + 1}.** ${g.emoji} **${g.nom}** — ${g.xp} XP — ${g.membres.length} membres`);
      const embed = new EmbedBuilder()
        .setColor(COLORS.GOLD || 0xFFD700)
        .setTitle('⚔️ Classement des Guildes')
        .setDescription(lines.join('\n'))
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
  }
};
