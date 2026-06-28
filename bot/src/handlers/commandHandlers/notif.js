// src/handlers/commandHandlers/notif.js — /notif
'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../config/constants');
const Config = require('../../db/models/Config');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand?.();
  const gid = interaction.guild?.id;

  // Mode simple (sans sous-commande) : poster un lien
  if (!sub) {
    await interaction.deferReply({ ephemeral: true });
    const message = interaction.options.getString('message');
    const lien = interaction.options.getString('lien');
    const image = interaction.options.getString('image');
    const embed = new EmbedBuilder().setColor(COLORS.PURPLE).setDescription(message + (lien ? `\n${lien}` : ''));
    if (image) embed.setImage(image);
    const channel = interaction.channel;
    await channel.send({ embeds: [embed] });
    return interaction.editReply({ content: '✅ Notification postée !' });
  }

  await interaction.deferReply({ ephemeral: true });

  if (sub === 'youtube') {
    return interaction.editReply({ content:
      '⚠️ Pas encore disponible — les notifications YouTube nécessitent une intégration avec l\'API YouTube ' +
      '(quota, webhook PubSubHubbub...) qui n\'est pas encore construite dans le bot. Dis-moi si tu veux que je la développe.'
    });
  }
  if (sub === 'twitch') {
    return interaction.editReply({ content:
      '⚠️ Pas encore disponible — pareil que YouTube, ça demande une intégration avec l\'API Twitch (token app, ' +
      'webhooks EventSub) qui n\'existe pas encore. Dis-moi si tu veux que je la développe.'
    });
  }

  if (sub === 'counting') {
    const heures = interaction.options.getInteger('heures');
    const malusHeures = interaction.options.getInteger('malusheures');
    const malusPourcent = interaction.options.getInteger('maluspourcent');
    const update = {};
    if (heures) update.countingSingeDurationHours = heures;
    if (malusHeures) update.countingMalusDurationHours = malusHeures;
    if (malusPourcent !== null && malusPourcent !== undefined) update.countingMalusPercent = malusPourcent;
    if (!Object.keys(update).length) {
      return interaction.editReply({ content: '⚠️ Donne au moins une option à régler.' });
    }
    await Config.updateOne({ guildId: gid }, update);
    const parts = [];
    if (update.countingSingeDurationHours) parts.push(`timeout 3 fautes : **${update.countingSingeDurationHours}h**`);
    if (update.countingMalusDurationHours) parts.push(`durée malus : **${update.countingMalusDurationHours}h**`);
    if (update.countingMalusPercent !== undefined) parts.push(`malus XP : **-${update.countingMalusPercent}%**`);
    return interaction.editReply({ content: `🔢 Réglé — ${parts.join(' · ')}` });
  }

  if (sub === 'fixmedia') {
    const { fixMediaPermissions } = require('../../systems/media');
    const cfg = await Config.findOne({ guildId: gid }).lean();
    const fixed = await fixMediaPermissions(interaction.guild, cfg?.mediaChannelIds);
    return interaction.editReply({
      content: fixed.length
        ? `✅ Permissions corrigées (threads libres) sur : ${fixed.join(', ')}`
        : '⚠️ Aucun salon média configuré — utilise `/setup salon` pour en ajouter un d\'abord.',
    });
  }

  if (sub === 'retiremedia') {
    const salon = interaction.options.getChannel('salon');
    const cfg = await Config.findOne({ guildId: gid }).lean();
    const before = cfg?.mediaChannelIds?.length || 0;
    await Config.updateOne({ guildId: gid }, { $pull: { mediaChannelIds: salon.id } });
    const cfg2 = await Config.findOne({ guildId: gid }).lean();
    const removed = before - (cfg2?.mediaChannelIds?.length || 0);
    return interaction.editReply({ content: removed ? `✅ ${salon} retiré de la liste média.` : `⚠️ ${salon} n'était pas dans la liste média.` });
  }

  if (sub === 'animalmention') {
    return interaction.editReply({ content:
      '⚠️ Cette détection-là (animal mentionné en fin de phrase) n\'existe pas encore comme fonctionnalité séparée — ' +
      'le système actuel détecte déjà "chien"/"chat" n\'importe où dans le message via `/setup salon` → Bataille. ' +
      'Dis-moi précisément ce que tu veux en plus et je le construis.'
    });
  }

  if (sub === 'guerre') {
    const roleChien = interaction.options.getRole('rolechien');
    const roleChat  = interaction.options.getRole('rolechat');
    const Faction = require('../../db/models/Faction');
    const updates = [];
    if (roleChien) updates.push(Faction.updateOne({ guildId: gid, keyword: 'chien' }, { roleId: roleChien.id }));
    if (roleChat)  updates.push(Faction.updateOne({ guildId: gid, keyword: 'chat' },  { roleId: roleChat.id }));
    if (!updates.length) return interaction.editReply({ content: '⚠️ Donne au moins un rôle (chien ou chat).' });
    await Promise.all(updates);
    return interaction.editReply({ content: `🐶🐱 Rôles de guerre mis à jour${roleChien ? ` — Chien : ${roleChien}` : ''}${roleChat ? ` — Chat : ${roleChat}` : ''}.` });
  }

  if (sub === 'smash') {
    const smash = interaction.options.getString('smash');
    const pass  = interaction.options.getString('pass');
    const update = {};
    if (smash) update.smashEmoji = smash;
    if (pass)  update.passEmoji = pass;
    if (!Object.keys(update).length) return interaction.editReply({ content: '⚠️ Donne au moins un emoji.' });
    await Config.updateOne({ guildId: gid }, update);
    return interaction.editReply({ content: `✅ Emojis Smash/Pass mis à jour${smash ? ` — Smash: ${smash}` : ''}${pass ? ` — Pass: ${pass}` : ''}.` });
  }

  if (sub === 'confession') {
    const heures = interaction.options.getInteger('heures');
    await Config.updateOne({ guildId: gid }, { confessionRevealHours: heures });
    return interaction.editReply({ content: `🤫 Délai avant révélation des confessions réglé à **${heures}h**.` });
  }

  if (sub === 'animaltrigger') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { animalTriggerChannelId: salon?.id || null });
    return interaction.editReply({ content: salon ? `🐶🐱 Salon bataille réglé sur ${salon}.` : '✅ Salon bataille désactivé.' });
  }

  if (sub === 'ghostbot') {
    const salon = interaction.options.getChannel('salon');
    const { joinGhost, leaveGhost } = require('../../systems/ghostBot');

    if (!salon) {
      // Aucun salon fourni → on désactive et on quitte le vocal actuel
      await Config.updateOne({ guildId: gid }, { ghostBotChannelId: null });
      const left = leaveGhost(gid);
      return interaction.editReply({ content: left ? '👻 Ghost Bot déconnecté et désactivé.' : '👻 Ghost Bot déjà désactivé.' });
    }

    const result = await joinGhost(interaction.client, gid, salon.id);
    if (!result.ok) {
      return interaction.editReply({ content: `❌ ${result.reason}` });
    }
    await Config.updateOne({ guildId: gid }, { ghostBotChannelId: salon.id });
    return interaction.editReply({ content: `👻 Ghost Bot connecté dans **${result.channelName}**, silencieux, 24/7 (reconnexion auto si déco).` });
  }

  if (sub === 'invitetracker') {
    return interaction.editReply({ content:
      '⚠️ Le suivi des invitations (+XP à l\'inviteur) n\'existe pas encore comme système — il faudrait le construire ' +
      '(cache des invites, détection de quel lien a été utilisé au moment d\'un join). Dis-moi si tu veux que je le développe, ' +
      'c\'est un vrai morceau.'
    });
  }

  if (sub === 'bumprole') {
    const role = interaction.options.getRole('role');
    await Config.updateOne({ guildId: gid }, { bumperRoleId: role?.id || null });
    return interaction.editReply({ content: role ? `✅ Rôle bump réglé sur ${role}.` : '✅ Rôle bump désactivé (retour à la détection par nom "bumper").' });
  }

  if (sub === 'streak') {
    return interaction.editReply({ content:
      '⚠️ Le streak journalier (+XP bonus si actif chaque jour) n\'existe pas encore comme système — il faudrait ' +
      'créer un suivi de connexion/activité quotidienne par membre. Dis-moi si tu veux que je le développe.'
    });
  }

  if (sub === 'giveaway') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { giveawayChannelId: salon?.id || null });
    return interaction.editReply({ content: salon ? `🎁 Salon giveaway réglé sur ${salon}.` : '✅ Salon giveaway réinitialisé (utilisera le salon de la commande).' });
  }

  if (sub === 'defis') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { defiChannelId: salon?.id || null });
    return interaction.editReply({ content: salon ? `🎯 Salon défis réglé sur ${salon}.` : '✅ Salon défis désactivé.' });
  }

  if (sub === 'mudae') {
    const salon = interaction.options.getChannel('salon');
    await Config.updateOne({ guildId: gid }, { mudaeChannelId: salon.id });
    return interaction.editReply({ content: `🎴 Salon Mudae réglé sur ${salon} — le bot enverra \`$dk\` ici pour récompenser en kakera.` });
  }

  if (sub === 'exclusion') {
    const salon = interaction.options.getChannel('salon');
    const cfg = await Config.findOne({ guildId: gid }).lean();
    const already = (cfg?.xpExcludedChannelIds || []).includes(salon.id);
    if (already) {
      await Config.updateOne({ guildId: gid }, { $pull: { xpExcludedChannelIds: salon.id } });
      return interaction.editReply({ content: `✅ ${salon} donne de nouveau de l'XP.` });
    } else {
      await Config.updateOne({ guildId: gid }, { $addToSet: { xpExcludedChannelIds: salon.id } });
      return interaction.editReply({ content: `🚫 ${salon} ne donne plus d'XP.` });
    }
  }
}

module.exports = { handle };
