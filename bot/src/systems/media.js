// src/systems/media.js — supprime les messages sans média dans les salons "média"
'use strict';

async function handleMessage(message, mediaChannelIds) {
  if (!mediaChannelIds || !mediaChannelIds.length) return false;
  if (!mediaChannelIds.includes(message.channel.id)) return false;

  const hasAttachment = message.attachments.size > 0;
  const hasEmbed = message.embeds.length > 0;
  const hasLink = /https?:\/\/\S+/i.test(message.content);

  if (hasAttachment || hasEmbed || hasLink) return false;

  // Pas de média → on supprime et on prévient
  await message.delete().catch(() => {});
  const warn = await message.channel.send({
    content: `${message.author} ce salon est réservé aux médias (images, vidéos, liens) 📸`,
  }).catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
  return true;
}

module.exports = { handleMessage };
