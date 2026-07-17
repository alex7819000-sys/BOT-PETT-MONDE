// bot/src/web/statusPage.js — Page publique de statut (affichée à la racine du serveur Render)
'use strict';
const Config = require('../db/models/Config');
const User = require('../db/models/User');
const Election = require('../db/models/Election');
const Ticket = require('../db/models/Ticket');
const StaffScore = require('../db/models/StaffScore');

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Données brutes réutilisables (HTML ET API JSON) ────────────────────────
// Toujours tirées du cache Discord live (client.guilds.cache) → si le nom ou
// l'icône du serveur change sur Discord, c'est reflété ici automatiquement,
// sans rien à modifier dans le code.
async function getStatusData(client) {
  const guildId = process.env.GUILD_ID || client.guilds.cache.first()?.id || null;
  const guild = guildId ? client.guilds.cache.get(guildId) : null;

  let cfg = null, topUsers = [], singeElection = null, ticketsOpen = 0, kingStaff = null;
  if (guildId) {
    [cfg, topUsers, singeElection, ticketsOpen, kingStaff] = await Promise.all([
      Config.findOne({ guildId }).lean().catch(() => null),
      User.find({ guildId }).sort({ totalXp: -1 }).limit(5).lean().catch(() => []),
      Election.findOne({ guildId, type: 'singe', active: false }).sort({ updatedAt: -1 }).lean().catch(() => null),
      Ticket.countDocuments({ guildId, status: 'open' }).catch(() => 0),
      StaffScore.findOne({ guildId }).sort({ weekScore: -1 }).lean().catch(() => null),
    ]);
  }

  const memberOf = (userId) => {
    const m = guild?.members.cache.get(userId);
    return m ? (m.displayName || m.user.username) : `Membre #${String(userId).slice(-4)}`;
  };

  const kingOfDayName = singeElection?.winners?.[0] ? memberOf(singeElection.winners[0]) : null;

  return {
    guildName: guild ? guild.name : null,
    guildIconUrl: guild?.iconURL?.({ size: 256, extension: 'png' }) || null,
    memberCount: guild ? guild.memberCount : null,
    countingCurrent: cfg?.countingCurrent ?? 0,
    countingBest: cfg?.countingBestStreak ?? 0,
    ticketsOpen,
    kingOfDay: kingOfDayName,
    kingStaff: kingStaff ? { name: memberOf(kingStaff.userId), weekScore: kingStaff.weekScore } : null,
    topXp: topUsers.map((u, i) => ({
      rang: i + 1,
      pseudo: u.username || memberOf(u.userId),
      niveau: u.level ?? 0,
      xp: u.totalXp || 0,
    })),
  };
}

async function buildStatusPage(client) {
  const data = await getStatusData(client);

  const topRows = data.topXp.length
    ? data.topXp.map((u) => `
        <tr>
          <td class="rk">#${u.rang}</td>
          <td>${esc(u.pseudo)}</td>
          <td class="num">Niv. ${u.niveau ?? 0}</td>
          <td class="num gold">${(u.xp || 0).toLocaleString('fr-FR')} XP</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">Pas encore de données XP.</td></tr>`;

  const botStatus = client.ws?.status === 0 ? 'En ligne' : 'Connexion…';
  const memberCount = data.memberCount != null ? data.memberCount.toLocaleString('fr-FR') : '—';
  const guildName = data.guildName ? esc(data.guildName) : 'Serveur non configuré';
  const guildIcon = data.guildIconUrl;
  const countingCurrent = data.countingCurrent;
  const countingBest = data.countingBest;
  const ticketsOpen = data.ticketsOpen;
  const kingOfDayName = data.kingOfDay ? esc(data.kingOfDay) : null;
  const kingStaff = data.kingStaff;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${guildName} · King Bot</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👑</text></svg>">
<meta http-equiv="refresh" content="60">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
:root{
  --bg:#100E0A;--surface:#1A160F;--elevated:#221C13;--border:#34291A;
  --gold:#D8AE53;--gold-bright:#F0C975;--garnet:#8C3B49;--garnet-bright:#B5505F;
  --sage:#6B9171;--sage-bright:#87B08D;--text:#F3ECDD;--text-muted:#A89B82;--text-dim:#716654;
}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;
  background-image:radial-gradient(circle at 12% 0%, rgba(216,174,83,0.08), transparent 45%),
                    radial-gradient(circle at 100% 100%, rgba(140,59,73,0.07), transparent 50%);
  min-height:100vh;}
.wrap{max-width:880px;margin:0 auto;padding:48px 24px 70px;}
.hero{display:flex;align-items:center;gap:16px;margin-bottom:34px;}
.hero img{width:56px;height:56px;border-radius:50%;border:1px solid var(--border);}
.hero .ph{width:56px;height:56px;border-radius:50%;background:var(--elevated);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--gold);}
.hero h1{font-family:'Cinzel',serif;font-size:24px;margin:0;color:var(--gold-bright);}
.hero .status{font-size:12.5px;color:var(--sage-bright);display:flex;align-items:center;gap:6px;margin-top:4px;}
.dot{width:7px;height:7px;border-radius:50%;background:var(--sage-bright);display:inline-block;box-shadow:0 0 6px var(--sage-bright);}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:34px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;}
.card .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-dim);margin-bottom:7px;}
.card .v{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:600;color:var(--text);}
.card .v.gold{color:var(--gold-bright);}
.card .v.garnet{color:var(--garnet-bright);}
.section{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--gold);margin:30px 0 14px;display:flex;align-items:center;gap:8px;}
.section::after{content:'';flex:1;height:1px;background:var(--border);}
.king-card{background:linear-gradient(135deg, rgba(216,174,83,0.10), rgba(140,59,73,0.08));border:1px solid var(--border);border-radius:10px;padding:20px;display:flex;align-items:center;gap:14px;}
.king-card .crown{font-size:30px;}
.king-card .name{font-weight:700;font-size:16px;color:var(--gold-bright);}
.king-card .tag{font-size:12px;color:var(--text-muted);}
table{width:100%;border-collapse:collapse;}
th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);padding:8px 10px;border-bottom:1px solid var(--border);}
td{padding:10px 10px;border-bottom:1px solid #2A2218;font-size:13.5px;}
tr:last-child td{border-bottom:none;}
.table-wrap{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.rk{font-family:'JetBrains Mono',monospace;color:var(--gold);width:30px;}
.num{font-family:'JetBrains Mono',monospace;text-align:right;}
.num.gold{color:var(--gold-bright);}
.empty{text-align:center;color:var(--text-dim);padding:24px;}
.footer{margin-top:44px;text-align:center;font-size:12px;color:var(--text-dim);}
.footer a{color:var(--gold);text-decoration:none;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      ${guildIcon ? `<img src="${guildIcon}" alt="">` : `<span class="ph">♛</span>`}
      <div>
        <h1>${guildName}</h1>
        <div class="status"><span class="dot"></span> King Bot — ${botStatus}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card"><div class="l">Membres</div><div class="v">${memberCount}</div></div>
      <div class="card"><div class="l">Compte actuel</div><div class="v gold">${countingCurrent}</div></div>
      <div class="card"><div class="l">Meilleur streak</div><div class="v">${countingBest}</div></div>
      <div class="card"><div class="l">Tickets ouverts</div><div class="v ${ticketsOpen > 0 ? 'garnet' : ''}">${ticketsOpen}</div></div>
    </div>

    <div class="section">👑 Roi du jour</div>
    ${kingOfDayName
      ? `<div class="king-card"><span class="crown">🐒</span><div><div class="name">${kingOfDayName}</div><div class="tag">Élu Roi du jour — couronné (et chambré) par la communauté</div></div></div>`
      : `<div class="king-card"><span class="crown">⏳</span><div><div class="name">Pas encore élu aujourd'hui</div><div class="tag">La cérémonie a lieu chaque soir</div></div></div>`}

    <div class="section">🏆 Top XP</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Rang</th><th>Membre</th><th>Niveau</th><th style="text-align:right;">XP</th></tr></thead>
        <tbody>${topRows}</tbody>
      </table>
    </div>

    ${kingStaff ? `
    <div class="section">🛡️ King Staff de la semaine</div>
    <div class="king-card"><span class="crown">⭐</span><div><div class="name">${esc(kingStaff.name)}</div><div class="tag">${kingStaff.weekScore} points cette semaine</div></div></div>
    ` : ''}

    <div class="footer">
      Cette page se rafraîchit toutes les 60 secondes · King Bot Dashboard pour la configuration complète
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildStatusPage, getStatusData };
