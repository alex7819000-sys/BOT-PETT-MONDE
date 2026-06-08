// src/systems/reglement/index.js
'use strict';

const {
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');

const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

// ── Sections du règlement ─────────────────────────────────────────────────────
const SECTIONS = [
  {
    id:    'general',
    emoji: '📜',
    label: 'Règles Générales',
    color: 0x5865F2,
    content: `**📜 Règles Générales — HERA 🍉**\n\n` +
      `**1.** Respectez tous les membres sans exception.\n` +
      `**2.** Aucune insulte, discrimination, racisme ou harcèlement de quelque forme que ce soit.\n` +
      `**3.** Le bon sens est de rigueur — si tu doutes que quelque chose est acceptable, c'est qu'il ne l'est probablement pas.\n` +
      `**4.** Les décisions du staff sont finales. Toute contestation se fait en ticket, jamais en public.\n` +
      `**5.** L'ignorance des règles ne protège pas des sanctions.\n\n` +
      `> Ces règles s'appliquent à tous les salons, vocaux inclus.`,
  },
  {
    id:    'comportement',
    emoji: '🤝',
    label: 'Comportement & Communication',
    color: 0x57F287,
    content: `**🤝 Comportement & Communication**\n\n` +
      `**1.** Gardez une ambiance positive et bienveillante.\n` +
      `**2.** Pas de provocation, drama ou clash inutile.\n` +
      `**3.** Le spam, flood, copier-coller répétitif et abus de mentions sont interdits.\n` +
      `**4.** Utilisez les bons salons pour les bons sujets.\n` +
      `**5.** Pas de mendicité de rôles, de niveaux ou de récompenses.\n` +
      `**6.** Restez courtois même dans les débats — on peut ne pas être d'accord sans se manquer de respect.\n\n` +
      `> Un serveur agréable c'est la responsabilité de tout le monde.`,
  },
  {
    id:    'contenu',
    emoji: '🖼️',
    label: 'Contenu & Médias',
    color: 0xFEE75C,
    content: `**🖼️ Contenu & Médias**\n\n` +
      `**1.** Aucun contenu NSFW, gore, choquant ou illégal.\n` +
      `**2.** Les images, vidéos et GIFs doivent être appropriés à l'ambiance du serveur.\n` +
      `**3.** Pas de spoilers sans utiliser les balises prévues à cet effet.\n` +
      `**4.** Le contenu partagé doit respecter les droits d'auteur.\n` +
      `**5.** Tout contenu jugé inapproprié par le staff sera supprimé sans avertissement.\n\n` +
      `> En cas de doute, abstiens-toi ou demande à un staff.`,
  },
  {
    id:    'pub',
    emoji: '📣',
    label: 'Publicité & Liens',
    color: 0xEB459E,
    content: `**📣 Publicité & Liens**\n\n` +
      `**1.** Toute publicité non autorisée est strictement interdite.\n` +
      `**2.** Les liens vers d'autres serveurs Discord sont interdits sans accord préalable du staff.\n` +
      `**3.** Pour faire une demande de partenariat, rendez-vous dans le salon dédié.\n` +
      `**4.** Les liens suspects, phishing ou malveillants entraînent un ban immédiat.\n` +
      `**5.** La promotion personnelle (réseaux sociaux, chaînes, etc.) est tolérée uniquement dans les salons prévus.\n\n` +
      `> Tout contournement de cette règle sera sanctionné sévèrement.`,
  },
  {
    id:    'vocal',
    emoji: '🔊',
    label: 'Salons Vocaux',
    color: 0xED4245,
    content: `**🔊 Salons Vocaux**\n\n` +
      `**1.** Respectez les personnes déjà présentes en vocal.\n` +
      `**2.** Pas de sons agressifs, de micro saturé ou de bruit de fond excessif.\n` +
      `**3.** Ne rejoignez pas un vocal sans permission si les membres semblent en réunion privée.\n` +
      `**4.** Le stream de contenu NSFW en vocal est interdit.\n` +
      `**5.** L'enregistrement de membres sans leur consentement est interdit.\n\n` +
      `> Les mêmes règles de respect s'appliquent en vocal comme en écrit.`,
  },
  {
    id:    'xp',
    emoji: '⭐',
    label: 'Système XP & Niveaux',
    color: 0xFFD700,
    content: `**⭐ Système XP & Niveaux — HERA 🍉**\n\n` +
      `**Comment gagner de l'XP :**\n` +
      `• Messages envoyés → XP de base *(cooldown 60s)*\n` +
      `• Salons actifs comme #bataille ou #mudae → multiplicateurs bonus\n` +
      `• Bumper le serveur → +100 XP\n` +
      `• Inviter des membres → +50 XP par invitation\n` +
      `• Missions hebdomadaires → jusqu'à 100 XP\n\n` +
      `**Rôles de niveau :** obtenus au niveau 5, 10, 15, 20, 25, 30, 40, 50 *(permanents)*\n\n` +
      `**King of the Week :** le membre avec le plus d'XP hebdo est couronné chaque dimanche à 20h.\n\n` +
      `**⚠️ Malus Singe :** le rôle Singe réduit tes gains d'XP de 50%.`,
  },
  {
    id:    'staff',
    emoji: '🛡️',
    label: 'Staff & Modération',
    color: 0xFAA61A,
    content: `**🛡️ Staff & Modération**\n\n` +
      `**1.** Le staff est là pour aider — traitez-les avec respect.\n` +
      `**2.** Ne pas contester les décisions de modération en public. Ouvrez un ticket.\n` +
      `**3.** Ne pas mentionner le staff pour des raisons futiles.\n` +
      `**4.** Candidature staff : rendez-vous dans le salon dédié.\n\n` +
      `**Hiérarchie :**\n` +
      `👑 Owner → 🔱 Co-Owner → ⭐ Admin → 🛡️ Modérateur → 🎨 Animateur → 🔧 Technicien\n\n` +
      `> Le staff est bénévole. Respectez leur temps et leur travail.`,
  },
  {
    id:    'sanctions',
    emoji: '⚖️',
    label: 'Sanctions & Procédures',
    color: 0xFF0000,
    content: `**⚖️ Sanctions & Procédures**\n\n` +
      `**Échelle des sanctions :**\n` +
      `**1er manquement** → Avertissement *(warn)*\n` +
      `**2e manquement** → Second avertissement\n` +
      `**3e manquement** → Rôle Singe *(malus XP -50%)*\n` +
      `**5e manquement** → Expulsion temporaire *(kick)*\n` +
      `**7e manquement** → Bannissement permanent\n\n` +
      `*Les sanctions graves (menaces, NSFW, phishing) peuvent mener à un ban immédiat.*\n\n` +
      `**Contester une sanction :** ouvrez un ticket staff avec vos arguments.\n\n` +
      `> Le staff se réserve le droit d'adapter les sanctions selon la gravité.`,
  },
];

// ── Poster l'embed règlement ──────────────────────────────────────────────────
async function postReglementEmbed(guild, config, bannerUrl) {
  const channel = guild.channels.cache.get(config?.reglementChannelId);
  if (!channel) return null;

  const mainEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📋 Règlement — ${guild.name}`)
    .setDescription(
      `Bienvenue sur **${guild.name}** ! 🎉\n\n` +
      `Ce règlement s'applique à **tous les membres** sans exception.\n` +
      `En restant sur ce serveur, tu acceptes de le respecter.\n\n` +
      `**📂 Sections disponibles :**\n` +
      SECTIONS.map(s => `${s.emoji} ${s.label}`).join('\n') +
      `\n\n> Utilise le menu ci-dessous pour lire chaque section en détail.`
    )
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setImage(bannerUrl || null)
    .setTimestamp()
    .setFooter({ text: `${guild.name} • Règlement en vigueur` });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`reglement:section:${guild.id}`)
    .setPlaceholder('📖 Choisir une section à lire...')
    .addOptions(SECTIONS.map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.label)
        .setValue(s.id)
        .setEmoji(s.emoji)
    ));

  const acceptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reglement:accepter:${guild.id}`)
      .setLabel('✅ J\'accepte le règlement')
      .setStyle(ButtonStyle.Success),
  );

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const msg = await channel.send({
    embeds: [mainEmbed],
    components: [selectRow, acceptRow],
  });

  await msg.pin().catch(() => {});
  await Config.updateOne({ guildId: guild.id }, { reglementMessageId: msg.id });
  return msg;
}

// ── Sélection d'une section ───────────────────────────────────────────────────
async function handleSectionSelect(interaction) {
  const sectionId = interaction.values[0];
  const section   = SECTIONS.find(s => s.id === sectionId);
  if (!section) return interaction.reply({ content: '❌ Section introuvable.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(section.color)
    .setTitle(`${section.emoji} ${section.label}`)
    .setDescription(section.content)
    .setFooter({ text: 'Toi seul(e) peux voir ce message • Utilise le menu pour naviguer' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Accepter le règlement ─────────────────────────────────────────────────────
async function handleAccepterReglement(interaction) {
  const guildId = interaction.customId.split(':')[2];
  const config  = await Config.findOne({ guildId });

  // Attribuer le rôle membre si configuré
  if (config?.membreRoleId) {
    try {
      await interaction.member.roles.add(config.membreRoleId);
    } catch (_) {}
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setDescription('✅ Tu as accepté le règlement ! Bienvenue officiellement sur le serveur 🎉\n> Tu as maintenant accès à tous les salons.')
    .setTimestamp();

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { postReglementEmbed, handleSectionSelect, handleAccepterReglement, SECTIONS };
