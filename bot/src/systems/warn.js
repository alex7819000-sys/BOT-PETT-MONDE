'use strict';
async function postLog(guild, embed) {
  const Config = require('../db/models/Config');
  const config = await Config.findOne({ guildId: guild.id });
  if (!config?.logsChannelId) return;
  const ch = guild.channels.cache.get(config.logsChannelId);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}
module.exports = { postLog };
