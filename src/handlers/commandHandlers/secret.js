// src/handlers/commandHandlers/secret.js
'use strict';
const { openModal } = require('../../systems/secret');
async function handle(interaction) { return openModal(interaction); }
module.exports = { handle };
