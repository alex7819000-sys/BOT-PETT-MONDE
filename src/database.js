// src/database.js — XP + Niveaux + Badges (v2)

const fs   = require("fs");
const path = require("path");
const DB_PATH = path.join(__dirname, "../data/xp.json");

// ── Formule de niveau identique à MEE6 ────────────────────────────────────
function xpForLevel(level) {
  return 5 * (level ** 2) + 50 * level + 100;
}

function getLevelFromXP(totalXp) {
  let level = 0, accumulated = 0;
  while (true) {
    const needed = xpForLevel(level);
    if (accumulated + needed > totalXp) return level;
    accumulated += needed;
    level++;
  }
}

function xpInCurrentLevel(totalXp) {
  let level = 0, accumulated = 0;
  while (true) {
    const needed = xpForLevel(level);
    if (accumulated + needed > totalXp) {
      return { current: totalXp - accumulated, needed, level };
    }
    accumulated += needed;
    level++;
  }
}

// ── Barre de progression ASCII (style MEE6) ───────────────────────────────
function progressBar(current, needed, length = 14) {
  const pct   = Math.min(current / needed, 1);
  const filled = Math.round(pct * length);
  const bar   = "█".repeat(filled) + "░".repeat(length - filled);
  return `\`${bar}\` ${Math.round(pct * 100)}%`;
}

// ── Badges dynamiques ─────────────────────────────────────────────────────
const BADGE_DEFS = [
  { id: "first_crown",  label: "👑",  title: "Premier Roi",       fn: u => u.crownCount >= 1   },
  { id: "triple",       label: "🏆",  title: "Triple Couronne",    fn: u => u.crownCount >= 3   },
  { id: "legend",       label: "⚡",  title: "Légende",            fn: u => u.crownCount >= 10  },
  { id: "chatterbox",   label: "💬",  title: "Grande Gueule",      fn: u => u.totalXp  >= 10000 },
  { id: "veteran",      label: "🎖️", title: "Vétéran",            fn: u => u.totalXp  >= 50000 },
];

function getUserBadges(userData) {
  return BADGE_DEFS.filter(b => b.fn(userData));
}

// ── I/O ───────────────────────────────────────────────────────────────────
function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, history: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}
function save(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }

function ensure(db, id) {
  if (!db.users[id]) {
    db.users[id] = { xp: 0, totalXp: 0, lastMessage: 0, crownCount: 0 };
  }
}

// ── API ───────────────────────────────────────────────────────────────────
function getUser(userId) {
  const db = load(); ensure(db, userId); return db.users[userId];
}

function addXP(userId, amount) {
  const db = load(); ensure(db, userId);
  const before = getLevelFromXP(db.users[userId].totalXp);
  db.users[userId].xp      += amount;
  db.users[userId].totalXp += amount;
  const after = getLevelFromXP(db.users[userId].totalXp);
  save(db);
  return { newXp: db.users[userId].xp, levelUp: after > before, newLevel: after };
}

function resetWeeklyXP() {
  const db = load();
  for (const id of Object.keys(db.users)) db.users[id].xp = 0;
  save(db);
}

function getLeaderboard(limit = 10) {
  const db = load();
  return Object.entries(db.users)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

function getTopUser() {
  const lb = getLeaderboard(1);
  return lb.length && lb[0].xp > 0 ? lb[0] : null;
}

function incrementCrown(userId) {
  const db = load(); ensure(db, userId);
  db.users[userId].crownCount = (db.users[userId].crownCount || 0) + 1;
  save(db);
  return db.users[userId].crownCount;
}

function addKingHistory(userId, xp, date) {
  const db = load();
  db.history.unshift({ userId, xp, date, timestamp: Date.now() });
  if (db.history.length > 52) db.history = db.history.slice(0, 52);
  save(db);
}

function getKingHistory(limit = 5) {
  const db = load();
  return (db.history || []).slice(0, limit);
}

module.exports = {
  getUser, addXP, resetWeeklyXP, getLeaderboard, getTopUser,
  incrementCrown, addKingHistory, getKingHistory,
  getLevelFromXP, xpInCurrentLevel, progressBar, getUserBadges,
};
