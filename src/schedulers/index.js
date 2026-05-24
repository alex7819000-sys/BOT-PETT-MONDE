// src/schedulers/index.js — Tous les crons centralisés
'use strict';
const cron   = require('node-cron');
const Config = require('../db/models/Config');
const logger = require('../utils/logger');

async function startSchedulers(client) {
  const guildId = process.env.GUILD_ID;

  // ── Vendredi 20h — Grande cérémonie ──────────────────────────────────
  cron.schedule('0 20 * * 5', async () => {
    logger.info('Cron', 'Cérémonie du vendredi lancée');
    const { runKingCeremony }    = require('../systems/king');
    const { runGuildeCeremony }  = require('../systems/guildes');
    const { runWarCeremony }     = require('../systems/guerre');
    const { runSingeCeremony }   = require('../systems/singe');
    const { runCoupleCeremony }  = require('../systems/couple');
    await runKingCeremony(client, guildId);
    await runGuildeCeremony(client, guildId);
    await runWarCeremony(client, guildId);
    await runSingeCeremony(client, guildId);
    await runCoupleCeremony(client, guildId);
  }, { timezone: 'Europe/Paris' });

  // ── Jeudi 20h — Lancer les votes singe + couple ───────────────────────
  cron.schedule('0 20 * * 4', async () => {
    logger.info('Cron', 'Votes jeudi lancés');
    const { startVote: startSinge }  = require('../systems/singe');
    const { startVote: startCouple } = require('../systems/couple');
    await startSinge(client, guildId);
    await startCouple(client, guildId);
  }, { timezone: 'Europe/Paris' });

  // ── Smash or Pass Anime — intervalle config ───────────────────────────
  async function scheduleAnime() {
    const config   = await Config.findOne({ guildId });
    const hours    = config?.animeInterval || parseInt(process.env.ANIME_INTERVAL_HOURS) || 6;
    const { postSmash } = require('../systems/smash');
    // Poster immédiatement au démarrage
    await postSmash(client, guildId, 'anime-auto').catch(e => logger.error('Cron', 'Anime init', e));
    // Puis toutes les X heures
    setInterval(() => postSmash(client, guildId, 'anime-auto').catch(() => {}), hours * 3600 * 1000);
    logger.info('Cron', `Anime SOP toutes les ${hours}h`);
  }
  scheduleAnime();

  // ── Smash or Pass Animaux — intervalle config ─────────────────────────
  async function scheduleAnimaux() {
    const config   = await Config.findOne({ guildId });
    const hours    = config?.animalsInterval || parseInt(process.env.ANIMALS_INTERVAL_HOURS) || 4;
    const { postSmash } = require('../systems/smash');
    await postSmash(client, guildId, 'animals-auto').catch(() => {});
    setInterval(() => postSmash(client, guildId, 'animals-auto').catch(() => {}), hours * 3600 * 1000);
    logger.info('Cron', `Animaux SOP toutes les ${hours}h`);
  }
  scheduleAnimaux();

  // ── Quiz anime quotidien — 18h ────────────────────────────────────────
  cron.schedule('0 18 * * *', async () => {
    const { postDailyQuiz } = require('../systems/quiz');
    await postDailyQuiz(client, guildId).catch(e => logger.error('Cron', 'Quiz', e));
  }, { timezone: 'Europe/Paris' });

  // ── Bump rappel — toutes les 2h ───────────────────────────────────────
  cron.schedule('0 */2 * * *', async () => {
    const { sendBumpReminder } = require('../systems/bump');
    await sendBumpReminder(client, guildId).catch(() => {});
  }, { timezone: 'Europe/Paris' });

  // ── Pubs — toutes les minutes, on vérifie lesquelles envoyer ──────────
  cron.schedule('* * * * *', async () => {
    const Pub = require('../db/models/Pub');
    const { sendPub } = require('../systems/pubs');
    const now  = new Date();
    const pubs = await Pub.find({ guildId, active: true });
    for (const pub of pubs) {
      if (pub.scheduleType === 'daily') {
        if (now.getHours() === pub.dailyHour && now.getMinutes() === 0) {
          await sendPub(client, guildId, pub).catch(() => {});
        }
      } else {
        const elapsed = pub.lastSent ? (now - pub.lastSent) / 60000 : Infinity;
        if (elapsed >= pub.intervalMinutes) {
          await sendPub(client, guildId, pub).catch(() => {});
        }
      }
    }
  });

  // ── YouTube — toutes les 10 min ───────────────────────────────────────
  cron.schedule('*/10 * * * *', async () => {
    const { checkYouTube } = require('../systems/notifs');
    await checkYouTube(client, guildId).catch(() => {});
  });

  // ── Twitch — toutes les 2 min ─────────────────────────────────────────
  cron.schedule('*/2 * * * *', async () => {
    const { checkTwitch } = require('../systems/notifs');
    await checkTwitch(client, guildId).catch(() => {});
  });

  logger.info('Cron', 'Tous les schedulers démarrés');
}

module.exports = { startSchedulers };
