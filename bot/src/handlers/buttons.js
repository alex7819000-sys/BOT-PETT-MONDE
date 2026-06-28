// src/handlers/buttons.js — Dispatch tous les boutons
'use strict';
const logger = require('../utils/logger');

async function handleButton(interaction, client) {
  const id = interaction.customId;
  const [ns, action, ...rest] = id.split(':');

  // ── Level up info button ──────────────────────────────────────────────────
  if (ns === 'levelup' && action === 'info') {
    try {
      const { handleLevelInfoButton } = require('../systems/levelUp');
      await handleLevelInfoButton(interaction);
    } catch (err) {
      logger.error('Buttons', 'Error handling levelup info button', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  try {
    switch (ns) {
      case 'color_role': {
        // Sélection d'une couleur (depuis serveur OU depuis DM)
        if (action === 'select' || action === 'select_dm') {
          const selectedValue = interaction.values?.[0];
          if (!selectedValue) return;

          // Format valeur: "guildId:roleId" (DM) ou juste "roleId" (serveur)
          let guildId, roleId;
          if (action === 'select_dm') {
            [guildId, roleId] = selectedValue.split(':');
          } else {
            guildId = interaction.guild?.id || id.split(':')[2];
            roleId  = selectedValue;
          }

          if (!guildId || !roleId) {
            return interaction.reply({ content: '❌ Erreur interne.', ephemeral: true });
          }

          const Config = require('../db/models/Config');
          const config     = await Config.findOne({ guildId });
          const colorRoles = config?.colorRoleIds || [];
          const chosen     = colorRoles.find(cr => cr.roleId === roleId);
          if (!chosen) return interaction.reply({ content: '❌ Couleur introuvable.', ephemeral: true });

          // Récupérer le membre sur le serveur (fonctionne depuis DM aussi)
          const guild  = await client.guilds.fetch(guildId).catch(() => null);
          if (!guild) return interaction.reply({ content: '❌ Serveur introuvable.', ephemeral: true });
          const member = await guild.members.fetch(interaction.user.id).catch(() => null);
          if (!member) return interaction.reply({ content: '❌ Tu n\'es plus membre de ce serveur.', ephemeral: true });

          // Retirer toutes les anciennes couleurs
          const allColorRoleIds = colorRoles.map(cr => cr.roleId);
          const toRemove = member.roles.cache.filter(r => allColorRoleIds.includes(r.id));
          for (const [, role] of toRemove) await member.roles.remove(role).catch(() => {});

          // Ajouter la nouvelle
          await member.roles.add(roleId).catch(() => {});

          return interaction.reply({
            content: `✅ Couleur **${chosen.emoji || '🎨'} ${chosen.name}** appliquée sur le serveur !`,
            ephemeral: true,
          });
        }
        break;
      }
      case 'sop': {
        const { handleVote } = require('../systems/smash');
        const voteId = rest[0] || null;
        if (action === 'smash') return handleVote(interaction, 'smash', voteId);
        if (action === 'pass')  return handleVote(interaction, 'pass',  voteId);
        if (action === 'stats') return handleSopStats(interaction, voteId);
        break;
      }
      case 'giveaway': {
        if (action === 'enter') {
          const { handleEnter } = require('../systems/giveaway');
          return handleEnter(interaction);
        }
        break;
      }
      case 'defi': {
        if (action === 'join') {
          const { handleJoin } = require('../systems/defis');
          return handleJoin(interaction);
        }
        break;
      }
      case 'singe': {
        if (action === 'vote') {
          const { handleVote } = require('../systems/singe');
          return handleVote(interaction, rest[0]);
        }
        break;
      }
      case 'couple': {
        if (action === 'vote') {
          const { handleVote } = require('../systems/couple');
          return handleVote(interaction, rest.join(':'));
        }
        break;
      }
      case 'war': {
        if (action === 'join') {
          const { joinTeam } = require('../systems/guerre');
          return joinTeam(interaction, rest[0]);
        }
        break;
      }
      case 'quiz': {
        if (action === 'answer') {
          const { handleQuizAnswer } = require('../systems/quiz');
          return handleQuizAnswer(interaction, rest[0]);
        }
        break;
      }
      case 'staff': {
        const staff = require('../systems/staff');
        if (action === 'candidater') return staff.handleCandidater(interaction, client);
        if (action === 'prendre')    return staff.handlePrendre(interaction);
        if (action === 'accepter')   return staff.handleAccepter(interaction, client);
        if (action === 'refuser')    return staff.handleRefuser(interaction);
        if (action === 'attente')    return staff.handleAttente(interaction);
        break;
      }
      case 'partner': {
        const p = require('../systems/partenariat');
        if (action === 'demande')  return p.handleDemande(interaction);
        if (action === 'accepter') return p.handleAccepterPartner(interaction);
        if (action === 'refuser')  return p.handleRefuserPartner(interaction);
        if (action === 'negocier') return p.handleNegocier(interaction);
        break;
      }
      case 'pub': {
        const pub = require('../systems/pubs');
        if (action === 'demande')    return pub.handlePubDemande(interaction);
        if (action === 'valider')    return pub.handlePubValider(interaction);
        if (action === 'refuser')    return pub.handlePubRefuser(interaction);
        if (action === 'toggle_all') {
          const { requireAdmin } = require('../utils/permissions');
          if (!requireAdmin(interaction)) return;
          await interaction.deferUpdate();
          const { toggleAllPubs } = require('../systems/pubs');
          const state = await toggleAllPubs(interaction.guild.id);
          return interaction.followUp({
            content: state ? '▶️ Toutes les pubs activées !' : '⏸️ Toutes les pubs désactivées !',
            ephemeral: true,
          });
        }
        break;
      }
      case 'rep': {
        const rep = require('../systems/reputation');
        if (action === 'note') return rep.handleSatisfactionNote(interaction);
        break;
      }
      case 'embed': {
        const { handleEmbedButton } = require('./commandHandlers/embed');
        return handleEmbedButton(interaction);
      }
      case 'reglement': {
        if (action === 'accepter') {
          const { handleAccepterReglement } = require('../systems/reglement');
          return handleAccepterReglement(interaction);
        }
        break;
      }
      case 'confession': {
        if (action === 'open_modal') {
          const { openConfessionModal } = require('../systems/confession');
          return openConfessionModal(interaction);
        }
        if (action === 'vote' || action === 'reveal') {
          return interaction.reply({ content: '✅', ephemeral: true }).catch(() => {});
        }
        if (action === 'hide') {
          return interaction.update({ components: [] });
        }
        break;
      }
      case 'setup': {
        // handled via modals or commands
        break;
      }
      case 'secret': {
        if (action === 'open_modal') {
          const { openModal } = require('../systems/secret');
          return openModal(interaction);
        }
        break;
      }
      case 'present': {
        const pres = require('../systems/presentation');
        // Ouvrir le modal popup (bouton "Remplir l'étape X")
        if (action === 'open_modal') {
          return pres.openModal(interaction, client);
        }
        // Passer une étape
        if (action === 'skip_modal') {
          return pres.skipModal(interaction, client);
        }
        // Bouton reset/modifier depuis l'écran "déjà publié"
        if (action === 'reset') {
          return pres.handleResetButton(interaction, client);
        }
        // Compat: anciens boutons (start, dm_start, skip_etape, modifier_start)
        if (action === 'start' || action === 'dm_start') {
          return pres.handleReprendreCommand(interaction, client);
        }
        if (action === 'skip_etape') {
          return pres.skipModal(interaction, client);
        }
        if (action === 'modifier_start') {
          return pres.handleModifierCommand(interaction, client);
        }
        // Bouton depuis le forum "Faire ma présentation"
        if (action === 'forum_start') {
          return pres.handleForumStartButton(interaction, client);
        }
        // Bouton "Recommencer depuis 0" (depuis forum_start)
        if (action === 'recommencer_btn') {
          return pres.handleRecommencerButton(interaction, client);
        }
        break;
      }
      case 'info': {
        const infos = {
          serv: {
            title: '❓ Comment ça marche ?',
            color: 0x5865F2,
            lines: [
              '💬 **Parle** dans les salons → tu gagnes de l\'XP',
              '🚀 **Bumpe** le serveur → gros bonus XP',
              '📋 **Présente-toi** → débloque le rôle Membre Confirmé',
              '🔢 **Counting** → mini-jeu dans le salon dédié',
              '🐾 **Bataille** → équipe Chien ou Chat, dis leur cri !',
              '⭐ **Monte en niveau** → accès à plus de salons & rôles',
            ],
          },
          kuzan: {
            title: '👑 C\'est qui Kuzan ?',
            color: 0xFFD700,
            lines: [
              '**Kuzan** est le créateur et admin principal du serveur.',
              '🛡️ Il gère la communauté, les règles et les événements.',
              '💎 Il a le rôle **King** — le rang le plus haut du serveur.',
              '📩 Tu peux lui écrire en MP si t\'as un souci ou une idée.',
            ],
          },
          xp: {
            title: '⭐ Le système XP',
            color: 0xF0A500,
            lines: [
              '💬 Message envoyé → **+XP** (cooldown anti-spam)',
              '🚀 Bump Disboard → **+500 XP**',
              '📋 Présentation complète → **bonus XP**',
              '🔢 Counting → points + rôle Champion si t\'es top 1',
              '📖 Quêtes quotidiennes → **grosses récompenses**',
              '🏆 **King of the Day** → le + actif reçoit un rôle bonus',
            ],
          },
          regles: {
            title: '📜 Les règles (résumé)',
            color: 0xED4245,
            lines: [
              '🚫 Pas d\'insultes, harcèlement ou drama',
              '🚫 Pas de spam ou flood',
              '🚫 Pas de contenu NSFW hors salons prévus',
              '✅ Respecte tout le monde, staff compris',
              '✅ Parle français dans les salons généraux',
              '📌 Les règles complètes sont dans le salon **#règlement**',
            ],
          },
        };

        const key = action;

        // Cas spécial couleur — affiche le sélecteur de rôle couleur
        if (key === 'couleur') {
          const guildId = rest[0];
          if (!guildId) return interaction.reply({ content: '❌ Serveur introuvable.', ephemeral: true });
          const Config = require('../db/models/Config');
          const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
          const config     = await Config.findOne({ guildId });
          const colorRoles = config?.colorRoleIds || [];
          if (!colorRoles.length) {
            return interaction.reply({ content: '❌ Aucune couleur configurée sur le serveur pour l\'instant.', ephemeral: true });
          }
          const options = colorRoles.slice(0, 25).map(cr =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cr.name)
              .setValue(`${guildId}:${cr.roleId}`)
              .setEmoji(cr.emoji || '🎨')
          );
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`color_role:select_dm:${guildId}`)
            .setPlaceholder('🎨 Choisis ta couleur de pseudo...')
            .addOptions(options);
          const selectRow = new ActionRowBuilder().addComponents(selectMenu);
          const colorEmbed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🎨 Couleur de pseudo')
            .setDescription('Choisis ta couleur. **1 couleur à la fois** — l\'ancienne est retirée automatiquement.');
          return interaction.reply({ embeds: [colorEmbed], components: [selectRow] });
        }
        const info = infos[key];
        if (!info) break;

        const { EmbedBuilder: EB } = require('discord.js');
        const embed = new EB()
          .setColor(info.color)
          .setTitle(info.title)
          .setDescription(info.lines.join('\n'))
          .setFooter({ text: 'Petit Monde • Bot' });

        return interaction.reply({ embeds: [embed], ephemeral: false });
      }
      case 'profile': {
        if (action === 'compare') {
          return interaction.reply({ content: 'Mentionne le membre avec qui comparer : `/profil @membre`', ephemeral: true });
        }
        break;
      }
      case 'pingrole': {
        if (action === 'toggle') {
          const { handlePingRoleToggle } = require('../systems/pingroles');
          return handlePingRoleToggle(interaction);
        }
        break;
      }
      case 'ticket': {
        const t = require('../systems/ticket');
        if (action === 'open')  return t.openTicket(interaction, rest[0] || 'support');
        if (action === 'claim') return t.claimTicket(interaction, rest[0]);
        if (action === 'close') return t.closeTicket(interaction, rest[0]);
        break;
      }
      default:
        logger.debug('Buttons', `Unknown button: ${id}`);
    }
  } catch (err) {
    logger.error('Buttons', `Error handling button ${id}`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
    }
  }
}

async function handleSopStats(interaction, voteId) {
  const Vote = require('../db/models/Vote');
  await interaction.deferReply({ ephemeral: true });
  const vote = voteId ? await Vote.findById(voteId).catch(() => null) : await Vote.findOne({ guildId: interaction.guild.id, messageId: interaction.message.id });
  if (!vote) return interaction.followUp({ content: '❌ Vote introuvable.', ephemeral: true });

  const total = vote.smashes.length + vote.passes.length;
  const pct   = total ? Math.round((vote.smashes.length / total) * 100) : 0;

  await interaction.followUp({
    content: `📊 **${vote.subject.name}** — ${vote.smashes.length} 💚 Smash vs ${vote.passes.length} 💔 Pass (${pct}% smash) — ${total} vote(s)`,
    ephemeral: true,
  });
}

module.exports = { handleButton };
