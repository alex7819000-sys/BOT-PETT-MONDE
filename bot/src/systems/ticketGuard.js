// src/systems/ticketGuard.js — Protections anti-spam à l'ouverture d'un ticket (v109)
// checkCanOpen() renvoie un message d'erreur (string) si l'ouverture doit être refusée, sinon null.
// Le staff n'est jamais limité (sauf blocage explicite impossible : il n'est pas bloquable ici).
'use strict';
const mongoose = require('mongoose');
const Config = require('../db/models/Config');
const Ticket = require('../db/models/Ticket');
const TicketBlock = require('../db/models/TicketBlock');
const { isTicketStaff } = require('../utils/staffCheck');
const logger = require('../utils/logger');

const DEFAULTS = { maxOpen: 3, cooldownMin: 10, refusalDays: 7 };
const RAID_WINDOW_MS = 10 * 60 * 1000;
const RAID_THRESHOLD = 10;
const lastRaidAlert = new Map(); // guildId -> timestamp

// nombre >= 0 ou valeur par défaut (0 = désactivé)
const num = (v, d) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) || Number(v) < 0 ? d : Number(v));

function models() {
  require('./partenariat'); require('./staff'); // enregistre les modèles PartnerTicket / StaffTicket
  return { Partner: mongoose.models.PartnerTicket, Staff: mongoose.models.StaffTicket };
}

async function checkCanOpen(interaction, kind) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const cfg = await Config.findOne({ guildId }).lean();

  const blk = await TicketBlock.findOne({ guildId, userId }).lean();
  if (blk && blk.blocked) {
    return '🚫 Tu ne peux plus ouvrir de ticket sur ce serveur. Si tu penses que c\'est une erreur, contacte un membre du staff en message privé.';
  }
  if (await isTicketStaff(interaction)) return null;

  const maxOpen = num(cfg?.ticketMaxOpen, DEFAULTS.maxOpen);
  const cooldownMin = num(cfg?.ticketCooldownMin, DEFAULTS.cooldownMin);
  const refusalDays = num(cfg?.ticketRefusalDays, DEFAULTS.refusalDays);
  const { Partner, Staff } = models();
  const now = Date.now();

  // 1) Trop de tickets déjà ouverts
  if (maxOpen > 0) {
    const [a, b, c] = await Promise.all([
      Ticket.countDocuments({ guildId, userId, status: 'open' }),
      Partner.countDocuments({ guildId, applicantId: userId, status: 'open' }),
      Staff.countDocuments({ guildId, applicantId: userId, status: { $in: ['open', 'en_attente'] } }),
    ]);
    if (a + b + c >= maxOpen) return `❌ Tu as déjà ${a + b + c} ticket(s) ouvert(s). Attends qu'ils soient traités avant d'en ouvrir un nouveau.`;
  }

  // 2) Délai après un ticket fermé
  if (kind === 'ticket' && cooldownMin > 0) {
    const last = await Ticket.findOne({ guildId, userId, status: 'closed' }).sort({ closedAt: -1 }).lean();
    if (last?.closedAt) {
      const left = cooldownMin * 60000 - (now - new Date(last.closedAt).getTime());
      if (left > 0) return `⏳ Tu as fermé un ticket il y a peu. Réessaie dans ${Math.ceil(left / 60000)} minute(s).`;
    }
  }

  // 3) Délai après un refus (partenariat / candidature)
  if ((kind === 'partner' || kind === 'staff') && refusalDays > 0) {
    const M = kind === 'partner' ? Partner : Staff;
    const field = 'applicantId';
    const refused = await M.findOne({ guildId, [field]: userId, status: 'refuse' }).sort({ updatedAt: -1 }).lean();
    if (refused?.updatedAt) {
      const left = refusalDays * 86400000 - (now - new Date(refused.updatedAt).getTime());
      if (left > 0) return `⏳ Ta précédente demande a été refusée. Tu pourras en refaire une dans ${Math.ceil(left / 86400000)} jour(s).`;
    }
  }

  // 4) Alerte raid : trop de demandes sur tout le serveur en peu de temps
  const since = new Date(now - RAID_WINDOW_MS);
  const [r1, r2, r3] = await Promise.all([
    Ticket.countDocuments({ guildId, createdAt: { $gt: since } }),
    Partner.countDocuments({ guildId, createdAt: { $gt: since } }),
    Staff.countDocuments({ guildId, createdAt: { $gt: since } }),
  ]);
  if (r1 + r2 + r3 >= RAID_THRESHOLD) {
    if (now - (lastRaidAlert.get(guildId) || 0) > RAID_WINDOW_MS) {
      lastRaidAlert.set(guildId, now);
      const logCh = interaction.guild.channels.cache.get(cfg?.logsChannelId || cfg?.logChannelId);
      const role = cfg?.staffRoleId ? `<@&${cfg.staffRoleId}> ` : '';
      logCh?.send({ content: `${role}🚨 **${r1 + r2 + r3} tickets ouverts en moins de 10 minutes** — possible spam. Les nouvelles ouvertures sont refusées temporairement.` }).catch(() => {});
      logger.warn('TicketGuard', `Alerte spam tickets sur ${guildId}`);
    }
    return '⏳ Beaucoup de demandes en ce moment. Réessaie dans quelques minutes.';
  }
  return null;
}

// Un ticket fermé avec le motif « Spam » : +1 avertissement, blocage à 3
async function addSpamStrike(guildId, userId) {
  const rec = await TicketBlock.findOneAndUpdate({ guildId, userId }, { $inc: { strikes: 1 } }, { upsert: true, new: true });
  if (rec.strikes >= 3 && !rec.blocked) {
    rec.blocked = true; rec.blockedAt = new Date(); rec.reason = '3 tickets fermés pour spam';
    await rec.save();
    return { strikes: rec.strikes, justBlocked: true };
  }
  return { strikes: rec.strikes, justBlocked: false };
}

module.exports = { checkCanOpen, addSpamStrike, DEFAULTS };
