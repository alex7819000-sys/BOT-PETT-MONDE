// src/handlers/commandHandlers/confession.js
'use strict';
const { openConfessionModal } = require('../../systems/confession');
async function handle(interaction) { return openConfessionModal(interaction); }
module.exports = { handle };
