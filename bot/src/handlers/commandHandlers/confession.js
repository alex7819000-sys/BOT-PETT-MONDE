// src/handlers/commandHandlers/confession.js — /confession : ouvre directement le modal de confession anonyme
'use strict';
const { openConfessionModal } = require('../../systems/confession');
async function handle(interaction) { return openConfessionModal(interaction); }
module.exports = { handle };
