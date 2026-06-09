// src/handlers/commandHandlers/owner.js
'use strict';

const { EmbedBuilder }                              = require('discord.js');
const { safeReply }                                 = require('../../utils/permissions');
const { setCoOwner, removeCoOwner, getMemberLevel,
        applyRolePermissions, getOwnerId, LEVELS }  = require('../../systems/hierarchy');
const { postLog }                                   = require('../../systems/warn');
const Config                                        = require('../../db/models/Config');

module.exports = async function handleOwner(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const callerId = interaction.user.id;
  const ownerId  = getOwnerId();

  // ── Vérification Owner strict ─────────────────────────────────────────────
  const ownerOnlyCommands = ['coowner', 'retirer_coowner', 'reset'];
  if (ownerOnlyCommands.includes(sub) && callerId !== ownerId) {
    return safeReply(interaction, {
      content: '❌ Cette commande est réservée au **Owner** du bot.\n> Hardcodé — aucune exception possible.',
      ephemeral: true,
    });
  }

  const config = await Config.findOne({ guildId });

  // ── /owner coowner @membre ────────────────────────────────────────────────
  if (sub === 'coowner') {
    const target = interaction.options.getMember('membre');
    if (!target) return safeReply(interaction, { content: '❌ Membre introuvable.', ephemeral: true });
    if (target.id === callerId) return safeReply(interaction, { content: '❌ Tu ne peux pas te nommer toi-même.', ephemeral: true });

    const result = await setCoOwner(interaction.guild, target.id, callerId);
    if (!result.ok) return safeReply(interaction, { content: `❌ ${result.reason}`, ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🔱 Co-Owner nommé')
      .setDescription(`<@${target.id}> est maintenant **Co-Owner** du serveur.\n\n> Il peut gérer le staff, la config du bot, et voir tous les logs.\n> Il **ne peut pas** te retirer le rôle Owner ni nommer d'autres Co-Owners.`)
      .setTimestamp();

    await postLog(interaction.guild, config, embed);
    return safeReply(interaction, { embeds: [embed] });
  }

  // ── /owner retirer_coowner @membre ───────────────────────────────────────
  if (sub === 'retirer_coowner') {
    const target = interaction.options.getMember('membre');
    if (!target) return safeReply(interaction, { content: '❌ Membre introuvable.', ephemeral: true });

    const result = await removeCoOwner(interaction.guild, target.id, callerId);
    if (!result.ok) return safeReply(interaction, { content: `❌ ${result.reason}`, ephemeral: true });

    await postLog(interaction.guild, config, new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('🔱 Co-Owner retiré')
      .addFields({ name: '👤 Membre', value: `<@${target.id}>`, inline: true })
      .setTimestamp()
    );

    return safeReply(interaction, { content: `✅ <@${target.id}> retiré du rôle Co-Owner.`, ephemeral: true });
  }

  // ── /owner setrole — configurer les rôles de la hiérarchie ───────────────
  if (sub === 'setrole') {
    // Accessible Co-Owner+
    const level = await getMemberLevel(interaction.member, guildId);
    if (level < LEVELS.CO_OWNER) {
      return safeReply(interaction, { content: '❌ Réservé au Co-Owner et Owner.', ephemeral: true });
    }

    const cle  = interaction.options.getString('cle');
    const role = interaction.options.getRole('role');
    if (!role) return safeReply(interaction, { content: '❌ Rôle introuvable.', ephemeral: true });

    await Config.updateOne({ guildId }, { [cle]: role.id }, { upsert: true });

    // Appliquer automatiquement les permissions Discord sur le rôle
    const roleTypeMap = {
      coOwnerRoleId:   'co_owner',
      adminRoleId:     'admin',
      moderateurRoleId: 'moderateur',
      animateurRoleId:  'animateur',
      technicienRoleId: 'technicien',
    };

    if (roleTypeMap[cle]) {
      await applyRolePermissions(interaction.guild, null, roleTypeMap[cle]);
      return safeReply(interaction, {
        content: `✅ Rôle **${role.name}** configuré comme \`${cle}\`.\n✅ Permissions Discord appliquées automatiquement.`,
        ephemeral: true,
      });
    }

    return safeReply(interaction, { content: `✅ Rôle **${role.name}** configuré comme \`${cle}\`.`, ephemeral: true });
  }

  // ── /owner hierarchie — voir la hiérarchie actuelle ──────────────────────
  if (sub === 'hierarchie') {
    const level = await getMemberLevel(interaction.member, guildId);
    if (level < LEVELS.ADMIN) {
      return safeReply(interaction, { content: '❌ Réservé aux Admins+.', ephemeral: true });
    }

    await interaction.guild.members.fetch();
    const coOwners = config?.coOwnerIds || [];
    const coOwnerList = coOwners.length
      ? coOwners.map(id => `<@${id}>`).join(', ')
      : '*Aucun*';

    const roleField = (key, emoji, label) => {
      const rid = config?.[key];
      if (!rid) return `${emoji} **${label}** — *Non configuré*`;
      const count = interaction.guild.members.cache.filter(m => m.roles.cache.has(rid)).size;
      return `${emoji} **${label}** — <@&${rid}> *(${count} membres)*`;
    };

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('👑 Hiérarchie du serveur')
      .addFields(
        { name: '👑 Owner',      value: `<@${ownerId || 'Non configuré'}>`, inline: false },
        { name: '🔱 Co-Owners',  value: coOwnerList,                        inline: false },
        { name: '⚙️ Rôles configurés', value: [
          roleField('coOwnerRoleId',   '🔱', 'Co-Owner'),
          roleField('adminRoleId',     '⭐', 'Admin'),
          roleField('moderateurRoleId','🛡️', 'Modérateur'),
          roleField('animateurRoleId', '🎨', 'Animateur'),
          roleField('technicienRoleId','🔧', 'Technicien'),
          roleField('staffRoleId',     '👥', 'Staff global'),
        ].join('\n'), inline: false },
      )
      .setTimestamp()
      .setFooter({ text: 'Permissions appliquées automatiquement via /owner setrole' });

    return safeReply(interaction, { embeds: [embed], ephemeral: true });
  }

  // ── /owner applypermissions — réappliquer les permissions Discord ─────────
  if (sub === 'applypermissions') {
    const level = await getMemberLevel(interaction.member, guildId);
    if (level < LEVELS.CO_OWNER) {
      return safeReply(interaction, { content: '❌ Réservé au Co-Owner+.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const types = ['moderateur', 'animateur', 'technicien', 'admin', 'co_owner'];
    let applied = 0;
    for (const t of types) {
      try {
        await applyRolePermissions(interaction.guild, null, t);
        applied++;
      } catch (_) {}
    }

    return interaction.editReply({ content: `✅ Permissions Discord réappliquées sur **${applied}** rôles.` });
  }
};
