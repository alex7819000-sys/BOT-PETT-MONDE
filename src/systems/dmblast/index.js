// src/systems/dmblast/index.js
'use strict';
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Config = require('../../db/models/Config');
const logger = require('../../utils/logger');

const DM_COOLDOWN = new Map();
const DM_CD_MS    = 30 * 60 * 1000;

async function handleDMBlast(message) {
  const gid = message.guild.id;
  const config = await Config.findOne({ guildId: gid });
  if (!config?.dmBlastChannelId || message.channel.id !== config.dmBlastChannelId) return false;
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return false;

  const last = DM_COOLDOWN.get(gid);
  if (last && Date.now() - last < DM_CD_MS) {
    const rem = Math.ceil((DM_CD_MS - (Date.now() - last)) / 60000);
    await message.reply({ content: `⏱️ Attends encore **${rem} min** avant le prochain blast.` });
    return true;
  }

  const text     = message.content;
  const imageUrl = message.attachments.first()?.url || null;
  if (!text && !imageUrl) return false;

  await message.reply({ content: '📨 Blast en cours... Je DM tous les membres du serveur.' });
  DM_COOLDOWN.set(gid, Date.now());

  const embed = new EmbedBuilder()
    .setColor(0x7C4DFF)
    .setTitle(`📣 Message de ${message.guild.name}`)
    .setDescription(text || null)
    .setThumbnail(message.guild.iconURL())
    .setTimestamp()
    .setFooter({ text: `De ${message.member.displayName} • ${message.guild.name}` });

  if (imageUrl) embed.setImage(imageUrl);

  const members = await message.guild.members.fetch();
  const humans  = members.filter(m => !m.user.bot);
  let sent = 0, failed = 0;

  for (const [, member] of humans) {
    try {
      await member.send({ embeds: [embed] });
      sent++;
      await new Promise(r => setTimeout(r, 400));
    } catch (_) { failed++; }
  }

  await message.channel.send(`✅ Blast terminé ! **${sent}** DMs envoyés, **${failed}** échecs (DMs désactivés).`);
  logger.info('DMBlast', `${sent} succès, ${failed} échecs`);
  return true;
}

module.exports = { handleDMBlast };
