// src/systems/forums.js — Forums communautaires simples
'use strict';

const { EmbedBuilder } = require('discord.js');

const FORUMS = {
  forumGamingId: {
    emoji: '🎮',
    titre: 'Forum Jeux Vidéo',
    description: [
      '**Parle de tout ce qui touche aux jeux vidéo !**',
      '',
      '🕹️ Partage tes coups de cœur',
      '🏆 Montre tes achievements & clips',
      '🤝 Cherche des coéquipiers',
      '💬 Débat des sorties et actus',
      '',
      '*Crée un fil de discussion pour ton sujet préféré ↓*',
    ].join('\n'),
    color: 0x57F287,
    tags: ['PS5', 'PC', 'Xbox', 'Switch', 'Mobile', 'Indie', 'FPS', 'RPG', 'Sport'],
  },
  forumAnimeId: {
    emoji: '🎌',
    titre: 'Forum Anime / Manga / BL',
    description: [
      '**Ton espace pour tout ce qui est anime, manga et BL !**',
      '',
      '📺 Recommande tes animes du moment',
      '📚 Parle de tes mangas préférés',
      '💜 Partage tes fics et ships BL',
      '🎨 Poste du fanart (crédite l\'artiste !)',
      '',
      '*Crée un fil de discussion pour ton sujet ↓*',
    ].join('\n'),
    color: 0xEB459E,
    tags: ['Shonen', 'Shojo', 'Seinen', 'BL / Yaoi', 'Isekai', 'Romance', 'Action', 'Slice of Life'],
  },
  forumMusiqueId: {
    emoji: '🎵',
    titre: 'Forum Musique',
    description: [
      '**Partage ta musique, découvre celle des autres !**',
      '',
      '🎤 Présente tes artistes favoris',
      '💿 Partage des albums ou playlists',
      '🔊 Poste des sons qui vont pas se lâcher',
      '🎸 Parle de tous les genres sans jugement',
      '',
      '*Crée un fil de discussion pour ton sujet ↓*',
    ].join('\n'),
    color: 0xFEE75C,
    tags: ['Rap / Trap', 'Pop', 'R&B', 'Rock', 'Phonk', 'K-pop', 'Électro', 'Classique', 'Autres'],
  },
};

/**
 * Poste (ou met à jour) le message d'accueil épinglé dans un forum.
 * Appelé depuis /setup salon quand on configure un des 3 forums.
 */
async function postForumWelcome(channel, forumKey) {
  const def = FORUMS[forumKey];
  if (!def) return;

  const embed = new EmbedBuilder()
    .setColor(def.color)
    .setTitle(`${def.emoji} ${def.titre}`)
    .setDescription(def.description)
    .setFooter({ text: 'Crée un nouveau fil pour démarrer une discussion !' });

  // Tags disponibles (informatif)
  if (def.tags?.length) {
    embed.addFields({
      name: '🏷️ Sujets populaires',
      value: def.tags.map(t => `\`${t}\``).join(' · '),
    });
  }

  try {
    // Cherche un message épinglé existant du bot pour le mettre à jour
    const pinned = await channel.messages.fetchPinned().catch(() => null);
    const existing = pinned?.find(m => m.author.id === channel.client.user.id);

    if (existing) {
      await existing.edit({ embeds: [embed] });
    } else {
      const msg = await channel.send({ embeds: [embed] });
      await msg.pin().catch(() => {});
    }
  } catch {
    // Pas un forum ou pas les permissions — on ignore silencieusement
  }
}

module.exports = { postForumWelcome, FORUMS };
