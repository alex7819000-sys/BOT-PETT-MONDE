'use strict';
// dashboard/lib/embedSender.js
// Construit un message Discord (texte + embed + boutons) à partir d'un embed sauvegardé,
// vérifie les limites de Discord AVANT d'envoyer, et renvoie une erreur lisible
// (au lieu d'échouer en silence comme avant la v102).

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} = require('discord.js');

// Boutons "action" : branchés sur de vrais handlers du bot (bot/src/handlers/buttons.js)
const ACTIONS = {
  ticket:  'ticket:open:support', // ouvre un ticket
  report:  'sigrep:start',        // panneau de signalement (systems/reportPanel.js)
  staff:   'staff:candidater',    // candidature staff
  partner: 'partner:demande',     // demande de partenariat
};
const ACTION_LABELS = {
  ticket: 'Ouvrir un ticket', report: 'Faire un signalement',
  staff: 'Candidater au staff', partner: 'Demande de partenariat',
};
const STYLE_MAP = {
  primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success, danger: ButtonStyle.Danger,
};

const LIMITS = {
  content: 2000, title: 256, description: 4096, author: 256, footer: 2048,
  fields: 25, fieldName: 256, fieldValue: 1024, total: 6000, buttons: 25, buttonLabel: 80,
};

const isHttpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || ''));

/**
 * @returns {{ payload: object|null, errors: string[] }}
 */
function buildMessage(data) {
  const errors = [];
  const d = data || {};
  const str = (v) => (typeof v === 'string' ? v : '');

  const content     = str(d.content).trim();
  const title       = str(d.title).trim();
  const description = str(d.description).trim();
  const author      = str(d.author).trim();
  const footer      = str(d.footer).trim();
  const fields      = Array.isArray(d.fields) ? d.fields.filter(Boolean) : [];

  // ── Limites de taille ──────────────────────────────────────────
  if (content.length > LIMITS.content)         errors.push(`Le texte au-dessus de l'embed dépasse ${LIMITS.content} caractères (${content.length}).`);
  if (title.length > LIMITS.title)             errors.push(`Le titre dépasse ${LIMITS.title} caractères (${title.length}).`);
  if (description.length > LIMITS.description) errors.push(`La description dépasse ${LIMITS.description} caractères (${description.length}).`);
  if (author.length > LIMITS.author)           errors.push(`Le nom de l'auteur dépasse ${LIMITS.author} caractères.`);
  if (footer.length > LIMITS.footer)           errors.push(`Le footer dépasse ${LIMITS.footer} caractères.`);
  if (fields.length > LIMITS.fields)           errors.push(`Maximum ${LIMITS.fields} champs par embed (${fields.length}).`);
  fields.forEach((f, i) => {
    if (str(f.name).length > LIMITS.fieldName)   errors.push(`Le nom du champ ${i + 1} dépasse ${LIMITS.fieldName} caractères.`);
    if (str(f.value).length > LIMITS.fieldValue) errors.push(`La valeur du champ ${i + 1} dépasse ${LIMITS.fieldValue} caractères.`);
  });
  const total = title.length + description.length + author.length + footer.length +
    fields.reduce((n, f) => n + str(f.name).length + str(f.value).length, 0);
  if (total > LIMITS.total) errors.push(`Au total l'embed fait ${total} caractères, Discord accepte ${LIMITS.total} maximum.`);

  // ── URLs ───────────────────────────────────────────────────────
  const urlChecks = [
    ['image', 'L\'image'], ['thumbnail', 'La miniature'], ['footerIcon', 'L\'icône du footer'],
    ['authorIcon', 'L\'icône de l\'auteur'], ['authorUrl', 'Le lien de l\'auteur'], ['titleUrl', 'Le lien du titre'],
  ];
  for (const [key, label] of urlChecks) {
    const v = str(d[key]).trim();
    if (v && !isHttpUrl(v)) errors.push(`${label} doit être une adresse commençant par https:// (reçu : « ${v.slice(0, 40)} »).`);
  }

  // ── Couleur ────────────────────────────────────────────────────
  let color = 0xe2c97e;
  const rawColor = str(d.color).trim();
  if (rawColor) {
    if (/^#?[0-9a-f]{6}$/i.test(rawColor)) color = parseInt(rawColor.replace('#', ''), 16);
    else errors.push(`La couleur « ${rawColor} » n'est pas valide (format attendu : #RRGGBB, ex. #FFAA00).`);
  }

  // ── Embed ──────────────────────────────────────────────────────
  const hasEmbed = !!(title || description || author || footer || fields.length || str(d.image).trim() || str(d.thumbnail).trim());
  const embeds = [];
  if (hasEmbed && !errors.length) {
    const e = new EmbedBuilder().setColor(color);
    if (author) {
      const a = { name: author };
      if (str(d.authorIcon).trim()) a.iconURL = d.authorIcon.trim();
      if (str(d.authorUrl).trim())  a.url = d.authorUrl.trim();
      e.setAuthor(a);
    }
    if (title) { e.setTitle(title); if (str(d.titleUrl).trim()) e.setURL(d.titleUrl.trim()); }
    if (description) e.setDescription(description);
    if (str(d.image).trim())     e.setImage(d.image.trim());
    if (str(d.thumbnail).trim()) e.setThumbnail(d.thumbnail.trim());
    if (footer) e.setFooter({ text: footer, iconURL: str(d.footerIcon).trim() || undefined });
    if (d.timestamp) e.setTimestamp(new Date());
    if (fields.length) {
      e.addFields(fields.map((f) => ({
        name: str(f.name).trim() || '​', value: str(f.value).trim() || '​', inline: !!f.inline,
      })));
    }
    embeds.push(e);
  }

  // ── Boutons ────────────────────────────────────────────────────
  const buttons = Array.isArray(d.buttons) ? d.buttons.filter(Boolean) : [];
  if (buttons.length > LIMITS.buttons) errors.push(`Maximum ${LIMITS.buttons} boutons par message (${buttons.length}).`);
  const built = [];
  const usedActions = new Set();
  buttons.slice(0, LIMITS.buttons).forEach((b, i) => {
    const label = str(b.label).trim();
    const emoji = str(b.emoji).trim();
    const action = b.action || 'link';
    if (label.length > LIMITS.buttonLabel) { errors.push(`Le texte du bouton ${i + 1} dépasse ${LIMITS.buttonLabel} caractères.`); return; }
    if (!label && !emoji) { errors.push(`Le bouton ${i + 1} n'a ni texte ni emoji.`); return; }
    const btn = new ButtonBuilder();
    if (label) btn.setLabel(label);
    if (emoji) { try { btn.setEmoji(emoji); } catch { errors.push(`L'emoji du bouton ${i + 1} (« ${emoji} ») n'est pas valide.`); return; } }
    if (action === 'link') {
      if (!isHttpUrl(b.url)) { errors.push(`Le bouton « ${label || emoji} » est de type lien mais n'a pas d'adresse https:// valide.`); return; }
      btn.setStyle(ButtonStyle.Link).setURL(b.url.trim());
    } else if (ACTIONS[action]) {
      if (usedActions.has(action)) { errors.push(`Deux boutons font la même action (« ${ACTION_LABELS[action]} ») : Discord n'accepte pas deux fois le même bouton dans un message.`); return; }
      usedActions.add(action);
      btn.setStyle(STYLE_MAP[b.style] || ButtonStyle.Primary).setCustomId(ACTIONS[action]);
    } else {
      errors.push(`Le bouton « ${label || emoji} » n'a pas d'action valide.`); return;
    }
    built.push(btn);
  });
  const components = [];
  for (let i = 0; i < built.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(built.slice(i, i + 5)));
  }

  if (!content && !embeds.length && !built.length && !errors.length) {
    errors.push('Le message est vide : ajoute au moins un titre, une description, un champ, une image ou un texte.');
  }
  if (errors.length) return { payload: null, errors };
  return { payload: { content: content || undefined, embeds, components }, errors: [] };
}

/**
 * Envoie un nouveau message, ou modifie un message déjà posté (mode 'edit').
 * @returns {Promise<{ok:boolean, error?:string, messageId?:string, channelId?:string}>}
 */
async function sendOrEdit(client, guildId, data, mode, opts) {
  try {
    if (!client || !client.user) return { ok: false, error: 'Le bot n\'est pas connecté à Discord pour le moment, réessaie dans une minute.' };
    const { payload, errors } = buildMessage(data);
    if (errors.length) return { ok: false, error: errors.join(' ') };

    const channelId = (opts && opts.channelId) || data.channelId;
    if (!channelId) return { ok: false, error: 'Choisis un salon de destination.' };
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.guildId !== guildId) {
      return { ok: false, error: 'Salon introuvable (supprimé, ou n\'appartient pas à ce serveur).' };
    }

    const me = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
    const perms = me && channel.permissionsFor(me);
    if (!perms || !perms.has(PermissionFlagsBits.ViewChannel)) return { ok: false, error: `Le bot ne voit pas #${channel.name} (permission « Voir le salon » manquante).` };
    if (!perms.has(PermissionFlagsBits.SendMessages))          return { ok: false, error: `Le bot ne peut pas écrire dans #${channel.name} (permission « Envoyer des messages » manquante).` };
    if (payload.embeds.length && !perms.has(PermissionFlagsBits.EmbedLinks)) return { ok: false, error: `Le bot n'a pas la permission « Intégrer des liens » dans #${channel.name}, les embeds ne s'afficheraient pas.` };

    if (mode === 'edit') {
      const mid = (opts && opts.messageId) || data.messageId;
      const mch = (opts && opts.messageChannelId) || data.messageChannelId || channelId;
      const msgChannel = mch === channel.id ? channel : (client.channels.cache.get(mch) || await client.channels.fetch(mch).catch(() => null));
      const msg = mid && msgChannel && msgChannel.guildId === guildId ? await msgChannel.messages.fetch(mid).catch(() => null) : null;
      if (!msg) return { ok: false, error: 'Le message posté est introuvable (il a été supprimé ?). Utilise « Envoyer » pour en poster un nouveau.' };
      if (msg.author.id !== client.user.id) return { ok: false, error: 'Ce message n\'a pas été posté par le bot, impossible de le modifier.' };
      await msg.edit({ content: payload.content || '', embeds: payload.embeds, components: payload.components });
      return { ok: true, messageId: msg.id, channelId: msgChannel.id };
    }

    const sent = await channel.send(payload);
    return { ok: true, messageId: sent.id, channelId: channel.id };
  } catch (err) {
    console.error('[dashboard embeds] send error:', err.message);
    return { ok: false, error: `Discord a refusé le message : ${err.message}` };
  }
}

module.exports = { buildMessage, sendOrEdit, ACTIONS, ACTION_LABELS, LIMITS };
