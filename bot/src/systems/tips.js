// src/systems/tips.js — Messages éphémères explicatifs envoyés en DM ou réponse invisible
// Chaque "tip" est un court message visible uniquement par l'user concerné,
// qui explique ce qui vient de se passer et pourquoi c'est bien pour lui.
'use strict';

// ── Envoi d'un tip éphémère (via message.channel ou DM si pas de context) ────
// On utilise message.channel.send() avec allowedMentions limité,
// mais pour les tips on préfère reply() si dispo, sinon send() éphémère via interaction.
// Pour les events non-interaction (messages) : on envoie en DM.
async function sendTip(target, content) {
  // target = message (messageCreate) ou interaction
  try {
    if (target?.reply && !target.replied && !target.deferred) {
      // Interaction : réponse éphémère native
      await target.reply({ content, ephemeral: true }).catch(() => {});
    } else if (target?.author) {
      // Message Discord : DM discret
      await target.author.send({ content }).catch(() => {});
    } else if (target?.user) {
      // Interaction déjà répondue : DM
      await target.user.send({ content }).catch(() => {});
    }
  } catch { /* jamais planter pour un tip */ }
}

// ── Tips par événement ─────────────────────────────────────────────────────────

const TIPS = {

  // ─ Level up ─────────────────────────────────────────────────────────────────
  levelUp: (level, totalXp, rank) =>
    `🏆 **Tu viens de passer niveau ${level} !**\n` +
    `> Tu as maintenant **${totalXp.toLocaleString('fr-FR')} XP** au total et tu es **#${rank}** au classement.\n` +
    `> Continue à envoyer des messages, passer du temps en vocal et faire les missions pour monter encore !\n` +
    `> 👉 Tape \`/niveau\` pour voir ta progression complète.`,

  // ─ Nouveau rôle principal débloqué ──────────────────────────────────────────
  roleUnlocked: (roleName, level) =>
    `🎖️ **Nouveau rôle débloqué : ${roleName}**\n` +
    `> Tu as atteint le niveau ${level} et tu viens de recevoir ce rôle automatiquement.\n` +
    `> C'est un rôle **permanent** — il ne disparaît jamais sauf si tu dépasses le palier suivant.\n` +
    `> 👉 Tape \`/niveau\` pour voir tous les paliers à venir.`,

  // ─ Rôle hebdo mis à jour ─────────────────────────────────────────────────────
  weeklyRoleUp: (roleName, weekXp) =>
    `📅 **Nouveau rôle hebdomadaire : ${roleName}**\n` +
    `> Tu as accumulé **${weekXp.toLocaleString('fr-FR')} XP** cette semaine — félicitations !\n` +
    `> ⚠️ Ce rôle **se retire automatiquement chaque dimanche à minuit** avec le reset hebdomadaire.\n` +
    `> Reste actif pour le garder ou le dépasser la semaine prochaine !`,

  // ─ Bump récompensé ────────────────────────────────────────────────────────────
  bumpRewarded: (xpReward, totalBumps, bumpXp) =>
    `🚀 **Bump récompensé !**\n` +
    `> Tu viens de gagner **+${xpReward.toLocaleString('fr-FR')} XP** pour avoir bumpé le serveur.\n` +
    `> Bumper = aider le serveur à être visible sur Disboard + gagner de l'XP. Win-win !\n` +
    `> Tu as fait **${totalBumps} bump${totalBumps > 1 ? 's' : ''}** au total. 💪`,

  // ─ Mission du jour complétée ─────────────────────────────────────────────────
  missionComplete: (missionName, xpBonus) =>
    `✅ **Mission complétée : ${missionName}**\n` +
    `> Tu viens de valider cette mission du jour${xpBonus ? ` et de gagner **+${xpBonus.toLocaleString('fr-FR')} XP bonus**` : ''} !\n` +
    `> Les missions se remettent à zéro **chaque jour à minuit**.\n` +
    `> 👉 Tape \`/niveau\` pour voir toutes tes missions du jour.`,

  // ─ Toutes les missions du jour complétées ────────────────────────────────────
  allMissionsDone: () =>
    `🎯 **Bravo ! Tu as complété TOUTES tes missions du jour !**\n` +
    `> C'est le maximum d'XP bonus que tu peux obtenir aujourd'hui via les missions.\n` +
    `> Reviens demain à minuit pour un nouveau set de missions !\n` +
    `> 👉 Tape \`/niveau\` pour voir ton score.`,

  // ─ XP vocal gagné (toutes les X minutes) ─────────────────────────────────────
  vocalXp: (minutes, xpGained) =>
    `🎙️ **+${xpGained.toLocaleString('fr-FR')} XP vocal**\n` +
    `> Tu as passé **${minutes} minute${minutes > 1 ? 's' : ''}** en vocal — l'XP tombe automatiquement !\n` +
    `> Le vocal est l'un des moyens les plus rapides de monter de niveau.\n` +
    `> Continue à être actif et l'XP s'accumule tout seul 🎧`,

  // ─ Quête complétée ───────────────────────────────────────────────────────────
  questDone: (questTitle, reward) =>
    `🏅 **Quête accomplie : « ${questTitle} »**\n` +
    `> Tu viens de terminer cette quête${reward ? ` et de recevoir ta récompense` : ''} !\n` +
    `> Les quêtes sont des objectifs spéciaux mis en place par les admins.\n` +
    `> 👉 Tape \`/quetes\` pour voir les quêtes disponibles.`,

  // ─ Bonus XP temporaire actif ─────────────────────────────────────────────────
  bonusXpActive: (percent, hours) =>
    `⚡ **Bonus XP +${percent}% actif pendant ${hours}h !**\n` +
    `> Tous tes messages, bumps et actions rapportent **${percent}% d'XP en plus** pendant ${hours} heures.\n` +
    `> Profite-en pour être actif et monter de niveau plus vite !\n` +
    `> Le bonus s'applique automatiquement, tu n'as rien à faire de plus.`,

  // ─ Podium quotidien (résultat personnel) ─────────────────────────────────────
  podiumResult: (label, value, unit, timesTop1) =>
    `🌙 **Podium du jour — tu es ${label} !**\n` +
    `> Aujourd'hui : **${value.toLocaleString('fr-FR')} ${unit}**.\n` +
    `> Ça fait **${timesTop1}** fois que tu décroches cette place — bravo !\n` +
    `> Le classement se remet à zéro chaque nuit — reviens demain pour continuer sur ta lancée !`,

  // ─ Face reveal soumis ────────────────────────────────────────────────────────
  faceRevealSubmitted: () =>
    `📸 **Ta photo a bien été soumise au Face Reveal !**\n` +
    `> Elle va être publiée dans le salon dédié avec un embed officiel et un thread de réactions.\n` +
    `> Les membres peuvent voter 🔥 (Smash) ou 💀 (Pass) — bonne chance ! 😄`,

  // ─ Counting : bonne réponse ──────────────────────────────────────────────────
  countingCorrect: (number) =>
    `🔢 **Bonne réponse au counting — ${number} !**\n` +
    `> Le counting consiste à compter à la suite dans le bon ordre.\n` +
    `> ⚠️ Une seule personne ne peut pas écrire deux nombres de suite — laisse quelqu'un d'autre continuer !\n` +
    `> Le streak continue grâce à toi 🔥`,

  // ─ Counting : erreur ────────────────────────────────────────────────────────
  countingError: (expected, given) =>
    `❌ **Mauvais numéro au counting !**\n` +
    `> Tu as écrit **${given}** mais le bon numéro était **${expected}**.\n` +
    `> Le streak vient d'être remis à zéro à cause de ça 😅\n` +
    `> Lis bien le dernier message avant d'écrire ton numéro !`,

};

module.exports = { sendTip, TIPS };
