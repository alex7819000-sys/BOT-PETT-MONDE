// src/ceremony.js — Cérémonie premium avec composants interactifs 👑

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const db = require("./database");

async function runCeremony(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
  if (!guild) return console.error("[KING] Serveur introuvable.");

  const topUser = db.getTopUser();
  if (!topUser) {
    console.log("[KING] Aucun XP cette semaine.");
    return;
  }

  const member = await guild.members.fetch(topUser.id).catch(() => null);
  if (!member) return;

  const kingRole = guild.roles.cache.get(process.env.KING_ROLE_ID);
  if (!kingRole) return console.error("[KING] Rôle King introuvable.");

  // ── Retirer l'ancien King ────────────────────────────────────────────────
  const oldKings = guild.members.cache.filter(m => m.roles.cache.has(process.env.KING_ROLE_ID));
  for (const [, old] of oldKings) {
    await old.roles.remove(kingRole).catch(() => {});
    if (old.nickname?.startsWith("👑")) {
      await old.setNickname(old.nickname.replace(/^👑\s*/, "")).catch(() => {});
    }
  }

  // ── Couronner ────────────────────────────────────────────────────────────
  await member.roles.add(kingRole).catch(() => {});
  const base = member.nickname || member.user.displayName;
  await member.setNickname(`👑 ${base}`.slice(0, 32)).catch(() => {});

  const crowns      = db.incrementCrown(topUser.id);
  const level       = db.getLevelFromXP(topUser.totalXp);
  const userData    = db.getUser(topUser.id);
  const badges      = db.getUserBadges(userData).map(b => b.label).join(" ") || "—";

  db.addKingHistory(topUser.id, topUser.xp, new Date().toLocaleDateString("fr-FR"));

  // ── Embed premium ────────────────────────────────────────────────────────
  const channel = guild.channels.cache.get(process.env.ANNOUNCE_CHANNEL_ID);
  if (!channel) return;

  const lb     = db.getLeaderboard(3);
  const podium = lb.map((u, i) => {
    const medals = ["🥇", "🥈", "🥉"];
    return `${medals[i]} <@${u.id}> — **${u.xp.toLocaleString("fr-FR")} XP**`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle("━━━━━━━  👑  ROI DE LA SEMAINE  👑  ━━━━━━━")
    .setDescription(
      `## <@${topUser.id}> est couronné !\n` +
      `> *Que son règne soit glorieux et ses ennemis tremblants.*`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "⚡ XP cette semaine",
        value: `**${topUser.xp.toLocaleString("fr-FR")} XP**`,
        inline: true,
      },
      {
        name: "🎯 Niveau",
        value: `**Niveau ${level}**`,
        inline: true,
      },
      {
        name: "👑 Couronnes",
        value: `**x${crowns}**`,
        inline: true,
      },
      {
        name: "🏅 Badges",
        value: badges,
        inline: false,
      },
      {
        name: "📊 Podium de la semaine",
        value: podium || "—",
        inline: false,
      }
    )
    .setImage("https://i.imgur.com/0IQSoH4.gif") // effet doré animé
    .setFooter({
      text: "⚠️  Le classement XP est maintenant réinitialisé  •  Bonne semaine à tous !",
      iconURL: member.user.displayAvatarURL(),
    })
    .setTimestamp();

  // ── Boutons interactifs ───────────────────────────────────────────────────
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_classement")
      .setLabel("📊 Voir le classement")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("btn_historique")
      .setLabel("👑 Historique des Rois")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_xp_${topUser.id}`)
      .setLabel("⚡ Profil du Roi")
      .setStyle(ButtonStyle.Success),
  );

  await channel.send({
    content: `@everyone 🎉 **Un nouveau roi est couronné !**`,
    embeds: [embed],
    components: [row],
  });

  db.resetWeeklyXP();
  console.log(`[KING] 👑 ${member.user.tag} couronné ! (${topUser.xp} XP)`);
}

module.exports = { runCeremony };
