// src/handlers/commandHandlers/annonce.js
'use strict';
const { postAnnonce } = require('../../systems/animation');
module.exports = async function handleAnnonce(interaction, client) {
  return postAnnonce(interaction, client);
};
