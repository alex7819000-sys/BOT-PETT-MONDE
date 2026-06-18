'use strict';
const LEVELS = { OWNER: 10, COOWNER: 9, ADMIN: 8, MODERATEUR: 7, ANIMATEUR: 6, TECHNICIEN: 5, STAGIAIRE: 4, MEMBRE: 1 };
function getOwnerId() { return process.env.OWNER_ID || ''; }
async function setCoOwner(guildId, userId) { return true; }
async function removeCoOwner(guildId, userId) { return true; }
async function getMemberLevel(member, config) { return LEVELS.MEMBRE; }
async function applyRolePermissions(guild, config) { return true; }
module.exports = { LEVELS, getOwnerId, setCoOwner, removeCoOwner, getMemberLevel, applyRolePermissions };
