'use strict';
const logger = {
  info:  (tag, msg, ...args) => console.log(`[INFO][${tag}] ${msg}`, ...args),
  error: (tag, msg, ...args) => console.error(`[ERROR][${tag}] ${msg}`, ...args),
  warn:  (tag, msg, ...args) => console.warn(`[WARN][${tag}] ${msg}`, ...args),
  debug: (tag, msg, ...args) => console.debug(`[DEBUG][${tag}] ${msg}`, ...args),
};
module.exports = logger;
