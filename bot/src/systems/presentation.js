// src/systems/presentation/index.js — v9
// Nouveautés :
//   - /presentation recommencer : reset total (même en cours ou déjà publié)
//   - Bouton dans chaque post forum "📋 Faire ma présentation" (forum_start)
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
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const Config       = require('../db/models/Config');
const Presentation = require('../db/models/Presentation');
const logger       = require('../utils/logger');

const MODALS = [
  {
    id: 'present_modal_1', emoji: '🪪', titre: 'Identité',
    fields: [
      { key: 'prenom',      label: 'Prénom / Pseudo',          placeholder: 'Ex : Alex',                 required: true,  style: TextInputStyle.Short },
      { key: 'age',         label: 'Âge',                      placeholder: 'Ex : 17 ans',               required: true,  style: TextInputStyle.Short },
      { key: 'genre',       label: 'Genre',                    placeholder: 'Ex : Garçon, Fille, NB...', required: false, style: TextInputStyle.Short },
      { key: 'origine',     label: 'Origine / Nationalité',    placeholder: 'Ex : Français, Belge...',   required: false, style: TextInputStyle.Short },
      { key: 'orientation', label: 'Orientation (facultatif)', placeholder: 'Ex : Hétéro, Bi...',        required: false, style: TextInputStyle.Short },
    ],
  },
  {
    id: 'present_modal_2', emoji: '👗', titre: 'Apparence',
    fields: [
      { key: 'taille',  label: 'Taille',              placeholder: 'Ex : 1m75',                         required: false, style: TextInputStyle.Short },
      { key: 'yeux',    label: 'Couleur des yeux',    placeholder: 'Ex : Marrons, Verts...',            required: false, style: TextInputStyle.Short },
      { key: 'cheveux', label: 'Cheveux',             placeholder: 'Ex : Noirs longs, Courts châtains', required: false, style: TextInputStyle.Short },
      { key: 'style',   label: 'Style vestimentaire', placeholder: 'Ex : Streetwear, Casual...',        required: false, style: TextInputStyle.Short },
    ],
  },
  {
    id: 'present_modal_3', emoji: '🧠', titre: 'Personnalité',
    fields: [
      { key: 'positifs', label: 'Traits positifs', placeholder: 'Ex : Drôle, Loyal, Créatif...',     required: false, style: TextInputStyle.Paragraph },
      { key: 'negatifs', label: 'Traits négatifs', placeholder: 'Ex : Impatient, Trop casanier...', required: false, style: TextInputStyle.Paragraph },
    ],
  },
  {
    id: 'present_modal_4', emoji: '🎨', titre: 'Préférences & Goûts',
    fields: [
      { key: 'couleur',    label: 'Couleur préférée',    placeholder: 'Ex : Bleu nuit',            required: false, style: TextInputStyle.Short },
      { key: 'musique',    label: 'Musique préférée',    placeholder: 'Ex : Rap FR, Phonk, K-pop', required: false, style: TextInputStyle.Short },
      { key: 'nourriture', label: 'Nourriture préférée', placeholder: 'Ex : Pizza, Sushi...',      required: false, style: TextInputStyle.Short },
      { key: 'aime',       label: 'Ce que tu aimes',     placeholder: 'Ex : Gaming, les animaux',  required: false, style: TextInputStyle.Paragraph },
      { key: 'deteste',    label: 'Ce que tu détestes',  placeholder: 'Ex : Les hypocrites...',    required: false, style: TextInputStyle.Paragraph },
    ],
  },
  {
    id: 'present_modal_5', emoji: '🎌', titre: 'Anime & Manga',
    fields: [
      { key: 'anime',  label: 'Anime préféré',               placeholder: 'Ex : Demon Slayer, One Piece...', required: false, style: TextInputStyle.Short },
      { key: 'persoF', label: 'Personnage féminin préféré',  placeholder: 'Ex : Nezuko',                    required: false, style: TextInputStyle.Short },
      { key: 'persoM', label: 'Personnage masculin préféré', placeholder: 'Ex : Tanjiro',                   required: false, style: TextInputStyle.Short },
    ],
  },
];

function dash(v) { return v && v.trim() ? v.trim() : '—'; }

function buildProgressBar(step, total = 5) {
  const filled = Math.round((step / total) * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function buildForumContent(p, userId) {
  return [
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
  ].join('\n');
}

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

// Bouton forum "Faire ma présentation" — affiché sous chaque post du forum
function buildForumStartRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:forum_start:${guildId}`)
      .setLabel('📋 Faire ma présentation')
      .setStyle(ButtonStyle.Primary),
  );
}

// ─── sendWelcomeDM ────────────────────────────────────────────────────────────
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

    const guildId = member.guild.id;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:open_modal:1:${guildId}`)
        .setLabel('📋 Me présenter maintenant')
        .setStyle(ButtonStyle.Primary),
    );
    const rowInfo = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('info:serv')
        .setLabel('❓ Comment ça marche ?')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('info:kuzan')
        .setLabel('👑 C\'est qui Kuzan ?')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('info:xp')
        .setLabel('⭐ Le système XP ?')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('info:regles')
        .setLabel('📜 Les règles ?')
        .setStyle(ButtonStyle.Secondary),
    );
    const rowColor = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`info:couleur:${guildId}`)
        .setLabel('🎨 Choisir ma couleur de pseudo')
        .setStyle(ButtonStyle.Success),
    );

    // ── Pings configurés depuis le dashboard ──────────────────────────────
    const components = [row, rowInfo, rowColor];
    if (config?.onboardingEnabled !== false && config?.pingRoles?.length) {
      // On découpe en rangées de 5 boutons max (limite Discord)
      const pings = config.pingRoles;
      const chunks = [];
      for (let i = 0; i < pings.length; i += 5) chunks.push(pings.slice(i, i + 5));
      for (const chunk of chunks.slice(0, 2)) { // max 2 rangées de pings (5 items restants pour les autres rows)
        const pingRow = new ActionRowBuilder();
        for (const p of chunk) {
          pingRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`ping_toggle:${p.id}:${p.roleId}`)
              .setLabel(p.label)
              .setEmoji(p.emoji || '🔔')
              .setStyle(ButtonStyle.Secondary)
          );
        }
        components.push(pingRow);
      }
      // Ajouter une ligne dans l'embed pour indiquer les pings
      embed.addFields({ name: '🔔 Choisis tes notifications', value: "Clique sur les boutons ci-dessous pour activer/désactiver les pings qui t'intéressent.", inline: false });
    }

    await member.send({ embeds: [embed], components: components.slice(0, 5) }); // max 5 rows Discord
    logger.info('Presentation', `DM bienvenue envoyé à ${member.user.tag}`);
  } catch (err) {
    logger.debug('Presentation', `DM impossible pour ${member.user?.tag}`);
  }
}

// ─── openModal ───────────────────────────────────────────────────────────────
async function openModal(interaction, client) {
  const parts   = interaction.customId.split(':');
  const step    = parseInt(parts[2]);
  const guildId = parts[3];

  const modalDef = MODALS[step - 1];
  if (!modalDef) return;

  const userId = interaction.user.id;
  const pres = await Presentation.findOne({ userId, guildId });
  if (!pres) await Presentation.create({ userId, guildId, step: 1 });

  await interaction.showModal(buildModal(modalDef, guildId, step));
}

// ─── handleModalSubmit ───────────────────────────────────────────────────────
async function handleModalSubmit(interaction, client) {
  const parts   = interaction.customId.split(':');
  const step    = parseInt(parts[1]);
  const guildId = parts[2];
  const userId  = interaction.user.id;

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  const modalDef = MODALS[step - 1];
  if (modalDef) {
    for (const f of modalDef.fields) {
      pres[f.key] = interaction.fields.getTextInputValue(f.key).trim() || '';
    }
  }

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
    try {
      await interaction.reply({ embeds: [progressEmbed], components: [row], ephemeral: true });
    } catch (_) {
      await interaction.followUp({ embeds: [progressEmbed], components: [row] }).catch(() => {});
    }
  });
}

// ─── skipModal ───────────────────────────────────────────────────────────────
async function skipModal(interaction, client) {
  const parts   = interaction.customId.split(':');
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

// ─── finaliserPresentation ───────────────────────────────────────────────────
async function finaliserPresentation(user, guildId, pres, client, interaction) {
  pres.step = 6;
  await pres.save();

  const config = await Config.findOne({ guildId });
  const guild  = client.guilds.cache.get(guildId);

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
      // Créer le post avec le bouton "Faire ma présentation" en dessous
      const forumRow = buildForumStartRow(guildId);
      const thread = await forum.threads.create({
        name: `✦ ${pres.prenom || user.username} ✦`,
        message: { content: safeContent, components: [forumRow] },
        appliedTags: tagIds.slice(0, 5),
      });
      pres.forumPostId = thread.id;
      await pres.save();
      forumLink = `\n📌 Ta présentation : <#${thread.id}>`;
    } catch (err) {
      logger.error('Presentation', 'Erreur création post forum', err);
    }
  }

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

  if (interaction && !interaction.replied && !interaction.deferred) {
    await interaction.reply({ embeds: [doneEmbed], components: [] }).catch(() => {});
  } else if (interaction) {
    await interaction.editReply({ embeds: [doneEmbed], components: [] }).catch(async () => {
      try {
        const dmChannel = await user.createDM();
        await dmChannel.send({ embeds: [doneEmbed] });
      } catch (_) {}
    });
  }

  // ── Rappel couleur en DM ─────────────────────────────────────────────────
  try {
    const colorPostChannelId = config?.colorPostChannelId;
    const dmChannel = await user.createDM();
    const colorEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎉 Présentation envoyée !')
      .setDescription(
        '✅ Ta présentation est maintenant publiée sur le serveur !\n\n' +
        '🎨 **Tu peux choisir ou changer ta couleur de pseudo** :\n' +
        (colorPostChannelId ? `→ Dans le salon <#${colorPostChannelId}> sur le serveur\n` : '') +
        '→ Avec la commande `/couleur` sur le serveur\n\n' +
        '> Bienvenue parmi nous ! 🎊'
      );
    await dmChannel.send({ embeds: [colorEmbed] });
  } catch (_) {}
}

// ─── showProgressPanel ───────────────────────────────────────────────────────
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

// ─── handleReprendreCommand (/presentation reprendre) ────────────────────────
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

// ─── handleRecommencerCommand (/presentation recommencer) ────────────────────
// Reset TOTAL — efface tout et repart de l'étape 1, peu importe l'état
async function handleRecommencerCommand(interaction, client) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild?.id || null;
  if (!guildId) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée dans le serveur.', ephemeral: true });
  }

  let pres = await Presentation.findOne({ userId, guildId });

  if (pres) {
    // Reset tous les champs
    const resetFields = {};
    for (const m of MODALS) {
      for (const f of m.fields) resetFields[f.key] = '';
    }
    Object.assign(pres, resetFields, { step: 1, forumPostId: null });
    await pres.save();
  } else {
    pres = await Presentation.create({ userId, guildId, step: 1 });
  }

  await showProgressPanel(interaction, client, pres);
}

// ─── handleModifierCommand (/presentation modifier) ──────────────────────────
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

// ─── handleVoirCommand (/presentation voir) ──────────────────────────────────
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

// ─── handleResetButton (bouton "modifier" depuis l'écran "déjà publié") ───────
async function handleResetButton(interaction, client) {
  const guildId = interaction.customId.split(':')[2];
  const userId  = interaction.user.id;

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  pres.step = 1;
  await pres.save();
  await showProgressPanel(interaction, client, pres);
}

// ─── handleForumStartButton ───────────────────────────────────────────────────
// Clic sur "📋 Faire ma présentation" depuis un post du forum
// Envoie le flow en DM, ou ephémère si DM impossible
async function handleForumStartButton(interaction, client) {
  const guildId = interaction.customId.split(':')[2];
  const userId  = interaction.user.id;
  const user    = interaction.user;

  let pres = await Presentation.findOne({ userId, guildId });

  // Si déjà en cours ou terminé → proposer reset ou reprendre
  if (pres && pres.step > 1) {
    const alreadyDone = pres.step > 5 && pres.forumPostId;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:open_modal:1:${guildId}`)
        .setLabel('▶️ Reprendre ma présentation')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`present:recommencer_btn:${guildId}`)
        .setLabel('🔄 Recommencer depuis 0')
        .setStyle(ButtonStyle.Danger),
    );
    return interaction.reply({
      content: alreadyDone
        ? `✅ Tu as déjà une présentation publiée (<#${pres.forumPostId}>).\nTu veux recommencer ou reprendre ?`
        : `⏸️ Tu as une présentation en cours (étape ${pres.step}/5).\nReprendre ou recommencer ?`,
      components: [row],
      ephemeral: true,
    });
  }

  // Nouvelle présentation → envoyer le flow en DM
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('📋 Questionnaire de présentation')
    .setDescription(
      `Tu as lancé ta présentation depuis le forum !\n\n` +
      `Clique sur le bouton ci-dessous pour commencer l'étape 1.`
    )
    .setFooter({ text: 'Tu peux passer des champs — laisse-les vides si tu ne veux pas répondre.' });

  const dmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:open_modal:1:${guildId}`)
      .setLabel('📋 Commencer l\'étape 1')
      .setStyle(ButtonStyle.Primary),
  );

  try {
    const dm = await user.createDM();
    await dm.send({ embeds: [embed], components: [dmRow] });
    await interaction.reply({ content: '📬 Je t\'ai envoyé un DM pour commencer ta présentation !', ephemeral: true });
  } catch (_) {
    // DM impossible → envoyer en éphémère dans le serveur
    await interaction.reply({ embeds: [embed], components: [dmRow], ephemeral: true });
  }
}

// ─── handleRecommencerButton ─────────────────────────────────────────────────
// Bouton "🔄 Recommencer depuis 0" depuis l'écran forum_start
async function handleRecommencerButton(interaction, client) {
  const guildId = interaction.customId.split(':')[2];
  const userId  = interaction.user.id;

  let pres = await Presentation.findOne({ userId, guildId });
  if (pres) {
    const resetFields = {};
    for (const m of MODALS) {
      for (const f of m.fields) resetFields[f.key] = '';
    }
    Object.assign(pres, resetFields, { step: 1, forumPostId: null });
    await pres.save();
  } else {
    pres = await Presentation.create({ userId, guildId, step: 1 });
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('📋 Questionnaire de présentation')
    .setDescription(`Présentation remise à zéro ! Clique ci-dessous pour commencer.`)
    .setFooter({ text: 'Tu peux passer des champs — laisse-les vides si tu ne veux pas répondre.' });

  const dmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:open_modal:1:${guildId}`)
      .setLabel('📋 Commencer l\'étape 1')
      .setStyle(ButtonStyle.Primary),
  );

  try {
    const dm = await interaction.user.createDM();
    await dm.send({ embeds: [embed], components: [dmRow] });
    await interaction.update({ content: '📬 C\'est parti ! Je t\'ai envoyé un DM.', components: [] });
  } catch (_) {
    await interaction.update({ embeds: [embed], components: [dmRow] });
  }
}

// ─── handleLancerCommand (/presentation lancer — Admin) ──────────────────────
// DM tous les membres du serveur qui n'ont pas encore de présentation complète
async function handleLancerCommand(interaction, client) {
  const guildId = interaction.guild?.id;
  if (!guildId) {
    return interaction.reply({ content: '❌ Commande réservée au serveur.', ephemeral: true });
  }

  // Vérif permission admin (double sécurité)
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '❌ Réservé aux administrateurs.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  // Fetch tous les membres (peut prendre du temps sur gros serveurs)
  await guild.members.fetch();
  const members = guild.members.cache.filter(m => !m.user.bot);

  const config = await Config.findOne({ guildId });
  const roleName = config?.confirmedRoleId
    ? `<@&${config.confirmedRoleId}>`
    : '**Membre Confirmé ✅**';

  let sent = 0, skipped = 0, failed = 0;

  // Barre de progression dans la réponse ephémère
  await interaction.editReply({ content: `⏳ Envoi en cours... (0/${members.size})` });

  let i = 0;
  for (const [, member] of members) {
    i++;
    const userId = member.user.id;

    // Si déjà une présentation complète → skip
    const pres = await Presentation.findOne({ userId, guildId });
    if (pres && pres.step > 5 && pres.forumPostId) {
      skipped++;
      continue;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`📋 Le serveur ${guild.name} t'invite à te présenter !`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setDescription(
        `Hey <@${userId}> ! 👋\n\n` +
        `Tu n'as pas encore de présentation sur **${guild.name}**.\n` +
        `C'est l'occasion de te faire connaître de la communauté !\n\n` +
        `Partage ton pseudo, tes goûts, ta personnalité...\n` +
        `Les membres viendront t'accueillir ! 🥳\n\n` +
        `> 🎖️ En te présentant tu obtiens le rôle ${roleName} !`
      )
      .setFooter({ text: 'Clique sur le bouton ci-dessous pour commencer ta présentation !' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:open_modal:1:${guildId}`)
        .setLabel('📋 Me présenter maintenant')
        .setStyle(ButtonStyle.Primary),
    );

    try {
      await member.send({ embeds: [embed], components: [row] });
      sent++;
    } catch (_) {
      failed++;
    }

    // Mise à jour progression tous les 10 membres
    if (i % 10 === 0) {
      await interaction.editReply({
        content: `⏳ Envoi en cours... (${i}/${members.size}) — ✅ ${sent} envoyés, ⏭️ ${skipped} ignorés, ❌ ${failed} échecs`,
      }).catch(() => {});
    }

    // Petite pause pour éviter rate limit Discord
    await new Promise(r => setTimeout(r, 800));
  }

  await interaction.editReply({
    content:
      `✅ **Campagne terminée !**\n\n` +
      `📬 **${sent}** DM envoyés\n` +
      `⏭️ **${skipped}** membres ignorés (présentation déjà publiée)\n` +
      `❌ **${failed}** DM impossibles (DM fermés)\n\n` +
      `Les nouveaux membres continueront à recevoir le DM automatiquement à leur arrivée.`,
  });
}

module.exports = {
  sendWelcomeDM,
  openModal,
  handleModalSubmit,
  skipModal,
  handleResetButton,
  handleForumStartButton,
  handleRecommencerButton,
  handleReprendreCommand,
  handleRecommencerCommand,
  handleModifierCommand,
  handleVoirCommand,
  handleLancerCommand,
  // compat
  startQuestionnaire: handleReprendreCommand,
  skipEtape: skipModal,
};
