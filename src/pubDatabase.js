// src/pubDatabase.js — Gestion des publicités CVForge

const fs   = require("fs");
const path = require("path");
const PUB_PATH = path.join(__dirname, "../data/pubs.json");

function load() {
  if (!fs.existsSync(PUB_PATH)) {
    fs.mkdirSync(path.dirname(PUB_PATH), { recursive: true });
    fs.writeFileSync(PUB_PATH, JSON.stringify({ pubs: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(PUB_PATH, "utf-8"));
}
function save(d) { fs.writeFileSync(PUB_PATH, JSON.stringify(d, null, 2)); }

// ── Créer une pub ──────────────────────────────────────────────────────────
// scheduledTime = "20:30" ou null (= intervalle en minutes)
// intervalMinutes = null si scheduledTime est défini
function createPub({ channelId, lien, description, scheduledTime, intervalMinutes, createdBy }) {
  const db  = load();
  const pub = {
    id:              Date.now().toString(),
    channelId,
    lien,
    description,
    scheduledTime:   scheduledTime   || null,   // ex: "20:30"
    intervalMinutes: intervalMinutes || null,   // ex: 60
    active:          true,
    createdBy,
    createdAt:       new Date().toISOString(),
    lastSent:        null,
    sentCount:       0,
  };
  db.pubs.push(pub);
  save(db);
  return pub;
}

function getAllPubs()    { return load().pubs; }
function getActivePubs(){ return load().pubs.filter(p => p.active); }

function getPubById(id) {
  return load().pubs.find(p => p.id === id) || null;
}

function deletePub(id) {
  const db = load();
  db.pubs  = db.pubs.filter(p => p.id !== id);
  save(db);
}

function togglePub(id, active) {
  const db  = load();
  const pub = db.pubs.find(p => p.id === id);
  if (pub) { pub.active = active; save(db); }
  return pub;
}

function markSent(id) {
  const db  = load();
  const pub = db.pubs.find(p => p.id === id);
  if (pub) {
    pub.lastSent  = new Date().toISOString();
    pub.sentCount = (pub.sentCount || 0) + 1;
    save(db);
  }
}

module.exports = { createPub, getAllPubs, getActivePubs, getPubById, deletePub, togglePub, markSent };
