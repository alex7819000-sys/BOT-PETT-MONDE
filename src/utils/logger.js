// src/utils/logger.js
'use strict';

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function ts() { return new Date().toISOString().slice(11, 19); }

const logger = {
  error: (mod, msg, err) => { if (LEVEL >= 0) console.error(`[${ts()}] ❌  [${mod}] ${msg}`, err?.message ?? ''); },
  warn:  (mod, msg)       => { if (LEVEL >= 1) console.warn (`[${ts()}] ⚠️  [${mod}] ${msg}`); },
  info:  (mod, msg)       => { if (LEVEL >= 2) console.log  (`[${ts()}] ℹ️  [${mod}] ${msg}`); },
  debug: (mod, msg)       => { if (LEVEL >= 3) console.log  (`[${ts()}] 🔍  [${mod}] ${msg}`); },
};

module.exports = logger;
