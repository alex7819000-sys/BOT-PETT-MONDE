'use strict';

const { Table7777UserModel, Table7777RoleMap } = require('../db/models/Table7777');
const logger = require('../utils/logger');

const MAX_NUMBER   = 7777;
const COOLDOWN_MS  = 30 * 1000; // 30 secondes

/**
 * Tire un chiffre entre 1 et 7777.
 * Les chiffres spéciaux (ceux liés à un rôle) ont une chance légèrement réduite
 * car ils sont rares — mais n'importe quel chiffre peut tomber.
 */
function drawNumber() {
  return Math.floor(Math.random() * MAX_NUMBER) + 1; // 1 à 7777
}

/**
 * Vérifie le cooldown. Retourne { ok, remainingMs }
 */
function checkCooldown(lastRoll) {
  if (!lastRoll) return { ok: true, remainingMs: 0 };
  const elapsed = Date.now() - new Date(lastRoll).getTime();
  if (elapsed < COOLDOWN_MS) {
    return { ok: false, remainingMs: COOLDOWN_MS - elapsed };
  }
  return { ok: true, remainingMs: 0 };
}

/**
 * Effectue un tirage pour un utilisateur.
 * Retourne toutes les infos nécessaires au handler.
 */
async function rollTable7777(userId, guildId) {
  // Récupérer ou créer profil
  let profile = await Table7777UserModel.findOne({ userId, guildId });
  if (!profile) {
    profile = new Table7777UserModel({ userId, guildId, rolesObtained: [] });
  }

  // Vérifier cooldown
  const cd = checkCooldown(profile.lastRoll);
  if (!cd.ok) {
    return { cooldown: true, remainingMs: cd.remainingMs };
  }

  const number = drawNumber();

  // Vérifier si ce chiffre est lié à un rôle
  const roleEntry = await Table7777RoleMap.findOne({ guildId, number }).lean();
  const hasRole = roleEntry && !profile.rolesObtained.includes(roleEntry.roleId);
  const alreadyHasRole = roleEntry && profile.rolesObtained.includes(roleEntry.roleId);

  if (hasRole) {
    profile.rolesObtained.push(roleEntry.roleId);
  }

  profile.totalRolls += 1;
  profile.lastRoll = new Date();
  await profile.save();

  return {
    cooldown: false,
    number,
    totalRolls: profile.totalRolls,
    roleEntry: roleEntry || null,      // { number, roleId, roleName } ou null
    isNewRole: hasRole,                // true = rôle gagné pour la 1ère fois
    alreadyHasRole,                    // true = rôle déjà possédé
  };
}

/**
 * Tire un chiffre libre (non encore lié à un rôle) au hasard entre 1 et MAX_NUMBER.
 * Utilisé quand un admin ajoute un rôle sans préciser de chiffre.
 */
async function getRandomFreeNumber(guildId) {
  const taken = await Table7777RoleMap.find({ guildId }).distinct('number');
  const takenSet = new Set(taken);

  if (takenSet.size >= MAX_NUMBER) return null; // plus aucun chiffre libre

  let number;
  do {
    number = Math.floor(Math.random() * MAX_NUMBER) + 1;
  } while (takenSet.has(number));

  return number;
}

/**
 * Ajouter ou mettre à jour une liaison chiffre → rôle
 */
async function addRoleMap(guildId, number, roleId, roleName) {
  await Table7777RoleMap.findOneAndUpdate(
    { guildId, number },
    { $set: { roleId, roleName } },
    { upsert: true }
  );
}

/**
 * Supprimer une liaison
 */
async function removeRoleMap(guildId, number) {
  const deleted = await Table7777RoleMap.findOneAndDelete({ guildId, number });
  return !!deleted;
}

/**
 * Lister toutes les liaisons d'un serveur
 */
async function listRoleMaps(guildId) {
  return Table7777RoleMap.find({ guildId }).sort({ number: 1 }).lean();
}

/**
 * Récupère le profil d'un utilisateur (pour /7777 collection)
 */
async function getUserProfile(userId, guildId) {
  return Table7777UserModel.findOne({ userId, guildId }).lean();
}

/**
 * Classement global — top 10 par nombre de tirages
 */
async function getLeaderboard(guildId) {
  return Table7777UserModel.find({ guildId })
    .sort({ totalRolls: -1 })
    .limit(10)
    .lean();
}

module.exports = {
  rollTable7777,
  addRoleMap,
  removeRoleMap,
  listRoleMaps,
  getUserProfile,
  getLeaderboard,
  getRandomFreeNumber,
  MAX_NUMBER,
  COOLDOWN_MS,
};
