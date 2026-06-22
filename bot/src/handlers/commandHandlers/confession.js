// src/handlers/commandHandlers/confession.js — /confession (alias de /secret)
'use strict';
const secret = require('./secret');
module.exports = { handle: secret.handle };
