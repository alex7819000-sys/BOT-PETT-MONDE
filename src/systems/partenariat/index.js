// src/systems/partenariat/index.js
'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const Partenariat = require('../../db/models/Partenariat');
const Config      = require('../../db/models/Config');
const { postLog } = require('../warn');
const logger      = require('../../utils/logger');

// ── Récupérer les infos d'un serveur via l'API Discord widget ────────────────
async function fetchServerWidget(inviteCode) {
  try {
    // Résoudre l'invite pour obtenir l'ID du serveur
    const inviteRes = await fetch(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`, {
      headers: { 'User-Agent': 'KingBot/1.0' },
    });
    if (!inviteRes.ok) return null;
    const invite = await inviteRes.json();

    const guild = invite.guild;
    if (!guild) return null;

    // Tenter de récupérer le widget public (pas toujours dispo)
    const widgetRes = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/widget.json`).catch(() => null);
    const widget = widgetRes?.ok ? await widgetRes.json() : null;

    return {
      id:           guild.id,
      name:         guild.name,
      icon:         guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith('a_') ? 'gif' : 'png'}?size=128` : null,
      banner:       guild.banner ? `https://cdn.discordapp.com/banners/${guild.id}/${guild.banner}.${guild.banner.startsWith('a_') ? 'gif' : 'png'}?size=512` : null,
      memberCount:  invite.approximate_member_count || 0,
      onlineCount:  invite.approximate_presence_count || 0,
      description:  guild.description || null,
      onlineList:   widget?.members?.length || 0,
    };
  } catch (err) {
    logger.error('Partenariat', 'fetchServerWidget failed', err);
    return null;
  }
}

// ── Extraire le code d'invite depuis une URL ─────────────────────────────────
function extractInviteCode(url) {
  const match = url.match(/discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : url.replace(/\/$/, '').split('/').pop();
}

// ── Poster l'embed de conditions partenariat ─────────────────────────────────
async function postConditionsEmbed(guild, config) {
  const channel = guild.channels.cache.get(config?.partnerConditionChannelId);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${guild.name} — Partenariat & Publication`)
    .setDescription(
      '**🤝 Conditions pour un partenariat :**\n\n' +
      '✅ Minimum **50 membres** sur votre serveur\n' +
      '✅ Serveur actif et communautaire\n' +
      '✅ Pas de contenu illégal ou offensant\n' +
      '✅ Proposer quelque chose en échange *(pub, partenariat croisé, etc.)*\n' +
      '✅ Avoir les droits pour représenter le serveur\n\n' +
      '**📢 Demande de publication :**\n\n' +
      'Tu veux faire la promotion d\'un projet, réseau, ou contenu ?\n' +
      'Clique sur le bouton ci-dessous — un ticket sera créé.\n\n' +
      '> Chaque demande est traitée manuellement par le staff.'
    )
    .setThumbnail(guild.iconURL({ size: 128 }));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`partner:demande:${guild.id}`)
      .setLabel('🤝 Demander un partenariat')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pub:demande:${guild.id}`)
      .setLabel('📢 Demander une publication')
      .setStyle(ButtonStyle.Secondary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  await msg.pin().catch(() => {});
  await Config.updateOne({ guildId: guild.id }, { partnerConditionMessageId: msg.id });
  return msg;
}

// ── Bouton "Demander un partenariat" ─────────────────────────────────────────
async function handleDemande(interaction) {
  const guildId = interaction.guild.id;

  // Vérifier si un ticket est déjà ouvert
  const existing = await Partenariat.findOne({ guildId, requestedBy: interaction.user.id, status: 'pending' });
  if (existing) {
    return interaction.reply({ content: `❌ Tu as déjà une demande en cours dans <#${existing.ticketChannelId}>.`, ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`partner:modal:${guildId}`)
    .setTitle('🤝 Demande de Partenariat')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('invite').setLabel('Lien d\'invitation de votre serveur').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://discord.gg/...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('offer').setLabel('Que proposez-vous en échange ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400).setPlaceholder('Ex: pub dans notre salon, partenariat croisé...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('contact').setLabel('Votre pseudo + rôle sur votre serveur').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
      ),
    );

  await interaction.showModal(modal);
}

// ── Soumission modal → créer ticket ──────────────────────────────────────────
async function handleModalPartner(interaction) {
  const guildId = interaction.customId.split(':')[2];
  const config  = await Config.findOne({ guildId });
  const guild   = interaction.guild;

  await interaction.deferReply({ ephemeral: true });

  const inviteRaw = interaction.fields.getTextInputValue('invite');
  const offer     = interaction.fields.getTextInputValue('offer');
  const contact   = interaction.fields.getTextInputValue('contact');
  const inviteCode = extractInviteCode(inviteRaw);

  // Fetch infos du serveur partenaire
  await interaction.editReply({ content: '⏳ Récupération des infos du serveur...' });
  const serverInfo = await fetchServerWidget(inviteCode);

  if (!serverInfo) {
    return interaction.editReply({ content: '❌ Impossible de récupérer les infos du serveur. Vérifie que le lien d\'invitation est valide et que le serveur est public.' });
  }

  if (serverInfo.memberCount < 50) {
    return interaction.editReply({ content: `❌ Votre serveur a seulement **${serverInfo.memberCount} membres**. Le minimum requis est **50 membres**.` });
  }

  // Compter les partenariats précédents de ce serveur
  const previousCount = await Partenariat.countDocuments({ partnerGuildId: serverInfo.id, status: 'accepted' });

  // Créer le ticket
  const ticketChannel = await guild.channels.create({
    name: `🤝-${serverInfo.name.slice(0, 15).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    type: ChannelType.GuildText,
    parent: config?.partnerCategoryId || null,
    permissionOverwrites: [
      { id: guild.roles.everyone,   deny:  [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(config?.staffRoleId ? [{ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(config?.partnerManagerRoleId ? [{ id: config.partnerManagerRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
    reason: `Demande partenariat — ${serverInfo.name}`,
  });

  // Sauvegarder
  const partenariat = await Partenariat.create({
    guildId,
    partnerGuildId: serverInfo.id,
    inviteUrl:      `https://discord.gg/${inviteCode}`,
    serverName:     serverInfo.name,
    serverIcon:     serverInfo.icon,
    memberCount:    serverInfo.memberCount,
    onlineCount:    serverInfo.onlineCount,
    description:    serverInfo.description,
    bannerUrl:      serverInfo.banner,
    requestedBy:    interaction.user.id,
    offer,
    contactPseudo:  contact,
    ticketChannelId: ticketChannel.id,
    partnerCount:   previousCount,
  });

  // Embed fiche dans le ticket
  const ficheEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🤝 Demande de Partenariat — ${serverInfo.name}`)
    .setThumbnail(serverInfo.icon)
    .addFields(
      { name: '🏠 Serveur',         value: `**${serverInfo.name}**`,                                    inline: true  },
      { name: '👥 Membres',         value: `${serverInfo.memberCount.toLocaleString('fr-FR')}`,          inline: true  },
      { name: '🟢 En ligne',        value: `${serverInfo.onlineCount.toLocaleString('fr-FR')}`,          inline: true  },
      { name: '🔗 Invitation',      value: `https://discord.gg/${inviteCode}`,                           inline: false },
      { name: '👤 Demandé par',     value: `<@${interaction.user.id}> — *${contact}*`,                  inline: true  },
      { name: '🏆 Partenariats',    value: `${previousCount} partenariat${previousCount > 1 ? 's' : ''} précédent${previousCount > 1 ? 's' : ''}`, inline: true },
      { name: '🎁 Ce qu\'ils proposent', value: offer,                                                  inline: false },
    );

  if (serverInfo.description) ficheEmbed.addFields({ name: '📝 Description', value: serverInfo.description, inline: false });
  if (serverInfo.banner) ficheEmbed.setImage(serverInfo.banner);
  ficheEmbed.setTimestamp().setFooter({ text: `ID: ${partenariat._id}` });

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`partner:accepter:${partenariat._id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`partner:refuser:${partenariat._id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`partner:negocier:${partenariat._id}`).setLabel('💬 Négocier').setStyle(ButtonStyle.Secondary),
  );

  const staffMention = config?.partnerManagerRoleId
    ? `<@&${config.partnerManagerRoleId}>`
    : config?.staffRoleId ? `<@&${config.staffRoleId}>` : '@Staff';

  await ticketChannel.send({
    content: `${staffMention} Nouvelle demande de partenariat de **${serverInfo.name}** !`,
    embeds: [ficheEmbed],
    components: [actionsRow],
  });

  await postLog(guild, config, new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🤝 Nouvelle demande partenariat')
    .addFields(
      { name: '🏠 Serveur',   value: serverInfo.name,                 inline: true },
      { name: '👥 Membres',  value: `${serverInfo.memberCount}`,      inline: true },
      { name: '📌 Ticket',   value: `<#${ticketChannel.id}>`,         inline: true },
    )
    .setTimestamp()
  );

  return interaction.editReply({ content: `✅ Ta demande a été soumise ! Ticket : <#${ticketChannel.id}>` });
}

// ── Accepter un partenariat ───────────────────────────────────────────────────
async function handleAccepterPartner(interaction) {
  const partId  = interaction.customId.split(':')[2];
  const partner = await Partenariat.findById(partId);
  if (!partner) return interaction.reply({ content: '❌ Demande introuvable.', ephemeral: true });
  if (partner.status !== 'pending') return interaction.reply({ content: '❌ Cette demande a déjà été traitée.', ephemeral: true });

  const config = await Config.findOne({ guildId: partner.guildId });
  const guild  = interaction.guild;

  partner.status    = 'accepted';
  partner.handledBy = interaction.user.id;
  await partner.save();

  // Poster dans #partenariats — style Etherya
  const partnerChannel = guild.channels.cache.get(config?.partnerPostChannelId);
  if (partnerChannel) {
    const postEmbed = buildPartnerPostEmbed(partner, guild);
    const msg = await partnerChannel.send({
      content: config?.partnerPingRoleId ? `<@&${config.partnerPingRoleId}>` : null,
      embeds: [postEmbed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`Rejoindre ${partner.serverName}`)
          .setStyle(ButtonStyle.Link)
          .setURL(partner.inviteUrl)
          .setEmoji('🔗')
      )],
    });
    partner.postedMessageId = msg.id;
    await partner.save();
  }

  // DM au demandeur
  try {
    const requester = await guild.members.fetch(partner.requestedBy).catch(() => null);
    if (requester) {
      const dm = await requester.createDM();
      await dm.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Partenariat accepté !')
        .setDescription(
          `Votre demande de partenariat pour **${partner.serverName}** sur **${guild.name}** a été **acceptée** !\n\n` +
          `La fiche de votre serveur a été publiée dans notre salon partenariats.\n` +
          `> Merci pour ce partenariat ! 🎉`
        )
        .setTimestamp()
      ]});
    }
  } catch (_) {}

  await interaction.message.edit({ components: [] });
  await interaction.reply({ content: `✅ Partenariat **${partner.serverName}** accepté et publié !` });

  await postLog(guild, config, new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Partenariat accepté')
    .addFields(
      { name: '🏠 Serveur', value: partner.serverName, inline: true },
      { name: '✅ Par',     value: `<@${interaction.user.id}>`, inline: true },
    ).setTimestamp()
  );
}

// ── Refuser un partenariat ────────────────────────────────────────────────────
async function handleRefuserPartner(interaction) {
  const partId = interaction.customId.split(':')[2];

  const modal = new ModalBuilder()
    .setCustomId(`partner:modal_refus:${partId}`)
    .setTitle('❌ Raison du refus')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('raison')
        .setLabel('Raison du refus (envoyée au demandeur)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(400)
    ));

  await interaction.showModal(modal);
}

async function handleModalRefusPartner(interaction) {
  const partId  = interaction.customId.split(':')[2];
  const raison  = interaction.fields.getTextInputValue('raison');
  const partner = await Partenariat.findById(partId);
  if (!partner) return interaction.reply({ content: '❌ Demande introuvable.', ephemeral: true });

  const config = await Config.findOne({ guildId: partner.guildId });
  const guild  = interaction.guild;

  partner.status       = 'refused';
  partner.handledBy    = interaction.user.id;
  partner.refuseReason = raison;
  await partner.save();

  // DM au demandeur
  try {
    const requester = await guild.members.fetch(partner.requestedBy).catch(() => null);
    if (requester) {
      const dm = await requester.createDM();
      await dm.send({ embeds: [new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Partenariat refusé')
        .setDescription(
          `Votre demande de partenariat pour **${partner.serverName}** a été **refusée**.\n\n` +
          `**Raison :** ${raison}\n\n` +
          `> Vous pouvez soumettre une nouvelle demande après avoir pris en compte ce retour.`
        )
        .setTimestamp()
      ]});
    }
  } catch (_) {}

  await interaction.deferUpdate();

  // Fermer le ticket après 15s
  setTimeout(async () => {
    try {
      const channel = guild.channels.cache.get(partner.ticketChannelId);
      if (channel) {
        const archiveId = config?.partnerArchiveCategoryId;
        if (archiveId) {
          await channel.setParent(archiveId, { lockPermissions: false });
          await channel.permissionOverwrites.edit(partner.requestedBy, { ViewChannel: false });
        } else {
          await channel.delete('Partenariat refusé');
        }
      }
    } catch (_) {}
  }, 15000);

  await interaction.followUp({ content: `❌ Partenariat refusé. Raison envoyée en DM. Ticket archivé dans 15s.` });
}

// ── Négocier ──────────────────────────────────────────────────────────────────
async function handleNegocier(interaction) {
  const partId = interaction.customId.split(':')[2];
  await interaction.reply({
    content: `💬 Mode négociation activé — Tu peux maintenant discuter directement avec le demandeur dans ce ticket.\nUtilise les boutons **Accepter** ou **Refuser** quand tu as pris ta décision.`,
  });
}

// ── Construire l'embed style Etherya pour #partenariats ──────────────────────
function buildPartnerPostEmbed(partner, guild) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🤝 Nouveau Partenariat')
    .addFields(
      { name: '🏠 Serveur',      value: `**${partner.serverName}**`,                               inline: true  },
      { name: '👥 Membres',      value: partner.memberCount.toLocaleString('fr-FR'),               inline: true  },
      { name: '🟢 En ligne',     value: partner.onlineCount.toLocaleString('fr-FR'),               inline: true  },
      { name: '🔗 Invitation',   value: partner.inviteUrl,                                         inline: false },
      { name: '👤 Contact',      value: partner.contactPseudo || 'Non précisé',                    inline: true  },
      { name: '🏆 Partenariats', value: `${partner.partnerCount} sur d'autres serveurs`,           inline: true  },
    );

  if (partner.description) embed.addFields({ name: '📝 Description', value: partner.description, inline: false });
  if (partner.serverIcon)  embed.setThumbnail(partner.serverIcon);
  if (partner.bannerUrl)   embed.setImage(partner.bannerUrl);

  embed
    .setFooter({ text: `Partenariat validé par ${guild.name} • Posté par le bot` })
    .setTimestamp();

  return embed;
}

module.exports = {
  postConditionsEmbed,
  handleDemande,
  handleModalPartner,
  handleAccepterPartner,
  handleRefuserPartner,
  handleModalRefusPartner,
  handleNegocier,
};
