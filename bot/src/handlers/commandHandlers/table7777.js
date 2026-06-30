'use strict';

const { EmbedBuilder } = require('discord.js');
const {
  rollTable7777,
  addRoleMap,
  removeRoleMap,
  listRoleMaps,
  getUserProfile,
  getLeaderboard,
  getRandomFreeNumber,
  MAX_NUMBER,
} = require('../../systems/table7777');
const logger = require('../../utils/logger');

function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} seconde${s > 1 ? 's' : ''}`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m} min ${rest}s` : `${m} min`;
}

/**
 * /7777 roll
 */
async function handleRoll(interaction) {
  try {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const result = await rollTable7777(userId, guildId);

    if (result.cooldown) {
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('⏱️ Cooldown')
        .setDescription(`Tu dois attendre encore **${formatMs(result.remainingMs)}** avant de retenter.`);
      return interaction.editReply({ embeds: [embed] });
    }

    const { number, roleEntry, isNewRole, alreadyHasRole, totalRolls } = result;

    let embed;

    if (isNewRole) {
      // Nouveau rôle obtenu !
      embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🌟 Tirage de la table — JACKPOT ! 🌟')
        .setDescription(`Tu as tiré le **${number}** !\n\n🎭 Tu obtiens le rôle <@&${roleEntry.roleId}> !`);

      // Attribution du rôle
      try {
        const member = await interaction.guild.members.fetch(userId);
        await member.roles.add(roleEntry.roleId);
      } catch (err) {
        logger.error('Table7777', 'Erreur attribution rôle', err);
        embed.addFields({ name: '⚠️ Attention', value: "Le rôle n'a pas pu être attribué automatiquement (vérifie la hiérarchie des rôles du bot)." });
      }
    } else if (alreadyHasRole) {
      embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🎲 Tirage de la table')
        .setDescription(`Tu as tiré le **${number}**.\n\nTu possèdes déjà le rôle <@&${roleEntry.roleId}> lié à ce chiffre.`);
    } else {
      embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('🎲 Tirage de la table')
        .setDescription(`Rien cette fois.\nTu as tiré le **${number}**.\n\nT'as vraiment le don pour rater hein 🥲.`);
    }

    embed.setFooter({ text: `${interaction.user.username} — ${number} / ${MAX_NUMBER} • Retentez dans 30 secondes.` });

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleRoll', err);
    return interaction.editReply({ content: '❌ Une erreur est survenue.' });
  }
}

/**
 * /7777 collection
 */
async function handleCollection(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const profile = await getUserProfile(interaction.user.id, interaction.guildId);

    if (!profile || profile.totalRolls === 0) {
      const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('📚 Ta collection 7777')
        .setDescription("Tu n'as encore jamais tiré la table ! Utilise `/7777 roll` pour commencer.");
      return interaction.editReply({ embeds: [embed] });
    }

    const rolesText = profile.rolesObtained.length
      ? profile.rolesObtained.map(id => `<@&${id}>`).join(', ')
      : 'Aucun rôle obtenu pour le moment.';

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('📚 Ta collection 7777')
      .addFields(
        { name: '🎲 Tirages effectués', value: `${profile.totalRolls}`, inline: true },
        { name: '🎭 Rôles obtenus', value: `${profile.rolesObtained.length}`, inline: true },
        { name: '📋 Liste des rôles', value: rolesText },
      );

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleCollection', err);
    return interaction.editReply({ content: '❌ Une erreur est survenue.' });
  }
}

/**
 * /7777 leaderboard
 */
async function handleLeaderboard(interaction) {
  try {
    await interaction.deferReply();

    const top = await getLeaderboard(interaction.guildId);

    if (!top.length) {
      const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('🏆 Classement 7777')
        .setDescription('Personne n\'a encore tiré la table sur ce serveur !');
      return interaction.editReply({ embeds: [embed] });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} <@${u.userId}> — ${u.totalRolls} tirage${u.totalRolls > 1 ? 's' : ''} • ${u.rolesObtained.length} rôle${u.rolesObtained.length > 1 ? 's' : ''}`;
    });

    const embed = new EmbedBuilder()
      .setColor('#F1C40F')
      .setTitle('🏆 Classement 7777')
      .setDescription(lines.join('\n'));

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleLeaderboard', err);
    return interaction.editReply({ content: '❌ Une erreur est survenue.' });
  }
}

/**
 * /7777 setup — Définir le salon dédié
 */
async function handleSetup(interaction) {
  try {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Tu dois être administrateur pour configurer le salon 7777.', ephemeral: true });
    }

    const salon = interaction.options.getChannel('salon');
    const ConfigModel = require('../../db/models/Config');

    await ConfigModel.findOneAndUpdate(
      { guildId: interaction.guildId },
      { $set: { table7777ChannelId: salon.id } },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setColor('#7B68EE')
      .setTitle('✅ Salon 7777 configuré !')
      .setDescription(`Le salon ${salon} est maintenant dédié à la roulette \`/7777 roll\`.\n\nLes membres ne pourront faire des tirages que dans ce salon.`)
      .setFooter({ text: 'Configuration 7777 mise à jour' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleSetup', err);
    return interaction.reply({ content: '❌ Erreur lors de la configuration.', ephemeral: true });
  }
}

/**
 * /7777 addrole — Lier un chiffre à un rôle (Admin)
 */
async function handleAddRole(interaction) {
  try {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Tu dois être administrateur pour configurer les rôles 7777.', ephemeral: true });
    }

    const role = interaction.options.getRole('role');
    let number = interaction.options.getInteger('chiffre');
    let wasRandom = false;

    if (number === null) {
      // Pas de chiffre précisé → on en tire un libre au hasard
      number = await getRandomFreeNumber(interaction.guildId);
      wasRandom = true;

      if (number === null) {
        return interaction.reply({ content: '❌ Tous les chiffres entre 1 et 7777 sont déjà attribués !', ephemeral: true });
      }
    } else if (number < 1 || number > MAX_NUMBER) {
      return interaction.reply({ content: `❌ Le chiffre doit être entre 1 et ${MAX_NUMBER}.`, ephemeral: true });
    } else {
      // Vérifier que le chiffre choisi n'est pas déjà pris par un autre rôle
      const existing = await listRoleMaps(interaction.guildId);
      const conflict = existing.find(m => m.number === number && m.roleId !== role.id);
      if (conflict) {
        return interaction.reply({ content: `❌ Le chiffre **${number}** est déjà lié à <@&${conflict.roleId}>. Choisis-en un autre ou utilise \`/7777 removerole\` d'abord.`, ephemeral: true });
      }
    }

    await addRoleMap(interaction.guildId, number, role.id, role.name);

    const embed = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('✅ Lien ajouté !')
      .setDescription(
        wasRandom
          ? `Un chiffre aléatoire **${number}** a été attribué au rôle ${role}.\nLes membres devront tirer ce chiffre avec \`/7777 roll\` pour l'obtenir.`
          : `Le chiffre **${number}** donne maintenant le rôle ${role} lors d'un tirage \`/7777 roll\`.`
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleAddRole', err);
    return interaction.reply({ content: '❌ Erreur lors de l\'ajout du rôle.', ephemeral: true });
  }
}

/**
 * /7777 removerole — Supprimer un lien (Admin)
 */
async function handleRemoveRole(interaction) {
  try {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Tu dois être administrateur pour configurer les rôles 7777.', ephemeral: true });
    }

    const number = interaction.options.getInteger('chiffre');
    const deleted = await removeRoleMap(interaction.guildId, number);

    if (!deleted) {
      return interaction.reply({ content: `❌ Aucun rôle n'est lié au chiffre **${number}**.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🗑️ Lien supprimé')
      .setDescription(`Le chiffre **${number}** ne donne plus de rôle.`);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleRemoveRole', err);
    return interaction.reply({ content: '❌ Erreur lors de la suppression.', ephemeral: true });
  }
}

/**
 * /7777 roles — Liste tous les chiffres spéciaux et leurs rôles
 */
async function handleListRoles(interaction) {
  try {
    await interaction.deferReply();

    const maps = await listRoleMaps(interaction.guildId);

    if (!maps.length) {
      const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('🎭 Rôles 7777')
        .setDescription("Aucun rôle n'est encore lié à un chiffre sur ce serveur.\nUn admin peut en ajouter avec `/7777 addrole`.");
      return interaction.editReply({ embeds: [embed] });
    }

    const lines = maps.map(m => `**${m.number}** → <@&${m.roleId}>`);

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🎭 Rôles 7777')
      .setDescription(`Tire ces chiffres avec \`/7777 roll\` pour débloquer le rôle correspondant !\n\n${lines.join('\n')}`);

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error('Table7777', 'Erreur handleListRoles', err);
    return interaction.editReply({ content: '❌ Une erreur est survenue.' });
  }
}

module.exports = {
  handleRoll,
  handleCollection,
  handleLeaderboard,
  handleSetup,
  handleAddRole,
  handleRemoveRole,
  handleListRoles,
};
