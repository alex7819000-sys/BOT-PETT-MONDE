// src/systems/roleRewards.js — Attribution des rôles liés à l'XP.
// Un SEUL endroit pour cette logique, appelé à la fois par le gain d'XP texte
// (messageCreate) et par le gain d'XP vocal (cron creditVoiceXp) — avant, seul
// le texte l'appliquait, donc un membre actif uniquement en vocal pouvait monter
// de niveau sans jamais recevoir ses rôles. Corrigé en centralisant ici.
'use strict';

/**
 * Rôles de niveau principaux (permanents). Cumulables (stackable) ou évolutifs
 * (le nouveau remplace l'ancien).
 */
async function applyLevelRoles(member, cfg, newLevel) {
  if (!member || !cfg?.levelRoles?.length) return;

  const allSorted = [...cfg.levelRoles].sort((a, b) => b.level - a.level);
  const topEvolutif = allSorted.find(lr => !lr.stackable && lr.level <= newLevel);

  for (const lr of allSorted) {
    if (lr.stackable) {
      if (lr.level <= newLevel && !member.roles.cache.has(lr.roleId)) {
        await member.roles.add(lr.roleId).catch(() => {});
      }
    } else if (topEvolutif && lr.roleId === topEvolutif.roleId) {
      if (!member.roles.cache.has(lr.roleId)) await member.roles.add(lr.roleId).catch(() => {});
    } else if (member.roles.cache.has(lr.roleId)) {
      await member.roles.remove(lr.roleId).catch(() => {});
    }
  }
}

/**
 * Rôles hebdomadaires (basés sur weekXp, reset chaque dimanche). Un seul actif
 * à la fois — le plus haut palier atteint remplace le précédent.
 * `tipTarget` = message ou objet {author} minimal, pour prévenir le membre en DM
 * quand un nouveau palier hebdo est débloqué (optionnel, jamais bloquant).
 */
async function applyWeeklyRoles(member, cfg, weekXp, tipTarget = null) {
  if (!member || !cfg?.weeklyLevelRoles?.length) return;

  const weekSorted = [...cfg.weeklyLevelRoles].sort((a, b) => b.level - a.level);
  const weekMatch  = weekSorted.find(lr => lr.level <= weekXp);

  for (const lr of weekSorted) {
    const hasIt = member.roles.cache.has(lr.roleId);
    if (weekMatch && lr.roleId === weekMatch.roleId) {
      if (!hasIt) {
        await member.roles.add(lr.roleId).catch(() => {});
        if (tipTarget) {
          const roleObj = member.guild.roles.cache.get(lr.roleId);
          if (roleObj) {
            const { sendTip, TIPS } = require('./tips');
            await sendTip(tipTarget, TIPS.weeklyRoleUp(roleObj.name, weekXp));
          }
        }
      }
    } else if (hasIt) {
      await member.roles.remove(lr.roleId).catch(() => {});
    }
  }
}

module.exports = { applyLevelRoles, applyWeeklyRoles };
