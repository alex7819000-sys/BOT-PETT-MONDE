// src/systems/archive.js — Archivage des tickets (v107)
// Quand un ticket se termine (fermé / accepté / refusé), on poste UNE fiche (embed) + la conversation
// en fichier texte (+ les images recopiées) dans le salon d'archives du bon type, réglé dans le dashboard.
// Le salon du ticket n'est supprimé qu'APRÈS un archivage réussi.
'use strict';
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const logger = require('../utils/logger');

const KEYS = { ticket: 'archiveTicketChannelId', partner: 'archivePartnerChannelId', staff: 'archiveStaffChannelId' };
const MAX_MESSAGES = 1000;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // limite d'upload prudente (serveur sans boost)
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGES = 5;

const fmt = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

async function fetchAllMessages(channel) {
  const all = [];
  let before;
  while (all.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function transcriptText(channel, messages) {
  const lines = [`Archive du salon #${channel.name} — ${messages.length} message(s)`, '='.repeat(60), ''];
  for (const m of messages) {
    const who = `${m.author?.tag || 'inconnu'}${m.author?.bot ? ' [BOT]' : ''}`;
    let line = `[${fmt(m.createdTimestamp)}] ${who}: ${m.content || ''}`;
    for (const e of m.embeds || []) {
      const bits = [e.title, e.description, ...(e.fields || []).map((f) => `${f.name}: ${f.value}`)].filter(Boolean);
      if (bits.length) line += `\n    [embed] ${bits.join(' | ')}`;
    }
    for (const a of m.attachments?.values() || []) line += `\n    📎 ${a.name} — ${a.url}`;
    lines.push(line);
  }
  return lines.join('\n');
}

async function collectImages(messages) {
  const files = [];
  let total = 0;
  for (const m of messages) {
    for (const a of m.attachments?.values() || []) {
      if (files.length >= MAX_IMAGES) return files;
      if (!(a.contentType || '').startsWith('image/') || a.size > MAX_IMAGE_BYTES || total + a.size > MAX_TOTAL_BYTES / 2) continue;
      try {
        const res = await fetch(a.url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        total += buf.length;
        files.push(new AttachmentBuilder(buf, { name: `${files.length + 1}-${a.name}` }));
      } catch { /* image perdue : le lien reste dans le fichier texte */ }
    }
  }
  return files;
}

/**
 * @param opts { kind:'ticket'|'partner'|'staff', cfg, title, color, fields:[{name,value,inline}] }
 * @returns {Promise<{configured:boolean, ok:boolean, reason?:string}>}
 */
async function archiveConversation(guild, channel, opts) {
  const key = KEYS[opts.kind];
  const archId = opts.cfg && key ? opts.cfg[key] : null;
  if (!archId) return { configured: false, ok: false };
  try {
    const archCh = guild.channels.cache.get(archId);
    if (!archCh || !archCh.isTextBased()) return { configured: true, ok: false, reason: 'salon d\'archives introuvable ou invalide' };

    const messages = await fetchAllMessages(channel);
    const txt = Buffer.from(transcriptText(channel, messages), 'utf8');
    const files = [new AttachmentBuilder(txt.length > MAX_TOTAL_BYTES / 2 ? txt.subarray(0, MAX_TOTAL_BYTES / 2) : txt, { name: `${channel.name}.txt` })];
    files.push(...await collectImages(messages));

    const embed = new EmbedBuilder()
      .setColor(opts.color)
      .setTitle(opts.title)
      .addFields((opts.fields || []).filter((f) => f && f.value).map((f) => ({ name: f.name, value: String(f.value).slice(0, 1024), inline: !!f.inline })))
      .addFields({ name: '💬 Messages', value: `${messages.length}`, inline: true }, { name: '🗂️ Salon', value: `#${channel.name}`, inline: true })
      .setTimestamp();
    await archCh.send({ embeds: [embed], files });
    return { configured: true, ok: true };
  } catch (err) {
    logger.error('Archive', `Archivage impossible pour #${channel?.name}`, err);
    return { configured: true, ok: false, reason: 'le bot ne peut pas écrire dans le salon d\'archives (permissions ?)' };
  }
}

module.exports = { archiveConversation };
