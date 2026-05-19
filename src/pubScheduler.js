// src/pubScheduler.js — Envoi automatique des publicités CVForge

const cron = require("node-cron");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const pubDb = require("./pubDatabase");

// Garde en mémoire les crons actifs par pub ID
const activeCrons = new Map();

// ── Construire l'embed pub ─────────────────────────────────────────────────
function buildPubEmbed(pub) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: "CVForge",
      iconURL: "https://cdn-icons-png.flaticon.com/512/942/942748.png",
    })
    .setTitle("📄 Créez votre CV professionnel gratuitement")
    .setDescription(pub.description)
    .addFields({
      name: "🔗 Accéder à CVForge",
      value: `[**Cliquez ici → ${pub.lien}**](https://${pub.lien})`,
    })
    .setFooter({ text: "CVForge • Votre CV, votre avenir" })
    .setTimestamp();

  // Ajouter l'image si elle existe
  if (pub.imageUrl && pub.imageUrl.startsWith("http")) {
    embed.setImage(pub.imageUrl);
  }

  return embed;
}

function buildPubRow(pub) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("🚀 Accéder à CVForge")
      .setURL(`https://${pub.lien}`)
      .setStyle(ButtonStyle.Link),
  );
}

// ── Envoyer une pub maintenant ─────────────────────────────────────────────
async function sendPub(client, pub) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    // Cas "ALL" — envoyer dans tous les salons textuels
    if (pub.channelId === "ALL") {
      const textChannels = guild.channels.cache.filter(c =>
        c.type === 0 && // GuildText
        c.permissionsFor(guild.members.me)?.has("SendMessages")
      );

      for (const [, channel] of textChannels) {
        await channel.send({ embeds: [buildPubEmbed(pub)], components: [buildPubRow(pub)] }).catch(() => {});
      }
      pubDb.markSent(pub.id);
      console.log(`[PUB] ✅ Pub #${pub.id} envoyée dans ${textChannels.size} salons`);
      return;
    }

    // Cas salon unique
    const channel = guild.channels.cache.get(pub.channelId);
    if (!channel) return;

    await channel.send({ embeds: [buildPubEmbed(pub)], components: [buildPubRow(pub)] });
    pubDb.markSent(pub.id);
    console.log(`[PUB] ✅ Pub #${pub.id} envoyée dans #${channel.name}`);
  } catch (err) {
    console.error(`[PUB] ❌ Erreur pub #${pub.id} :`, err.message);
  }
}

// ── Programmer une pub ─────────────────────────────────────────────────────
function schedulePub(client, pub) {
  // Annuler le cron existant pour cette pub si besoin
  if (activeCrons.has(pub.id)) {
    activeCrons.get(pub.id).stop();
    activeCrons.delete(pub.id);
  }

  if (!pub.active) return;

  let cronExpr;

  if (pub.scheduledTime) {
    // Heure précise — ex: "20:30" → "30 20 * * *" (tous les jours)
    const [hh, mm] = pub.scheduledTime.split(":").map(Number);
    cronExpr = `${mm} ${hh} * * *`;
  } else if (pub.intervalMinutes) {
    // Intervalle — ex: 60 min → "0 */1 * * *"
    if (pub.intervalMinutes < 60) {
      cronExpr = `*/${pub.intervalMinutes} * * * *`;
    } else {
      const hours = Math.floor(pub.intervalMinutes / 60);
      cronExpr = `0 */${hours} * * *`;
    }
  } else {
    return; // Pas de schedule défini
  }

  const task = cron.schedule(cronExpr, () => sendPub(client, pubDb.getPubById(pub.id)), {
    timezone: "Europe/Paris",
  });

  activeCrons.set(pub.id, task);
  console.log(`[PUB] 📅 Pub #${pub.id} programmée (${cronExpr})`);
}

// ── Démarrer tous les crons au boot ──────────────────────────────────────
function startAllSchedulers(client) {
  const pubs = pubDb.getActivePubs();
  console.log(`[PUB] Démarrage de ${pubs.length} pub(s) programmée(s)...`);
  for (const pub of pubs) schedulePub(client, pub);
}

// ── Stop un cron ──────────────────────────────────────────────────────────
function stopPub(pubId) {
  if (activeCrons.has(pubId)) {
    activeCrons.get(pubId).stop();
    activeCrons.delete(pubId);
  }
}

module.exports = { schedulePub, startAllSchedulers, stopPub, sendPub, buildPubEmbed, buildPubRow };
