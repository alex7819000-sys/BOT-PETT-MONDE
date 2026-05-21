// src/systems/notifs/index.js — YouTube + Twitch notifications
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios  = require('axios');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');
const { COLORS } = require('../../config/constants');

// ── YouTube ───────────────────────────────────────────────────────────────

async function checkYouTube(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.youtubeChannelId || !config?.youtubeNotifChannelId) return;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return;

  try {
    const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet', channelId: config.youtubeChannelId,
        maxResults: 1, order: 'date', type: 'video', key: apiKey,
      },
      timeout: 8000,
    });

    const video = data.items?.[0];
    if (!video) return;
    const videoId = video.id.videoId;
    if (videoId === config.lastYoutubeVideoId) return; // Déjà annoncée

    await Config.updateOne({ guildId }, { lastYoutubeVideoId: videoId });

    const guild   = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(config.youtubeNotifChannelId);
    if (!channel) return;

    const snippet = video.snippet;
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`🎬 Nouvelle vidéo — ${snippet.channelTitle}`)
      .setDescription(`**${snippet.title}**`)
      .setThumbnail(snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url)
      .addFields(
        { name: '📅 Publiée', value: new Date(snippet.publishedAt).toLocaleDateString('fr-FR'), inline: true },
        { name: '📺 Chaîne',  value: snippet.channelTitle, inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('▶️ Regarder').setStyle(ButtonStyle.Link).setURL(`https://youtu.be/${videoId}`),
    );

    await channel.send({ content: '@everyone 🎬 Nouvelle vidéo !', embeds: [embed], components: [row] });
    logger.info('Notifs', `YouTube : ${snippet.title}`);
  } catch (err) {
    logger.error('Notifs', 'YouTube check failed', err);
  }
}

// ── Twitch ────────────────────────────────────────────────────────────────

async function getTwitchToken(guildId) {
  const config = await Config.findOne({ guildId });
  if (config?.twitchAccessToken && config?.twitchTokenExpiry && config.twitchTokenExpiry > new Date()) {
    return config.twitchAccessToken;
  }
  // Nouveau token
  const clientId     = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const { data } = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' },
  });
  const expiry = new Date(Date.now() + (data.expires_in - 300) * 1000);
  await Config.updateOne({ guildId }, { twitchAccessToken: data.access_token, twitchTokenExpiry: expiry });
  return data.access_token;
}

async function checkTwitch(client, guildId) {
  const config = await Config.findOne({ guildId });
  if (!config?.twitchUsername || !config?.twitchNotifChannelId) return;

  try {
    const token    = await getTwitchToken(guildId);
    if (!token) return;

    const { data } = await axios.get('https://api.twitch.tv/helix/streams', {
      headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID },
      params:  { user_login: config.twitchUsername },
      timeout: 8000,
    });

    const stream = data.data?.[0];
    const isLive = !!stream;

    if (isLive && !config.twitchIsLive) {
      // Vient de passer LIVE
      await Config.updateOne({ guildId }, { twitchIsLive: true });
      const guild   = client.guilds.cache.get(guildId);
      const channel = guild?.channels.cache.get(config.twitchNotifChannelId);
      if (!channel) return;

      const thumbUrl = stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360') + `?t=${Date.now()}`;
      const embed = new EmbedBuilder()
        .setColor(0x9146FF)
        .setTitle(`🔴 ${stream.user_name} est EN LIVE !`)
        .setDescription(`**${stream.title}**`)
        .setThumbnail(thumbUrl)
        .addFields(
          { name: '👥 Viewers',     value: `${stream.viewer_count.toLocaleString()}`, inline: true },
          { name: '🎮 Catégorie',   value: stream.game_name || 'N/A', inline: true },
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('📺 Regarder le live').setStyle(ButtonStyle.Link).setURL(`https://twitch.tv/${config.twitchUsername}`),
      );

      await channel.send({ content: '@everyone 🔴 Le live a commencé !', embeds: [embed], components: [row] });
      logger.info('Notifs', `Twitch live : ${stream.user_name}`);

    } else if (!isLive && config.twitchIsLive) {
      // Vient d'arrêter le live
      await Config.updateOne({ guildId }, { twitchIsLive: false });
      const guild   = client.guilds.cache.get(guildId);
      const channel = guild?.channels.cache.get(config.twitchNotifChannelId);
      if (channel) await channel.send(`🎬 **${config.twitchUsername}** a terminé son live. Merci à tous !`);
    }
  } catch (err) {
    logger.error('Notifs', 'Twitch check failed', err);
  }
}

module.exports = { checkYouTube, checkTwitch };
