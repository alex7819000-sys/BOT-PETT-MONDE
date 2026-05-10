// src/mongodb.js — Connexion MongoDB Atlas

const { MongoClient } = require("mongodb");

let client = null;
let db     = null;

async function connectMongo() {
  if (db) return db;
  
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[MONGO] ⚠️ MONGODB_URI non défini — utilisation fichiers JSON locaux");
    return null;
  }

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("kingbot");
    console.log("✅ [MONGO] Connecté à MongoDB Atlas !");
    return db;
  } catch (err) {
    console.error("[MONGO] ❌ Erreur connexion:", err.message);
    return null;
  }
}

function getDB() { return db; }

// Collections
function col(name) {
  if (!db) throw new Error("MongoDB non connecté");
  return db.collection(name);
}

// Helper upsert
async function upsert(collection, filter, data) {
  try {
    await col(collection).updateOne(filter, { $set: data }, { upsert: true });
    return true;
  } catch (err) {
    console.error(`[MONGO] upsert ${collection}:`, err.message);
    return false;
  }
}

async function findOne(collection, filter) {
  try {
    return await col(collection).findOne(filter);
  } catch (err) {
    console.error(`[MONGO] findOne ${collection}:`, err.message);
    return null;
  }
}

async function findMany(collection, filter = {}, sort = {}) {
  try {
    return await col(collection).find(filter).sort(sort).toArray();
  } catch (err) {
    console.error(`[MONGO] findMany ${collection}:`, err.message);
    return [];
  }
}

async function deleteOne(collection, filter) {
  try {
    await col(collection).deleteOne(filter);
    return true;
  } catch (err) {
    return false;
  }
}

async function increment(collection, filter, field, amount = 1) {
  try {
    await col(collection).updateOne(filter, { $inc: { [field]: amount } }, { upsert: true });
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = { connectMongo, getDB, upsert, findOne, findMany, deleteOne, increment };
