// src/systems/presentation/index.js — Questionnaire via MODALS Discord (5 étapes)
// Flow ENTIÈREMENT EN DM :
//   guildMemberAdd → DM welcome avec bouton Primary
//   → clic bouton dans DM → modal étape 1 s'ouvre (en DM !)
//   → modal étape 2 → ... → modal étape 5
//   → bot publie dans le forum du serveur + donne le rôle
//
// NOTE: Discord autorise showModal() depuis un bouton en DM — c'est une
//       interaction valide (ButtonInteraction) même hors serveur.
'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');

const Config       = require('../../db/models/Config');
const Presentation = require('../../db/models/Presentation');
const logger       = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG DES 5 MODALS (max 5 champs par modal)
// ─────────────────────────────────────────────────────────────────────────────
const MODALS = [
  {
    id: 'present_modal_1',
    emoji: '🪪',
    titre: 'Identité',
    fields: [
      { key: 'prenom',      label: 'Prénom / Pseudo',          placeholder: 'Ex : Alex',                 required: true,  style: TextInputStyle.Short },
      { key: 'age',         label: 'Âge',                      placeholder: 'Ex : 17 ans',               required: true,  style: TextInputStyle.Short },
      { key: 'genre',       label: 'Genre',                    placeholder: 'Ex : Garçon, Fille, NB...', required: false, style: TextInputStyle.Short },
      { key: 'origine',     label: 'Origine / Nationalité',    placeholder: 'Ex : Français, Belge...',   required: false, style: TextInputStyle.Short },
      { key: 'orientation', label: 'Orientation (facultatif)', placeholder: 'Ex : Hétéro, Bi...',        required: false, style: TextInputStyle.Short },
    ],
  },
  {
    id: 'present_modal_2',
    emoji: '👗',
    titre: 'Apparence',
    fields: [
      { key: 'taille',  label: 'Taille',              placeholder: 'Ex : 1m75',                         required: false, style: TextInputStyle.Short },
      { key: 'yeux',    label: 'Couleur des yeux',    placeholder: 'Ex : Marrons, Verts...',            required: false, style: TextInputStyle.Short },
      { key: 'cheveux', label: 'Cheveux',             placeholder: 'Ex : Noirs longs, Courts châtains', required: false, style: TextInputStyle.Short },
      { key: 'style',   label: 'Style vestimentaire', placeholder: 'Ex : Streetwear, Casual...',        required: false, style: TextInputStyle.Short },
    ],
  },
  {
    id: 'present_modal_3',
    emoji: '🧠',
    titre: 'Personnalité',
    fields: [
      { key: 'positifs', label: 'Traits positifs', placeholder: 'Ex : Drôle, Loyal, Créatif...',     required: false, style: TextInputStyle.Paragraph },
      { key: 'negatifs', label: 'Traits négatifs', placeholder: 'Ex : Impatient, Trop casanier...', required: false, style: TextInputStyle.Paragraph },
    ],
  },
  {
    id: 'present_modal_4',
    emoji: '🎨',
    titre: 'Préférences & Goûts',
    fields: [
      { key: 'couleur',    label: 'Couleur préférée',    placeholder: 'Ex : Bleu nuit',            required: false, style: TextInputStyle.Short },
      { key: 'musique',    label: 'Musique préférée',    placeholder: 'Ex : Rap FR, Phonk, K-pop', required: false, style: TextInputStyle.Short },
      { key: 'nourriture', label: 'Nourriture préférée', placeholder: 'Ex : Pizza, Sushi...',      required: false, style: TextInputStyle.Short },
      { key: 'aime',       label: 'Ce que tu aimes',     placeholder: 'Ex : Gaming, les animaux',  required: false, style: TextInputStyle.Paragraph },
      { key: 'deteste',    label: 'Ce que tu détestes',  placeholder: 'Ex : Les hypocrites...',    required: false, style: TextInputStyle.Paragraph },
    ],
  },
  {
    id: 'present_modal_5',
    emoji: '🎌',
    titre: 'Anime & Manga',
    fields: [
      { key: 'anime',  label: 'Anime préféré',               placeholder: 'Ex : Demon Slayer, One Piece...', required: false, style: TextInputStyle.Short },
      { key: 'persoF', label: 'Personnage féminin préféré',  placeholder: 'Ex : Nezuko',                    required: false, style: TextInputStyle.Short },
      { key: 'persoM', label: 'Personnage masculin préféré', placeholder: 'Ex : Tanjiro',                   required: false, style: TextInputStyle.Short },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function dash(v) { return v && v.trim() ? v.trim() : '—'; }

function buildProgressBar(step, total = 5) {
  const filled = Math.round((step / total) * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function buildForumContent(p, userId) {
  const lines = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `    ✦ ${(p.prenom || 'Membre').toUpperCase()} ✦`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Présentation de <@${userId}>`,
    ``,
    `▸ IDENTITÉ`,
    `┊ Prénom : ${dash(p.prenom)}`,
    `┊ Âge : ${dash(p.age)}`,
    `┊ Genre : ${dash(p.genre)}`,
    `┊ Origine : ${dash(p.origine)}`,
    `┊ Orientation : ${dash(p.orientation)}`,
    ``,
    `▸ APPARENCE`,
    `┊ Taille : ${dash(p.taille)}`,
    `┊ Yeux : ${dash(p.yeux)}`,
    `┊ Cheveux : ${dash(p.cheveux)}`,
    `┊ Style : ${dash(p.style)}`,
    ``,
    `▸ PERSONNALITÉ`,
    `┊ Positifs : ${dash(p.positifs)}`,
    `┊ Négatifs : ${dash(p.negatifs)}`,
    ``,
    `▸ PRÉFÉRENCES`,
    `┊ Couleur : ${dash(p.couleur)}`,
    `┊ Musique : ${dash(p.musique)}`,
    `┊ Nourriture : ${dash(p.nourriture)}`,
    ``,
    `▸ ANIME & MANGA`,
    `┊ Anime : ${dash(p.anime)}`,
    `┊ Perso féminin : ${dash(p.persoF)}`,
    `┊ Perso masculin : ${dash(p.persoM)}`,
    ``,
    `▸ GOÛTS`,
    `┊ Aime : ${dash(p.aime)}`,
    `┊ Déteste : ${dash(p.deteste)}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ];
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUIRE UN MODAL DISCORD
// customId format : present_modal:step:guildId
// ─────────────────────────────────────────────────────────────────────────────
function buildModal(modalDef, guildId, step) {
  const modal = new ModalBuilder()
    .setCustomId(`present_modal:${step}:${guildId}`)
    .setTitle(`${modalDef.emoji} Présentation — ${modalDef.titre}`);

  for (const f of modalDef.fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.key)
      .setLabel(f.label)
      .setPlaceholder(f.placeholder)
      .setStyle(f.style)
      .setRequired(f.required)
      .setMaxLength(200);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMBED DE PROGRESSION (envoyé/édité dans le DM)
// ─────────────────────────────────────────────────────────────────────────────
function buildProgressEmbed(user, currentStep) {
  const bar = buildProgressBar(currentStep - 1, 5);
  const stepLines = MODALS.map((m, i) => {
    const done    = i < currentStep - 1;
    const current = i === currentStep - 1;
    if (done)    return `✅ Étape ${i + 1} — ${m.emoji} ${m.titre}`;
    if (current) return `▶️ **Étape ${i + 1} — ${m.emoji} ${m.titre}** ← maintenant`;
    return `⬜ Étape ${i + 1} — ${m.emoji} ${m.titre}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: `Présentation de ${user.username}`, iconURL: user.displayAvatarURL() })
    .setTitle(`📋 Questionnaire de présentation`)
    .setDescription(
      `**Progression :** \`${bar}\` ${currentStep - 1}/5\n\n` +
      stepLines + '\n\n' +
      `> Clique sur le bouton pour remplir l'étape en cours !`
    )
    .setFooter({ text: 'Tu peux passer des champs — laisse-les vides si tu ne veux pas répondre.' })
    .setTimestamp();
}

// Construire la row de boutons pour une étape donnée (utilisé en DM)
function buildStepRow(step, guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:open_modal:${step}:${guildId}`)
      .setLabel(`${MODALS[step - 1].emoji} Remplir l'étape ${step} — ${MODALS[step - 1].titre}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`present:skip_modal:${step}:${guildId}`)
      .setLabel('Passer cette étape →')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DM de bienvenue — bouton Primary (pas Link) pour pouvoir ouvrir un modal
// ─────────────────────────────────────────────────────────────────────────────
async function sendWelcomeDM(member, client) {
  try {
    const config = await Config.findOne({ guildId: member.guild.id });
    const roleName = config?.confirmedRoleId
      ? `<@&${config.confirmedRoleId}>`
      : '**Membre Confirmé ✅**';

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`✨ Bienvenue sur ${member.guild.name} !`)
      .setThumbnail(member.guild.iconURL({ dynamic: true }))
      .setDescription(
        `Hey <@${member.id}> ! 👋\n\n` +
        `Partage ton pseudo, tes goûts, ta perso...\n` +
        `Les membres viendront t'accueillir !\n\n` +
        `**Par où commencer ?**\n` +
        `📋 Lis les règles\n` +
        `🗂️ Présente-toi dans le forum\n` +
        `💬 Rejoins les discussions !\n\n` +
        `> 🎖️ En te présentant tu obtiens le rôle ${roleName} !`
      )
      .setFooter({ text: 'Clique sur le bouton ci-dessous pour commencer ta présentation !' });

    // Bouton PRIMARY avec customId → permet d'ouvrir un modal depuis le DM
    const guildId = member.guild.id;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:open_modal:1:${guildId}`)
        .setLabel('📋 Me présenter maintenant')
        .setStyle(ButtonStyle.Primary),
    );

    await member.send({ embeds: [embed], components: [row] });
    logger.info('Presentation', `DM bienvenue envoyé à ${member.user.tag}`);
  } catch (err) {
    logger.debug('Presentation', `DM impossible pour ${member.user?.tag}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ouvrir le modal (bouton → modal popup)
//    Fonctionne depuis le DM ET depuis le serveur
// ─────────────────────────────────────────────────────────────────────────────
async function openModal(interaction, client) {
  const parts   = interaction.customId.split(':'); // present:open_modal:step:guildId
  const step    = parseInt(parts[2]);
  const guildId = parts[3];

  const modalDef = MODALS[step - 1];
  if (!modalDef) return;

  // S'assurer que la présentation existe en BDD
  const userId = interaction.user.id;
  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) await Presentation.create({ userId, guildId, step: 1 });

  const modal = buildModal(modalDef, guildId, step);
  await interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Recevoir le modal soumis (fonctionne depuis DM et serveur)
// ─────────────────────────────────────────────────────────────────────────────
async function handleModalSubmit(interaction, client) {
  const parts   = interaction.customId.split(':'); // present_modal:step:guildId
  const step    = parseInt(parts[1]);
  const guildId = parts[2];
  const userId  = interaction.user.id;

  // Récupérer / créer la présentation
  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  // Sauvegarder les valeurs du modal
  const modalDef = MODALS[step - 1];
  if (modalDef) {
    for (const f of modalDef.fields) {
      const val = interaction.fields.getTextInputValue(f.key).trim();
      pres[f.key] = val || '';
    }
  }

  // Avancer à l'étape suivante
  const nextStep = step + 1;
  pres.step = nextStep;
  await pres.save();

  // Si toutes les étapes sont faites → finaliser
  if (nextStep > 5) {
    await interaction.deferUpdate().catch(() => {});
    await finaliserPresentation(interaction.user, guildId, pres, client, interaction);
    return;
  }

  // Mettre à jour le message de progression dans le DM (ou serveur)
  const progressEmbed = buildProgressEmbed(interaction.user, nextStep);
  const row = buildStepRow(nextStep, guildId);

  await interaction.update({ embeds: [progressEmbed], components: [row] }).catch(async () => {
    // Si update échoue (ex: interaction depuis serveur éphémère expirée)
    try {
      await interaction.reply({ embeds: [progressEmbed], components: [row], ephemeral: true });
    } catch (_) {
      // En DM on peut aussi essayer d'éditer le message original via followUp
      await interaction.followUp({ embeds: [progressEmbed], components: [row] }).catch(() => {});
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Passer une étape
// ─────────────────────────────────────────────────────────────────────────────
async function skipModal(interaction, client) {
  const parts   = interaction.customId.split(':'); // present:skip_modal:step:guildId
  const step    = parseInt(parts[2]);
  const guildId = parts[3];
  const userId  = interaction.user.id;

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  const nextStep = step + 1;
  pres.step = nextStep;
  await pres.save();

  if (nextStep > 5) {
    await interaction.deferUpdate().catch(() => {});
    await finaliserPresentation(interaction.user, guildId, pres, client, interaction);
    return;
  }

  const progressEmbed = buildProgressEmbed(interaction.user, nextStep);
  const row = buildStepRow(nextStep, guildId);

  await interaction.update({ embeds: [progressEmbed], components: [row] }).catch(async () => {
    await interaction.reply({ embeds: [progressEmbed], components: [row], ephemeral: true }).catch(() => {});
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Finaliser : créer le post forum + donner le rôle + notifier en DM
// ─────────────────────────────────────────────────────────────────────────────
async function finaliserPresentation(user, guildId, pres, client, interaction) {
  pres.step = 6; // done
  await pres.save();

  const config = await Config.findOne({ guildId });
  const guild  = client.guilds.cache.get(guildId);

  // ── Créer le post dans le forum ──────────────────────────────────────────
  const forumId = config?.presentationForumId;
  const forum   = forumId ? guild?.channels.cache.get(forumId) : null;
  let forumLink = '';

  if (forum && forum.type === ChannelType.GuildForum) {
    const content     = buildForumContent(pres, user.id);
    const safeContent = content.length > 1990 ? content.slice(0, 1990) : content;

    const forumTags  = forum.availableTags || [];
    const tagIds     = [];
    const genreLower = (pres.genre || '').toLowerCase();
    for (const t of forumTags) {
      const tn = t.name.toLowerCase();
      if ((tn.includes('fille') || tn.includes('femme')) && (genreLower.includes('fille') || genreLower.includes('femme'))) { tagIds.push(t.id); break; }
      if ((tn.includes('garçon') || tn.includes('gars') || tn.includes('homme') || tn.includes('mec')) && (genreLower.includes('garçon') || genreLower.includes('gars') || genreLower.includes('homme') || genreLower.includes('mec'))) { tagIds.push(t.id); break; }
    }
    const ageNum = parseInt(pres.age) || 0;
    for (const t of forumTags) {
      const tn = t.name.toLowerCase();
      if (tn.includes('-18') && ageNum > 0 && ageNum < 18)          { tagIds.push(t.id); break; }
      if ((tn.includes('+18') || tn.includes('majeur')) && ageNum >= 18) { tagIds.push(t.id); break; }
    }

    try {
      const thread = await forum.threads.create({
        name: `✦ ${pres.prenom || user.username} ✦`,
        message: { content: safeContent },
        appliedTags: tagIds.slice(0, 5),
      });
      pres.forumPostId = thread.id;
      await pres.save();
      forumLink = `\n📌 Ta présentation : <#${thread.id}>`;
    } catch (err) {
      logger.error('Presentation', 'Erreur création post forum', err);
    }
  }

  // ── Donner le rôle Membre Confirmé ──────────────────────────────────────
  const confirmedRoleId = config?.confirmedRoleId;
  let roleMsg = '';
  if (confirmedRoleId && guild) {
    try {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) {
        await member.roles.add(confirmedRoleId);
        roleMsg = `\n🎖️ Tu as reçu le rôle <@&${confirmedRoleId}> !`;
      }
    } catch (err) {
      logger.error('Presentation', 'Erreur attribution rôle', err);
    }
  }

  // ── Embed de fin ─────────────────────────────────────────────────────────
  const doneEmbed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🎉 Présentation terminée et publiée !')
    .setDescription(
      `Super, ta présentation est maintenant dans le forum ! 🥳\n\n` +
      `La communauté va adorer te découvrir.\n` +
      `N'hésite pas à aller te balader dans les salons !` +
      forumLink +
      roleMsg
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();

  // Essayer d'éditer le message dans le DM d'abord
  if (interaction && !interaction.replied && !interaction.deferred) {
    await interaction.reply({ embeds: [doneEmbed], components: [] }).catch(() => {});
  } else if (interaction) {
    await interaction.editReply({ embeds: [doneEmbed], components: [] }).catch(async () => {
      // Fallback : envoyer un DM direct à l'utilisateur
      try {
        const dmChannel = await user.createDM();
        await dmChannel.send({ embeds: [doneEmbed] });
      } catch (_) {}
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Afficher le panneau de progression (commande /presentation reprendre)
//    Fonctionne depuis le serveur, envoie la progression en éphémère
// ─────────────────────────────────────────────────────────────────────────────
async function showProgressPanel(interaction, client, pres) {
  const step = Math.min(pres.step || 1, 5);
  const progressEmbed = buildProgressEmbed(interaction.user, step);
  const guildId = interaction.guild?.id || pres.guildId;
  const row = buildStepRow(step, guildId);

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [progressEmbed], components: [row] });
  } else {
    await interaction.reply({ embeds: [progressEmbed], components: [row], ephemeral: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. /presentation reprendre
// ─────────────────────────────────────────────────────────────────────────────
async function handleReprendreCommand(interaction, client) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild?.id || null;
  if (!guildId) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée dans le serveur.', ephemeral: true });
  }

  let pres = await Presentation.findOne({ userId, guildId });

  if (pres?.step > 5 && pres?.forumPostId) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:reset:${guildId}`)
        .setLabel('✏️ Modifier ma présentation')
        .setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      content: `✅ Ta présentation est déjà publiée !${pres.forumPostId ? ` Voir : <#${pres.forumPostId}>` : ''}\nTu veux la recommencer ?`,
      components: [row],
      ephemeral: true,
    });
  }

  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  await showProgressPanel(interaction, client, pres);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. /presentation modifier
// ─────────────────────────────────────────────────────────────────────────────
async function handleModifierCommand(interaction, client) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild?.id || null;
  if (!guildId) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée dans le serveur.', ephemeral: true });
  }

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) {
    return interaction.reply({ content: '❌ Tu n\'as pas encore de présentation. Utilise `/presentation reprendre`.', ephemeral: true });
  }

  pres.step = 1;
  await pres.save();

  await showProgressPanel(interaction, client, pres);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. /presentation voir
// ─────────────────────────────────────────────────────────────────────────────
async function handleVoirCommand(interaction) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild?.id || null;
  if (!guildId) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée dans le serveur.', ephemeral: true });
  }

  const pres = await Presentation.findOne({ userId, guildId });

  if (!pres || pres.step <= 1) {
    return interaction.reply({ content: '❌ Tu n\'as pas encore de présentation.', ephemeral: true });
  }

  function d(v) { return v && v.trim() ? v.trim() : '—'; }

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`Aperçu de ta présentation`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: '▸ IDENTITÉ',      value: `┊ Prénom : ${d(pres.prenom)}\n┊ Âge : ${d(pres.age)}\n┊ Genre : ${d(pres.genre)}\n┊ Origine : ${d(pres.origine)}\n┊ Orientation : ${d(pres.orientation)}`, inline: false },
      { name: '▸ APPARENCE',     value: `┊ Taille : ${d(pres.taille)}\n┊ Yeux : ${d(pres.yeux)}\n┊ Cheveux : ${d(pres.cheveux)}\n┊ Style : ${d(pres.style)}`, inline: false },
      { name: '▸ PERSONNALITÉ',  value: `┊ Positifs : ${d(pres.positifs)}\n┊ Négatifs : ${d(pres.negatifs)}`, inline: false },
      { name: '▸ PRÉFÉRENCES',   value: `┊ Couleur : ${d(pres.couleur)}\n┊ Musique : ${d(pres.musique)}\n┊ Nourriture : ${d(pres.nourriture)}`, inline: false },
      { name: '▸ ANIME & MANGA', value: `┊ Anime : ${d(pres.anime)}\n┊ Perso féminin : ${d(pres.persoF)}\n┊ Perso masculin : ${d(pres.persoM)}`, inline: false },
      { name: '▸ GOÛTS',         value: `┊ Aime : ${d(pres.aime)}\n┊ Déteste : ${d(pres.deteste)}`, inline: false },
    )
    .setFooter({ text: pres.forumPostId ? 'Publié dans le forum' : 'Pas encore publié' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Bouton reset (modifier depuis l'écran "déjà publié")
// ─────────────────────────────────────────────────────────────────────────────
async function handleResetButton(interaction, client) {
  const guildId = interaction.customId.split(':')[2];
  const userId  = interaction.user.id;

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  pres.step = 1;
  await pres.save();

  await showProgressPanel(interaction, client, pres);
}

module.exports = {
  sendWelcomeDM,
  openModal,
  handleModalSubmit,
  skipModal,
  handleResetButton,
  handleReprendreCommand,
  handleModifierCommand,
  handleVoirCommand,
  // compat: ancienne API
  startQuestionnaire: handleReprendreCommand,
  skipEtape: skipModal,
};
