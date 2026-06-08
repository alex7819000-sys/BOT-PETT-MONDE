// src/handlers/commandHandlers/staff.js
'use strict';

const { EmbedBuilder }       = require('discord.js');
const { safeReply }          = require('../../utils/permissions');
const { validerStaff }       = require('../../systems/staff');
const { getOrCreateScore }   = require('../../systems/kingstaff');
const StaffScoreModel        = require('../../db/models/StaffScore');
const Config                 = require('../../db/models/Config');

function getQuotas(memberCount) {
  if (memberCount <= 100)  return { moderateur: 2, animateur: 1, technicien: 1 };
  if (memberCount <= 250)  return { moderateur: 3, animateur: 2, technicien: 1 };
  if (memberCount <= 500)  return { moderateur: 4, animateur: 3, technicien: 2 };
  if (memberCount <= 1000) return { moderateur: 6, animateur: 4, technicien: 3 };
  if (memberCount <= 2000) return { moderateur: 8, animateur: 5, technicien: 4 };
  return                          { moderateur: 10, animateur: 7, technicien: 5 };
}

const GRADE_EMOJIS = { stagiaire: '🎓', junior: '🥉', confirme: '🥈', senior: '🥇', elite: '💎' };
const MEDALS       = ['👑', '🥈', '🥉'];

module.exports = async function handleStaffCommand(interaction) {
  const sub     = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const config  = await Config.findOne({ guildId });

  // ── /staff valider ────────────────────────────────────────────────────────
  if (sub === 'valider') {
    return validerStaff(interaction);
  }

  // ── /staff quotas ─────────────────────────────────────────────────────────
  if (sub === 'quotas') {
    const guild  = interaction.guild;
    const quotas = getQuotas(guild.memberCount);
    await guild.members.fetch();

    const roles = ['moderateur', 'animateur', 'technicien'];
    const lines = await Promise.all(roles.map(async role => {
      const emoji   = { moderateur: '🛡️', animateur: '🎨', technicien: '🔧' }[role];
      const finalId = config?.[`${role}RoleId`];
      const stagId  = config?.[`${role}StagiaireRoleId`];
      const finals  = finalId ? guild.members.cache.filter(m => m.roles.cache.has(finalId)).size : 0;
      const stags   = stagId  ? guild.members.cache.filter(m => m.roles.cache.has(stagId)).size  : 0;
      const total   = finals + stags;
      const max     = quotas[role];
      const bar     = '█'.repeat(Math.min(total, max)) + '░'.repeat(Math.max(0, max - total));
      const status  = total >= max ? '🔴 COMPLET' : total >= max - 1 ? '🟡 Presque plein' : '🟢 Places dispo';
      return `${emoji} **${role.charAt(0).toUpperCase() + role.slice(1)}** \`${bar}\` ${total}/${max} — ${status}`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Places Staff disponibles')
      .setDescription(lines.join('\n\n'))
      .addFields({ name: '👥 Membres total', value: `${guild.memberCount}`, inline: true })
      .setTimestamp()
      .setFooter({ text: 'Les quotas s\'ajustent automatiquement selon la taille du serveur' });

    return safeReply(interaction, { embeds: [embed], ephemeral: true });
  }

  // ── /staff classement ─────────────────────────────────────────────────────
  if (sub === 'classement') {
    await interaction.deferReply({ ephemeral: true });
    const guild  = interaction.guild;
    const scores = await StaffScoreModel.find({ guildId }).sort({ weekScore: -1 }).limit(10);

    if (!scores.length) return interaction.editReply({ content: '❌ Aucun score staff cette semaine.' });

    const lines = await Promise.all(scores.map(async (s, i) => {
      try {
        const m     = await guild.members.fetch(s.userId);
        const medal = MEDALS[i] || `**${i + 1}.**`;
        const grade = GRADE_EMOJIS[s.grade] || '';
        return `${medal} ${grade} **${m.displayName}** — ${s.weekScore} pts *(${s.ticketsTraited}🎫 · ${s.warnsGiven}⚠️ · ${s.candidaturesTraited}📋)*`;
      } catch { return null; }
    }));

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🏆 Classement Staff — Cette semaine')
      .setDescription(lines.filter(Boolean).join('\n') || 'Aucune donnée')
      .setTimestamp()
      .setFooter({ text: 'Score = tickets + warns + candidatures + messages staff' });

    return interaction.editReply({ embeds: [embed] });
  }

  // ── /staff score ──────────────────────────────────────────────────────────
  if (sub === 'score') {
    const target = interaction.options.getMember('membre') || interaction.member;
    await interaction.deferReply({ ephemeral: true });

    const score = await getOrCreateScore(target.id, guildId);
    const lastAction = score.lastActionAt
      ? `<t:${Math.floor(score.lastActionAt.getTime() / 1000)}:R>`
      : 'Jamais';

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Score Staff — ${target.displayName}`)
      .setThumbnail(target.displayAvatarURL({ size: 64 }))
      .addFields(
        { name: '⭐ Score hebdo',       value: `${score.weekScore} pts`,          inline: true },
        { name: '📈 Score total',       value: `${score.totalScore} pts`,         inline: true },
        { name: `${GRADE_EMOJIS[score.grade]} Grade`, value: score.grade.toUpperCase(), inline: true },
        { name: '🎫 Tickets traités',   value: `${score.ticketsTraited}`,          inline: true },
        { name: '⚠️ Warns donnés',      value: `${score.warnsGiven}`,             inline: true },
        { name: '📋 Candidatures',      value: `${score.candidaturesTraited}`,     inline: true },
        { name: '🎊 Stagiaires validés',value: `${score.stagiairesValidated}`,     inline: true },
        { name: '👑 King of Staff',     value: `${score.kingStaffCount}x`,         inline: true },
        { name: '🕐 Dernière action',   value: lastAction,                         inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
