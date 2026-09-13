// src/systems/media.js — supprime les messages sans média dans les salons "média"
// + crée automatiquement un thread de discussion sous chaque post média
'use strict';

const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|mp4|mov|webm|avi|mkv)$/i;

function isImageOrVideoAttachment(attachment) {
  if (attachment.contentType && /^(image|video)\//i.test(attachment.contentType)) return true;
  return MEDIA_EXTENSIONS.test(attachment.name || attachment.url || '');
}

async function handleMessage(message, mediaChannelIds) {
  if (!mediaChannelIds || !mediaChannelIds.length) return false;
  if (!mediaChannelIds.includes(message.channel.id)) return false;

  const hasMediaAttachment = message.attachments.size > 0 &&
    [...message.attachments.values()].some(isImageOrVideoAttachment);
  const hasEmbed = message.embeds.length > 0;
  const hasLink = /https?:\/\/\S+/i.test(message.content);

  if (!hasMediaAttachment && !hasEmbed && !hasLink) {
    // Pas de média → on supprime et on prévient
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `${message.author} ce salon est réservé aux médias (images, vidéos, liens) 📸`,
    }).catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
    return true;
  }

  // Média détecté (image/vidéo) → on crée un thread de discussion dessous
  if (hasMediaAttachment || hasEmbed) {
    message.startThread({
      name: '💬 Discussion',
      autoArchiveDuration: 10080, // 7 jours — durée max autorisée par Discord (pas d'option "infini")
    }).catch(() => {});
  }

  return false;
}

// Corrige les permissions des salons média configurés pour que tout le monde
// puisse créer des threads librement sous les posts (sinon le auto-thread du
// bot peut échouer silencieusement par manque de droits sur certains rôles).
async function fixMediaPermissions(guild, mediaChannelIds) {
  const fixed = [];
  for (const channelId of mediaChannelIds || []) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased?.()) continue;
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        CreatePublicThreads: true,
        SendMessagesInThreads: true,
      });
      fixed.push(channel.name);
    } catch { /* permissions manquantes pour le bot lui-même — on ignore */ }
  }
  return fixed;
}

module.exports = { handleMessage, fixMediaPermissions };
