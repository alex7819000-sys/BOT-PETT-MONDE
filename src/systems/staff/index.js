// src/systems/staff/index.js
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');

const StaffTicket = require('../../db/models/StaffTicket');
const Config      = require('../../db/models/Config');
const User        = require('../../db/models/User');
const Warn        = require('../../db/models/Warn');
const Presentation = require('../../db/models/Presentation');
const { postLog } = require('../warn');
const logger      = require('../../utils/logger');

// ── Quotas dynamiques par taille de serveur ───────────────────────────────────
function getQuotas(memberCount) {
  if (memberCount <= 100)  return { moderateur: 2, animateur: 1, technicien: 1 };
  if (memberCount <= 250)  return { moderateur: 3, animateur: 2, technicien: 1 };
  if (memberCount <= 500)  return { moderateur: 4, animateur: 3, technicien: 2 };
  if (memberCount <= 1000) return { moderateur: 6, animateur: 4, technicien: 3 };
  if (memberCount <= 2000) return { moderateur: 8, animateur: 5, technicien: 4 };
  return                          { moderateur: 10, animateur: 7, technicien: 5 };
}

// ── Compter les staff actifs par rôle ─────────────────────────────────────────
async function countActiveStaff(guild, config, role) {
  const roleId = config[`${role}RoleId`] || config[`${role}StagiaireRoleId`];
  if (!roleId) return 0;
  try {
    await guild.members.fetch();
    return guild.members.cache.filter(m => m.roles.cache.has(roleId)).size;
  } catch { return 0; }
}

// ── Vérifier les conditions d'admission ──────────────────────────────────────
async function checkAdmission(member, guild, config) {
  const guildId = member.guild.id;
  const user    = await User.findOne({ userId: member.id, guildId });
  const warns   = await Warn.countDocuments({ guildId, userId: member.id, active: true });
  const pres    = await Presentation.findOne({ userId: member.id, guildId, published: true });

  const joinedAt   = member.joinedAt;
  const daysSince  = joinedAt ? Math.floor((Date.now() - joinedAt.getTime()) / 86400000) : 0;
  const msgCount   = user?.messageCount || 0;
  const hasMonkey  = member.roles.cache.has(config?.singeRoleId);

  const checks = [
    { label: 'Messages sur le serveur',   ok: msgCount >= 100,   current: msgCount,  needed: 100  },
    { label: 'Ancienneté (jours)',         ok: daysSince >= 14,   current: daysSince, needed: 14   },
    { label: 'Présentation complète',      ok: !!pres,            current: pres ? 1 : 0, needed: 1 },
    { label: 'Aucun warn actif',           ok: warns === 0,       current: warns,     needed: 0    },
    { label: 'Pas de rôle Singe',          ok: !hasMonkey,        current: hasMonkey ? 1 : 0, needed: 0 },
  ];

  const passed = checks.every(c => c.ok);
  return { checks, passed, user, warns, pres };
}

// ── Poster l'embed d'accueil staff dans #condition-staff ─────────────────────
async function postConditionEmbed(guild, config, gifUrl) {
  const channel = guild.channels.cache.get(config?.staffConditionChannelId);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${guild.name} — Rejoindre le Staff`)
    .setDescription(
      '**Conditions pour rejoindre le staff :**\n\n' +
      '✅ Être actif sur le serveur *(minimum 100 messages, 2 semaines d\'ancienneté)*\n' +
      '✅ Être mature et respectueux *(pas de toxicité)*\n' +
      '✅ Connaître les règles du serveur\n' +
      '✅ Être réactif en cas de problème\n' +
      '✅ Ne pas abuser des permissions\n' +
      '✅ Avoir une présentation complète\n' +
      '✅ Aucun avertissement actif\n\n' +
      '> En cliquant sur le bouton tu acceptes ces conditions et tu rejoins le processus de sélection.'
    )
    .setImage(gifUrl || null);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff:candidater:${guild.id}`)
      .setLabel('💼 Je veux rejoindre le staff')
      .setStyle(ButtonStyle.Primary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await Config.updateOne({ guildId: guild.id }, { staffConditionMessageId: msg.id });
  return msg;
}

// ── Bouton "Je candidate" cliqué ─────────────────────────────────────────────
async function handleCandidater(interaction, client) {
  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });
  const member  = interaction.member;

  await interaction.deferReply({ ephemeral: true });

  // Vérifier si un ticket est déjà ouvert
  const existing = await StaffTicket.findOne({ guildId, userId: member.id, status: { $in: ['pending', 'taken', 'trial'] } });
  if (existing) {
    return interaction.editReply({ content: `❌ Tu as déjà une candidature en cours dans <#${existing.channelId}>.` });
  }

  // Vérifier les conditions
  const { checks, passed } = await checkAdmission(member, interaction.guild, config);
  if (!passed) {
    const lines = checks.map(c => `${c.ok ? '✅' : '❌'} **${c.label}** : ${c.current}/${c.needed}`);
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Conditions non remplies')
      .setDescription('Tu ne remplis pas encore toutes les conditions :\n\n' + lines.join('\n') + '\n\n> Reviens quand tu auras tout complété !')
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // Conditions OK — montrer le salon d'accueil staff ou créer le ticket directement
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Conditions remplies !')
    .setDescription(
      'Bravo, tu remplis toutes les conditions !\n\n' +
      '**Les rôles disponibles :**\n\n' +
      '🛡️ **Modérateur** — gestion des conflits, sanctions, tickets membres\n' +
      '🎨 **Animateur** — events, giveaways, animation du serveur\n' +
      '🔧 **Technicien** — configuration du bot, bugs, support technique\n\n' +
      '> Tu ne peux choisir qu\'**un seul rôle**. Choisis celui qui correspond le mieux à tes compétences.'
    );

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`staff:choix_role:${guildId}`)
      .setPlaceholder('Quel rôle vises-tu ?')
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('🛡️ Modérateur').setValue('moderateur').setDescription('Gestion des conflits et des sanctions'),
        new StringSelectMenuOptionBuilder().setLabel('🎨 Animateur').setValue('animateur').setDescription('Events, giveaways, animation'),
        new StringSelectMenuOptionBuilder().setLabel('🔧 Technicien').setValue('technicien').setDescription('Bot, configuration, support technique'),
      ])
  );

  return interaction.editReply({ embeds: [embed], components: [row] });
}

// ── Sélection du rôle → ouvrir le modal ──────────────────────────────────────
async function handleChoixRole(interaction) {
  const roleWanted = interaction.values[0];
  const guildId    = interaction.guild.id;

  const modals = {
    moderateur: buildModal('moderateur', guildId),
    animateur:  buildModal('animateur',  guildId),
    technicien: buildModal('technicien', guildId),
  };

  await interaction.showModal(modals[roleWanted]);
}

function buildModal(role, guildId) {
  const modal = new ModalBuilder()
    .setCustomId(`staff:modal:${role}:${guildId}`)
    .setTitle(role === 'moderateur' ? '🛡️ Candidature Modérateur' : role === 'animateur' ? '🎨 Candidature Animateur' : '🔧 Candidature Technicien');

  const fields = [
    new TextInputBuilder().setCustomId('age').setLabel('Quel est ton âge ?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10),
    new TextInputBuilder().setCustomId('disponibilite').setLabel('Quelle est ta disponibilité par semaine ?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
    new TextInputBuilder().setCustomId('motivation').setLabel('Pourquoi veux-tu rejoindre le staff ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500),
  ];

  if (role === 'moderateur') {
    fields.push(new TextInputBuilder().setCustomId('experience').setLabel('As-tu de l\'expérience en modération ?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300));
  }
  if (role === 'animateur') {
    fields.push(new TextInputBuilder().setCustomId('idees').setLabel('Quelles idées d\'events aurais-tu ?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300));
  }
  if (role === 'technicien') {
    fields.push(new TextInputBuilder().setCustomId('competences').setLabel('Quelles sont tes compétences techniques ?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300));
  }

  const rows = fields.map(f => new ActionRowBuilder().addComponents(f));
  modal.addComponents(...rows);
  return modal;
}

// ── Soumission du modal → créer le ticket ────────────────────────────────────
async function handleModalStaff(interaction, client) {
  const parts    = interaction.customId.split(':');
  const role     = parts[2];
  const guildId  = parts[3];
  const config   = await Config.findOne({ guildId });
  const member   = interaction.member;
  const guild    = interaction.guild;

  await interaction.deferReply({ ephemeral: true });

  // Vérifier quota
  const memberCount = guild.memberCount;
  const quotas      = getQuotas(memberCount);
  const activeCount = await countActiveStaff(guild, config, role);

  if (activeCount >= quotas[role]) {
    return interaction.editReply({
      content: `❌ Les places de **${role}** sont complètes pour l'instant *(${activeCount}/${quotas[role]})*.\nReprends les conditions plus tard, une place pourrait se libérer !`,
    });
  }

  // Collecter les stats du candidat
  const user = await User.findOne({ userId: member.id, guildId });
  const warns = await Warn.countDocuments({ guildId, userId: member.id, active: true });
  const pres  = await Presentation.findOne({ userId: member.id, guildId, published: true });

  // Créer le salon ticket
  const staffCategoryId = config?.staffCategoryId;
  const ticketChannel   = await guild.channels.create({
    name: `📋-${role.slice(0,3)}-${member.user.username.slice(0, 12).toLowerCase()}`,
    type: ChannelType.GuildText,
    parent: staffCategoryId || null,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id,            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(config?.staffRoleId ? [{ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
    reason: `Candidature staff ${role} — ${member.user.tag}`,
  });

  // Sauvegarder le ticket
  const ticket = await StaffTicket.create({
    guildId,
    userId:    member.id,
    channelId: ticketChannel.id,
    roleWanted: role,
    answers: {
      age:           interaction.fields.getTextInputValue('age')          || null,
      disponibilite: interaction.fields.getTextInputValue('disponibilite')|| null,
      motivation:    interaction.fields.getTextInputValue('motivation')   || null,
      experience:    role === 'moderateur' ? (interaction.fields.getTextInputValue('experience') || null) : null,
      idees:         role === 'animateur'  ? (interaction.fields.getTextInputValue('idees')      || null) : null,
      competences:   role === 'technicien' ? (interaction.fields.getTextInputValue('competences')|| null) : null,
    },
    stats: {
      messageCount:  user?.messageCount || 0,
      weekXp:        user?.weekXp       || 0,
      totalXp:       user?.totalXp      || 0,
      level:         user?.level        || 0,
      joinedAt:      member.joinedAt,
      warnCount:     warns,
      isMonkey:      member.roles.cache.has(config?.singeRoleId || ''),
      hasPresentation: !!pres,
    },
  });

  const roleEmoji = { moderateur: '🛡️', animateur: '🎨', technicien: '🔧' };
  const daysSince = member.joinedAt ? Math.floor((Date.now() - member.joinedAt.getTime()) / 86400000) : 0;

  // Embed fiche dans le ticket
  const ficheEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${roleEmoji[role]} Candidature ${role.charAt(0).toUpperCase() + role.slice(1)}`)
    .setThumbnail(member.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '👤 Candidat',        value: `<@${member.id}> \`${member.user.tag}\``,    inline: true  },
      { name: '📅 Ancienneté',      value: `${daysSince} jours`,                         inline: true  },
      { name: '💬 Messages',        value: `${user?.messageCount || 0}`,                 inline: true  },
      { name: '⭐ Niveau',          value: `${user?.level || 0} *(${user?.totalXp || 0} XP total)*`, inline: true },
      { name: '⚠️ Warns actifs',    value: `${warns}`,                                   inline: true  },
      { name: '🐒 Rôle Singe',      value: ticket.stats.isMonkey ? '⚠️ Oui' : '✅ Non', inline: true  },
      { name: '📋 Présentation',    value: pres ? '✅ Complète' : '❌ Manquante',         inline: true  },
      { name: '\u200b',             value: '\u200b',                                      inline: false },
      { name: '🎂 Âge',            value: ticket.answers.age || '*Non renseigné*',       inline: true  },
      { name: '⏰ Disponibilité',   value: ticket.answers.disponibilite || '*Non renseigné*', inline: true },
      { name: '💡 Motivation',      value: ticket.answers.motivation || '*Non renseignée*', inline: false },
    );

  if (role === 'moderateur' && ticket.answers.experience) {
    ficheEmbed.addFields({ name: '🛡️ Expérience modération', value: ticket.answers.experience, inline: false });
  }
  if (role === 'animateur' && ticket.answers.idees) {
    ficheEmbed.addFields({ name: '🎨 Idées d\'events', value: ticket.answers.idees, inline: false });
  }
  if (role === 'technicien' && ticket.answers.competences) {
    ficheEmbed.addFields({ name: '🔧 Compétences techniques', value: ticket.answers.competences, inline: false });
  }

  ficheEmbed
    .addFields({ name: '📊 Places disponibles', value: `${activeCount}/${quotas[role]} ${role}s actifs`, inline: true })
    .setTimestamp()
    .setFooter({ text: `ID Ticket: ${ticket._id}` });

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`staff:prendre:${ticket._id}`).setLabel('✋ Je prends en charge').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`staff:attente:${ticket._id}`).setLabel('🕐 Mettre en attente').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`staff:refuser:${ticket._id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );

  // Ping staff
  const staffMention = config?.staffRoleId ? `<@&${config.staffRoleId}>` : '@Staff';
  await ticketChannel.send({
    content: `${staffMention} Nouvelle candidature **${role}** de <@${member.id}> !`,
    embeds: [ficheEmbed],
    components: [actionsRow],
  });

  // Log
  await postLog(guild, config, new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📋 Nouvelle candidature staff`)
    .addFields(
      { name: '👤 Candidat', value: `<@${member.id}>`, inline: true },
      { name: '🎯 Rôle visé', value: role, inline: true },
      { name: '📌 Ticket', value: `<#${ticketChannel.id}>`, inline: true },
    )
    .setTimestamp()
  );

  return interaction.editReply({
    content: `✅ Ta candidature a été soumise ! Ton ticket : <#${ticketChannel.id}>\nUn membre du staff va te prendre en charge rapidement.`,
  });
}

// ── Staff prend en charge ─────────────────────────────────────────────────────
async function handlePrendre(interaction) {
  const ticketId = interaction.customId.split(':')[2];
  const ticket   = await StaffTicket.findById(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });
  if (ticket.status !== 'pending') return interaction.reply({ content: '❌ Ce ticket est déjà pris en charge.', ephemeral: true });

  ticket.status  = 'taken';
  ticket.takenBy = interaction.user.id;
  await ticket.save();

  // Score staff : +15 pts pour avoir traité une candidature
  try {
    const { addStaffPoints } = require('../kingstaff');
    await addStaffPoints(interaction.user.id, interaction.guild.id, 'CANDIDATURE_TRAITEE');
  } catch (_) {}

  await interaction.message.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`staff:accepter:${ticketId}`).setLabel('✅ Accepter en période d\'essai').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`staff:refuser:${ticketId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`staff:attente:${ticketId}`).setLabel('🕐 Mettre en attente').setStyle(ButtonStyle.Secondary),
    )],
  });

  return interaction.reply({ content: `✋ <@${interaction.user.id}> prend en charge cette candidature.` });
}

// ── Accepter en période d'essai ───────────────────────────────────────────────
async function handleAccepter(interaction, client) {
  const ticketId = interaction.customId.split(':')[2];
  const ticket   = await StaffTicket.findById(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

  const config  = await Config.findOne({ guildId: ticket.guildId });
  const guild   = interaction.guild;
  const member  = await guild.members.fetch(ticket.userId).catch(() => null);
  if (!member) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });

  // Attribuer le rôle stagiaire
  const stagiaireRoleId = config?.[`${ticket.roleWanted}StagiaireRoleId`];
  const staffRoleId     = config?.staffRoleId;
  if (stagiaireRoleId) await member.roles.add(stagiaireRoleId).catch(() => {});
  if (staffRoleId)     await member.roles.add(staffRoleId).catch(() => {});

  // Mettre à jour le ticket
  const trialDays = config?.trialDays || 14;
  ticket.status      = 'trial';
  ticket.parrainId   = interaction.user.id;
  ticket.trialStartAt = new Date();
  ticket.trialEndAt   = new Date(Date.now() + trialDays * 86400000);
  await ticket.save();

  const roleEmoji = { moderateur: '🛡️', animateur: '🎨', technicien: '🔧' };

  // DM au candidat
  try {
    const dm = await member.createDM();
    await dm.send({ embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`🎉 Candidature acceptée — Période d'essai`)
      .setDescription(
        `Félicitations ! Ta candidature **${ticket.roleWanted}** a été acceptée sur **${guild.name}** !\n\n` +
        `Tu es maintenant en **période d'essai de ${trialDays} jours**.\n` +
        `Ton parrain est <@${interaction.user.id}> — il t'accompagnera tout au long.\n\n` +
        `> À la fin de la période d'essai, ton parrain validera ta promotion au rôle final.`
      )
      .setTimestamp()
    ]});
  } catch (_) {}

  await interaction.message.edit({ components: [] });
  await interaction.reply({
    content: `✅ <@${member.id}> accepté en période d'essai ${roleEmoji[ticket.roleWanted]} !\n` +
             `Parrain : <@${interaction.user.id}> | Fin essai : <t:${Math.floor(ticket.trialEndAt.getTime()/1000)}:R>`,
  });

  // Satisfaction DM — demande au candidat de noter l'expérience
  try {
    const { sendSatisfactionDM } = require('../reputation');
    await sendSatisfactionDM(member, interaction.user.id, 'Candidature Staff', interaction.guild);
  } catch (_) {}

  // Log
  await postLog(guild, config, new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Candidature acceptée — Période d\'essai')
    .addFields(
      { name: '👤 Stagiaire', value: `<@${member.id}>`,            inline: true },
      { name: '🎯 Rôle',     value: ticket.roleWanted,             inline: true },
      { name: '👨‍🏫 Parrain', value: `<@${interaction.user.id}>`,   inline: true },
      { name: '⏳ Durée',    value: `${trialDays} jours`,           inline: true },
    )
    .setTimestamp()
  );
}

// ── Refuser ───────────────────────────────────────────────────────────────────
async function handleRefuser(interaction) {
  const ticketId = interaction.customId.split(':')[2];

  const modal = new ModalBuilder()
    .setCustomId(`staff:modal_refus:${ticketId}`)
    .setTitle('❌ Raison du refus')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('raison')
        .setLabel('Raison du refus (envoyée au candidat)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500)
    ));

  await interaction.showModal(modal);
}

async function handleModalRefus(interaction) {
  const ticketId = interaction.customId.split(':')[2];
  const raison   = interaction.fields.getTextInputValue('raison');
  const ticket   = await StaffTicket.findById(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

  const config = await Config.findOne({ guildId: ticket.guildId });
  const guild  = interaction.guild;
  const member = await guild.members.fetch(ticket.userId).catch(() => null);

  ticket.status       = 'refused';
  ticket.refuseReason = raison;
  await ticket.save();

  // DM au candidat
  if (member) {
    try {
      const dm = await member.createDM();
      await dm.send({ embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Candidature refusée')
        .setDescription(
          `Ta candidature **${ticket.roleWanted}** sur **${guild.name}** a été refusée.\n\n` +
          `**Raison :** ${raison}\n\n` +
          `> Tu pourras recandidater plus tard. Bon courage !`
        )
        .setTimestamp()
      ]});
    } catch (_) {}
  }

  await interaction.deferUpdate();

  // Archiver le ticket après 10s
  setTimeout(async () => {
    try {
      const channel = guild.channels.cache.get(ticket.channelId);
      if (channel) {
        const archiveCategoryId = config?.staffArchiveCategoryId;
        if (archiveCategoryId) {
          await channel.setParent(archiveCategoryId, { lockPermissions: false });
          await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false });
        } else {
          await channel.delete('Candidature refusée');
        }
      }
    } catch (_) {}
  }, 10000);

  await interaction.followUp({ content: `❌ Candidature refusée. Raison envoyée à <@${ticket.userId}> en DM. Ticket archivé dans 10s.` });

  await postLog(guild, config, new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('❌ Candidature refusée')
    .addFields(
      { name: '👤 Candidat',  value: `<@${ticket.userId}>`,        inline: true },
      { name: '🎯 Rôle',     value: ticket.roleWanted,             inline: true },
      { name: '❌ Par',      value: `<@${interaction.user.id}>`,   inline: true },
      { name: '📋 Raison',   value: raison,                         inline: false },
    )
    .setTimestamp()
  );
}

// ── Mettre en attente ─────────────────────────────────────────────────────────
async function handleAttente(interaction) {
  const ticketId = interaction.customId.split(':')[2];
  const ticket   = await StaffTicket.findById(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket introuvable.', ephemeral: true });

  ticket.status = 'waiting';
  await ticket.save();

  await interaction.reply({ content: `🕐 Candidature mise en attente par <@${interaction.user.id}>.` });
}

// ── Valider la fin de période d'essai (/staff valider) ───────────────────────
async function validerStaff(interaction) {
  const target  = interaction.options.getMember('membre');
  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });

  const ticket = await StaffTicket.findOne({ guildId, userId: target.id, status: 'trial' });
  if (!ticket) return interaction.reply({ content: `❌ Aucune période d'essai en cours pour <@${target.id}>.`, ephemeral: true });

  const roleId          = config?.[`${ticket.roleWanted}RoleId`];
  const stagiaireRoleId = config?.[`${ticket.roleWanted}StagiaireRoleId`];

  if (stagiaireRoleId && target.roles.cache.has(stagiaireRoleId)) {
    await target.roles.remove(stagiaireRoleId).catch(() => {});
  }
  if (roleId) await target.roles.add(roleId).catch(() => {});

  ticket.status = 'accepted';
  await ticket.save();

  // Score staff : +30 pts pour avoir validé un stagiaire
  try {
    const { addStaffPoints } = require('../kingstaff');
    await addStaffPoints(interaction.user.id, interaction.guild.id, 'STAGIAIRE_VALIDE');
  } catch (_) {}

  const roleEmoji = { moderateur: '🛡️', animateur: '🎨', technicien: '🔧' };

  try {
    const dm = await target.createDM();
    await dm.send({ embeds: [new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🎊 Félicitations — Tu es officiellement ${ticket.roleWanted} !`)
      .setDescription(
        `Ta période d'essai est terminée et tu as été **validé** !\n` +
        `Tu es maintenant **${roleEmoji[ticket.roleWanted]} ${ticket.roleWanted}** sur **${interaction.guild.name}**.\n\n` +
        `> Bienvenue dans l'équipe ! 🎉`
      )
      .setTimestamp()
    ]});
  } catch (_) {}

  await interaction.reply({
    content: `🎊 <@${target.id}> est maintenant officiellement **${roleEmoji[ticket.roleWanted]} ${ticket.roleWanted}** !`,
  });

  await postLog(interaction.guild, config, new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎊 Promotion Staff validée')
    .addFields(
      { name: '👤 Membre',  value: `<@${target.id}>`,           inline: true },
      { name: '🎯 Rôle',   value: ticket.roleWanted,            inline: true },
      { name: '✅ Par',    value: `<@${interaction.user.id}>`,  inline: true },
    )
    .setTimestamp()
  );
}

module.exports = {
  postConditionEmbed,
  handleCandidater,
  handleChoixRole,
  handleModalStaff,
  handlePrendre,
  handleAccepter,
  handleRefuser,
  handleModalRefus,
  handleAttente,
  validerStaff,
};
