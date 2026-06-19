'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGES = [
  {
    title: '⭐ Commandes essentielles',
    color: 0xf1c40f,
    fields: [
      { name: '/rk [@membre]', value: 'Voir ton niveau, XP, stats complètes' },
      { name: '/classement', value: 'Top membres — XP, couronnes, bumps, quiz...' },
      { name: '/missions [@membre]', value: 'Missions hebdo + tickets giveaway' },
      { name: '/profil [@membre]', value: 'Profil détaillé d\'un membre' },
    ],
  },
  {
    title: '🎌 Smash or Pass & Quiz',
    color: 0xe91e8c,
    fields: [
      { name: '/anime', value: 'Lancer un Smash or Pass anime manuellement' },
      { name: '/waifu soumettre', value: 'Soumettre un personnage au vote communauté' },
      { name: '/animaux soumettre', value: 'Soumettre un animal au vote communauté' },
      { name: '/facereveal soumettre', value: 'Poster une image dans le Face Reveal' },
    ],
  },
  {
    title: '⚔️ Guerre & Guildes',
    color: 0xe74c3c,
    fields: [
      { name: '/guerre equipe', value: 'Changer d\'équipe (Chien / Chat)' },
      { name: '/guerre stats', value: 'Score actuel de la guerre' },
      { name: '/guilde creer [nom]', value: 'Créer une guilde (niveau 10+)' },
      { name: '/guilde rejoindre', value: 'Rejoindre une guilde existante' },
      { name: '/guilde info', value: 'Voir les infos de ta guilde' },
    ],
  },
  {
    title: '👑 King of the Day & Events',
    color: 0xffd700,
    fields: [
      { name: 'King of the Day', value: 'Automatique — couronné chaque semaine selon l\'XP hebdo' },
      { name: '/singe nominer @membre', value: 'Nominer quelqu\'un comme Singe du Serveur' },
      { name: '/couple nominer @m1 @m2', value: 'Nominer un couple de la semaine' },
      { name: '/giveaway creer', value: 'Créer un giveaway (admin)' },
    ],
  },
  {
    title: '💬 Social & Divers',
    color: 0x3498db,
    fields: [
      { name: '/debat creer', value: 'Lancer un débat dans le forum' },
      { name: '/confession', value: 'Envoyer une confession anonyme' },
      { name: '/pub creer', value: 'Créer une pub automatique (admin)' },
      { name: '/pub liste', value: 'Voir et gérer les pubs actives (admin)' },
      { name: '/stats', value: 'Statistiques globales du serveur (graphique)' },
    ],
  },
  {
    title: '⚙️ Setup — Admin seulement',
    color: 0x95a5a6,
    fields: [
      { name: '/setup init', value: 'Créer tous les rôles et salons automatiquement' },
      { name: '/setup salon [type] [#salon]', value: 'Configurer chaque salon (annonces, quiz, média, guerre, etc.)' },
      { name: '/setup role [type] [@role]', value: 'Lier les rôles King, Singe, Couple, Guilde...' },
      { name: '/setup levelrole [niveau] [@role]', value: 'Donner un rôle automatiquement à un niveau' },
      { name: '/setup reset [jour] [heure]', value: 'Configurer le reset hebdo (vendredi 20h par défaut)' },
      { name: '/setup streak / /setup invitetracker', value: 'Activer streak journalier / suivi invitations' },
      { name: '/setup voir', value: 'Voir toute la configuration actuelle' },
    ],
  },
];

async function handle(interaction) {
  let page = 0;

  function buildEmbed(p) {
    const data = PAGES[p];
    return new EmbedBuilder()
      .setColor(data.color)
      .setTitle(data.title)
      .addFields(data.fields.map(f => ({ name: `\`${f.name}\``, value: f.value, inline: false })))
      .setFooter({ text: `Page ${p + 1}/${PAGES.length} • XP du serveur principal → Drafbot` })
      .setTimestamp();
  }

  function buildRow(p) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('infos:prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
      new ButtonBuilder().setCustomId('infos:next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p === PAGES.length - 1),
    );
  }

  const msg = await interaction.reply({
    embeds: [buildEmbed(page)],
    components: [buildRow(page)],
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({ time: 120_000 });
  collector.on('collect', async btn => {
    if (btn.user.id !== interaction.user.id) {
      return btn.reply({ content: '❌ Ce n\'est pas ton menu.', ephemeral: true });
    }
    if (btn.customId === 'infos:prev') page = Math.max(0, page - 1);
    if (btn.customId === 'infos:next') page = Math.min(PAGES.length - 1, page + 1);
    await btn.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
  });
  collector.on('end', () => {
    msg.edit({ components: [] }).catch(() => {});
  });
}

module.exports = { handle };
