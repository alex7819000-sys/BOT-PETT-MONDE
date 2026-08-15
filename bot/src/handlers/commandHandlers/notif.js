// src/handlers/commandHandlers/notif.js — /notif (config rapide : counting, confession, sanction)
'use strict';
const Config = require('../../db/models/Config');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand?.();
  const gid = interaction.guild?.id;

  await interaction.deferReply({ ephemeral: true });

  if (sub === 'counting') {
    const heures = interaction.options.getInteger('heures');
    const malusHeures = interaction.options.getInteger('malusheures');
    const malusPourcent = interaction.options.getInteger('maluspourcent');
    const emoji = interaction.options.getString('emoji');
    const duree = interaction.options.getInteger('duree');
    const update = {};
    if (heures) update.countingSingeDurationHours = heures;
    if (malusHeures) update.countingMalusDurationHours = malusHeures;
    if (malusPourcent !== null && malusPourcent !== undefined) update.countingMalusPercent = malusPourcent;
    if (duree) update.countingSingeMsgAutoDeleteSec = duree;
    if (emoji !== null && emoji !== undefined) {
      const isUnicodeEmoji = /\p{Extended_Pictographic}/u.test(emoji);
      const isCustomEmoji = /^<a?:\w+:\d+>$/.test(emoji.trim());
      if (!isUnicodeEmoji && !isCustomEmoji) {
        return interaction.editReply({ content: '⚠️ Ça ne ressemble pas à un emoji valide (emoji classique ou emoji du serveur).' });
      }
      update.countingValidEmoji = emoji.trim();
    }
    if (!Object.keys(update).length) {
      return interaction.editReply({ content: '⚠️ Donne au moins une option à régler.' });
    }
    await Config.updateOne({ guildId: gid }, update);
    const parts = [];
    if (update.countingSingeDurationHours) parts.push(`timeout 3 fautes : **${update.countingSingeDurationHours}h**`);
    if (update.countingMalusDurationHours) parts.push(`durée malus : **${update.countingMalusDurationHours}h**`);
    if (update.countingMalusPercent !== undefined) parts.push(`malus XP : **-${update.countingMalusPercent}%**`);
    if (update.countingValidEmoji) parts.push(`réaction sur bon chiffre : ${update.countingValidEmoji}`);
    if (update.countingSingeMsgAutoDeleteSec) parts.push(`durée msg "Nouveau Singe" : **${update.countingSingeMsgAutoDeleteSec}s**`);
    return interaction.editReply({ content: `🔢 Réglé — ${parts.join(' · ')}` });
  }

  if (sub === 'confession') {
    const heures = interaction.options.getInteger('heures');
    const emojiInput = interaction.options.getString('emoji');
    const update = {};

    if (heures !== null && heures !== undefined) update.confessionRevealHours = heures;

    if (emojiInput !== null && emojiInput !== undefined) {
      const raw = emojiInput.trim();
      let thumbUrl = null;

      // 1) Emoji custom du serveur (ou d'ailleurs) — format <a?:nom:id>
      const customMatch = raw.match(/^<(a)?:\w+:(\d+)>$/);
      if (customMatch) {
        const [, animated, id] = customMatch;
        thumbUrl = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
      }

      // 2) Sticker du serveur — on cherche par nom
      if (!thumbUrl) {
        const sticker = interaction.guild.stickers.cache.find(
          s => s.name.toLowerCase() === raw.toLowerCase()
        );
        if (sticker) thumbUrl = sticker.url;
      }

      // 3) Emoji unicode classique — twemoji CDN
      if (!thumbUrl && /\p{Extended_Pictographic}/u.test(raw)) {
        const codepoints = [...raw]
          .map(c => c.codePointAt(0).toString(16))
          .join('-');
        thumbUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codepoints}.png`;
      }

      if (!thumbUrl) {
        return interaction.editReply({ content: '⚠️ Je ne reconnais pas cet emoji/sticker. Donne un emoji classique, un emoji du serveur, ou le nom exact d\'un sticker du serveur.' });
      }
      update.confessionThumbnailUrl = thumbUrl;
    }

    if (!Object.keys(update).length) {
      return interaction.editReply({ content: '⚠️ Donne au moins une option à régler (heures et/ou emoji).' });
    }

    await Config.updateOne({ guildId: gid }, update);
    const parts = [];
    if (update.confessionRevealHours !== undefined) parts.push(`délai révélation : **${update.confessionRevealHours}h**`);
    if (update.confessionThumbnailUrl) parts.push(`vignette : ${emojiInput}`);
    return interaction.editReply({ content: `🤫 Réglé — ${parts.join(' · ')}` });
  }

  if (sub === 'sanction') {
    const salonValidation = interaction.options.getChannel('salon_validation');
    const salonSignalement = interaction.options.getChannel('salon_signalement');
    const salonHistorique = interaction.options.getChannel('salon_historique');
    const validateur = interaction.options.getRole('validateur');
    const roleBanVocal = interaction.options.getRole('role_banvocal');
    const roleBanChat = interaction.options.getRole('role_banchat');
    const resetJours = interaction.options.getInteger('resetjours');
    const update = {};
    if (salonValidation) update.sanctionChannelId = salonValidation.id;
    if (salonSignalement) update.reportChannelId = salonSignalement.id;
    if (salonHistorique) update.sanctionHistoryChannelId = salonHistorique.id;
    if (validateur) update.sanctionValidatorRoleId = validateur.id;
    if (roleBanVocal) update.voiceBanRoleId = roleBanVocal.id;
    if (roleBanChat) update.chatBanRoleId = roleBanChat.id;
    if (resetJours) update.sanctionResetDays = resetJours;

    if (!Object.keys(update).length) {
      return interaction.editReply({ content: '⚠️ Donne au moins une option à régler.' });
    }

    await Config.updateOne({ guildId: gid }, update);

    // Poste (ou rafraîchit) le panneau public dès que le salon de signalement est réglé
    if (update.reportChannelId) {
      const { postOrRefreshPanel } = require('../../systems/reportPanel');
      await postOrRefreshPanel(interaction.guild, update.reportChannelId).catch(() => {});
    }

    const parts = [];
    if (update.sanctionChannelId) parts.push(`salon validation : ${salonValidation}`);
    if (update.reportChannelId) parts.push(`salon signalement : ${salonSignalement}`);
    if (update.sanctionHistoryChannelId) parts.push(`salon historique : ${salonHistorique}`);
    if (update.sanctionValidatorRoleId) parts.push(`validateur : ${validateur}`);
    if (update.voiceBanRoleId) parts.push(`rôle ban vocal : ${roleBanVocal}`);
    if (update.chatBanRoleId) parts.push(`rôle ban tchat : ${roleBanChat}`);
    if (update.sanctionResetDays) parts.push(`reset après : **${update.sanctionResetDays}j**`);
    return interaction.editReply({ content: `🚨 Réglé — ${parts.join(' · ')}` });
  }

}

module.exports = { handle };
