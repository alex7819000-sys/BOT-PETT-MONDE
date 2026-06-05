// src/systems/presentation/index.js — Questionnaire présentation en DM (5 étapes)
// Flow : guildMemberAdd → DM welcome → bouton "Me présenter" → questions/réponses DM → post forum + rôle
'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

const Config       = require('../../db/models/Config');
const Presentation = require('../../db/models/Presentation');
const logger       = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG DES 5 ÉTAPES
// ─────────────────────────────────────────────────────────────────────────────
const ETAPES = [
  {
    id: 1,
    emoji: '🪪',
    titre: 'Identité',
    desc: 'Prénom, âge, genre, origine...',
    champs: ['prenom', 'age', 'genre', 'origine', 'orientation'],
    questions: [
      { key: 'prenom',      label: 'Prénom / Pseudo',        placeholder: 'Comment tu t\'appelles ?' },
      { key: 'age',         label: 'Âge',                    placeholder: 'Ex : 17 ans' },
      { key: 'genre',       label: 'Genre',                  placeholder: 'Ex : Garçon, Fille, Non-binaire...' },
      { key: 'origine',     label: 'Origine / Nationalité',  placeholder: 'Ex : Français, Belge... (tape — pour passer)' },
      { key: 'orientation', label: 'Orientation (facultatif)', placeholder: 'Ex : Hétéro, Bi... (tape — pour passer)' },
    ],
  },
  {
    id: 2,
    emoji: '👗',
    titre: 'Apparence',
    desc: 'Taille, yeux, cheveux, style...',
    champs: ['taille', 'yeux', 'cheveux', 'style'],
    questions: [
      { key: 'taille',  label: 'Taille',              placeholder: 'Ex : 1m75 (tape — pour passer)' },
      { key: 'yeux',    label: 'Couleur des yeux',    placeholder: 'Ex : Marrons, Verts... (tape — pour passer)' },
      { key: 'cheveux', label: 'Cheveux',             placeholder: 'Ex : Noirs longs, Courts châtains... (tape — pour passer)' },
      { key: 'style',   label: 'Style vestimentaire', placeholder: 'Ex : Streetwear, Casual... (tape — pour passer)' },
    ],
  },
  {
    id: 3,
    emoji: '🧠',
    titre: 'Personnalité',
    desc: 'Traits positifs et négatifs',
    champs: ['positifs', 'negatifs'],
    questions: [
      { key: 'positifs', label: 'Traits positifs', placeholder: 'Ex : Drôle, Loyal, Créatif... (tape — pour passer)' },
      { key: 'negatifs', label: 'Traits négatifs', placeholder: 'Ex : Impatient, Trop casanier... (tape — pour passer)' },
    ],
  },
  {
    id: 4,
    emoji: '🎨',
    titre: 'Préférences & Goûts',
    desc: 'Couleur, musique, nourriture, aimes/détestes',
    champs: ['couleur', 'musique', 'nourriture', 'aime', 'deteste'],
    questions: [
      { key: 'couleur',    label: 'Couleur préférée',  placeholder: 'Ex : Bleu nuit (tape — pour passer)' },
      { key: 'musique',    label: 'Musique préférée',  placeholder: 'Ex : Rap FR, Phonk, K-pop... (tape — pour passer)' },
      { key: 'nourriture', label: 'Nourriture préférée', placeholder: 'Ex : Pizza, Sushi... (tape — pour passer)' },
      { key: 'aime',       label: 'Ce que tu aimes',   placeholder: 'Ex : Gaming, les animaux, dormir... (tape — pour passer)' },
      { key: 'deteste',    label: 'Ce que tu détestes', placeholder: 'Ex : Les hypocrites, se lever tôt... (tape — pour passer)' },
    ],
  },
  {
    id: 5,
    emoji: '🎌',
    titre: 'Anime & Manga',
    desc: 'Anime préféré, perso féminin, perso masculin',
    champs: ['anime', 'persoF', 'persoM'],
    questions: [
      { key: 'anime',  label: 'Anime préféré',             placeholder: 'Ex : Demon Slayer, One Piece... (tape — pour passer)' },
      { key: 'persoF', label: 'Personnage féminin préféré', placeholder: 'Ex : Nezuko (tape — pour passer)' },
      { key: 'persoM', label: 'Personnage masculin préféré', placeholder: 'Ex : Tanjiro (tape — pour passer)' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function dash(v) { return v && v.trim() && v.trim() !== '—' ? v.trim() : '—'; }

function buildProgressBar(step, total = 5) {
  const filled = Math.round((step / total) * 8);
  return '█'.repeat(filled) + '░'.repeat(8 - filled);
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

// État en mémoire des sessions actives (userId → { guildId, etapeIdx, questionIdx, collector })
const activeSessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// 1. DM de bienvenue
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
      .setFooter({ text: 'Tu peux reprendre ta présentation à tout moment avec /presentation reprendre' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:start:${member.guild.id}`)
        .setLabel('Me présenter maintenant')
        .setEmoji('🪪')
        .setStyle(ButtonStyle.Primary),
    );

    await member.send({ embeds: [embed], components: [row] });
    logger.info('Presentation', `DM bienvenue envoyé à ${member.user.tag}`);
  } catch (err) {
    logger.debug('Presentation', `DM impossible pour ${member.user?.tag}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Démarrer / Reprendre le questionnaire depuis le bouton DM
// ─────────────────────────────────────────────────────────────────────────────
async function startQuestionnaire(interaction, client, guildId) {
  const userId = interaction.user.id;

  // Si session déjà active → stop l'ancienne
  if (activeSessions.has(userId)) {
    const old = activeSessions.get(userId);
    if (old.collector) old.collector.stop('restart');
    activeSessions.delete(userId);
  }

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  if (pres.step > 5 && pres.forumPostId) {
    return interaction.reply({
      content: `✅ Ta présentation est déjà publiée ! Tu peux la modifier avec \`/presentation modifier\` dans le serveur.`,
    });
  }

  // Ack le bouton
  await interaction.reply({
    content: `📝 C'est parti ! La présentation se fait en **5 étapes rapides**.\nTu peux **passer** n'importe quelle étape si tu ne veux pas répondre.`,
  });

  // Lancer depuis l'étape en cours
  const etapeIdx = Math.min((pres.step || 1) - 1, ETAPES.length - 1);
  await envoyerEtape(interaction.user, guildId, etapeIdx, 0, pres, client);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Envoi d'une étape (embed + premier champ)
// ─────────────────────────────────────────────────────────────────────────────
async function envoyerEtape(user, guildId, etapeIdx, questionIdx, pres, client) {
  const etape = ETAPES[etapeIdx];

  // Compter ce qui est déjà rempli
  const deja = ETAPES.slice(0, etapeIdx).map(e => {
    const nb = e.champs.filter(c => pres[c] && pres[c] !== '').length;
    return nb > 0 ? `✅ ${e.titre} — ${nb} info(s)` : null;
  }).filter(Boolean);

  const bar = buildProgressBar(etapeIdx, 5);

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: `Présentation de ${user.username}`, iconURL: user.displayAvatarURL() })
    .setTitle(`${etape.emoji} ${etape.titre}`)
    .setDescription(
      `**Progression :** \`${bar}\` ${etapeIdx}/5\n` +
      `**Étape actuelle :** ${etape.emoji} ${etape.titre}\n` +
      `${etape.desc}\n\n` +
      (deja.length ? `**Déjà complété :**\n${deja.join('\n')}\n\n` : '') +
      `Tu peux passer n'importe quelle étape !`
    )
    .setTimestamp();

  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:skip_etape:${etapeIdx}:${guildId}`)
      .setLabel('Passer cette étape →')
      .setStyle(ButtonStyle.Secondary),
  );

  // Embed principal de l'étape
  let etapeMsg;
  try {
    etapeMsg = await user.send({ embeds: [embed], components: [skipRow] });
  } catch {
    return; // DMs fermés
  }

  // Poser la première question
  await poserQuestion(user, guildId, etapeIdx, questionIdx, pres, client, etapeMsg);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Poser une question individuelle
// ─────────────────────────────────────────────────────────────────────────────
async function poserQuestion(user, guildId, etapeIdx, questionIdx, pres, client, etapeMsg) {
  const etape    = ETAPES[etapeIdx];
  const question = etape.questions[questionIdx];
  if (!question) return; // sécurité

  const qEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`**${question.label}**\n*${question.placeholder}*`);

  let qMsg;
  try {
    qMsg = await user.send({ embeds: [qEmbed] });
  } catch {
    activeSessions.delete(user.id);
    return;
  }

  // Récupérer le DM channel
  const dmChannel = qMsg.channel;

  // Collecter la réponse (60 sec)
  const collector = dmChannel.createMessageCollector({
    filter: m => m.author.id === user.id,
    max: 1,
    time: 5 * 60 * 1000, // 5 min par question
  });

  activeSessions.set(user.id, { guildId, etapeIdx, questionIdx, collector });

  collector.on('collect', async msg => {
    activeSessions.delete(user.id);

    const reponse = msg.content.trim();
    // "—" ou "-" = skip
    const valeur = (reponse === '—' || reponse === '-' || reponse === '--') ? '' : reponse;

    // Sauvegarder
    pres[question.key] = valeur;
    await pres.save();

    // Confirmer
    const confirmEmoji = valeur ? '✅' : '⏩';
    await msg.react(confirmEmoji).catch(() => {});

    // Question suivante dans la même étape ?
    if (questionIdx + 1 < etape.questions.length) {
      await poserQuestion(user, guildId, etapeIdx, questionIdx + 1, pres, client, etapeMsg);
    } else {
      // Étape terminée → étape suivante ou finaliser
      pres.step = etapeIdx + 2; // next step number
      await pres.save();

      if (etapeIdx + 1 < ETAPES.length) {
        // Afficher résumé de l'étape
        await afficherResumeEtape(user, etape, pres);
        // Petite pause
        await new Promise(r => setTimeout(r, 800));
        await envoyerEtape(user, guildId, etapeIdx + 1, 0, pres, client);
      } else {
        // Tout terminé → finaliser
        await finaliserPresentation(user, guildId, pres, client);
      }
    }
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      // Timeout → sauvegarder et prévenir
      user.send({
        embeds: [new EmbedBuilder()
          .setColor(0xFF5555)
          .setDescription(`⏰ **Temps écoulé !**\nTa progression est sauvegardée jusqu'à l'étape ${etapeIdx + 1}.\nUtilise \`/presentation reprendre\` dans le serveur pour continuer.`)
        ]
      }).catch(() => {});
      activeSessions.delete(user.id);
    }
  });

  // Gérer le bouton "Passer cette étape"
  // (écouté via le handler buttons.js → skipEtape)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Résumé d'une étape complétée
// ─────────────────────────────────────────────────────────────────────────────
async function afficherResumeEtape(user, etape, pres) {
  const lignes = etape.questions.map(q => {
    const val = pres[q.key] || '—';
    return `┊ ${q.label} : **${val || '—'}**`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`✅ ${etape.titre} — Enregistré !`)
    .setDescription(lignes);

  await user.send({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Passer toute une étape (bouton "Passer cette étape →")
// ─────────────────────────────────────────────────────────────────────────────
async function skipEtape(interaction, client) {
  const etapeIdx = parseInt(interaction.customId.split(':')[2]);
  const userId   = interaction.user.id;

  // Stopper le collector actif
  if (activeSessions.has(userId)) {
    const sess = activeSessions.get(userId);
    if (sess.collector) sess.collector.stop('skip');
    activeSessions.delete(userId);
  }

  const guildId = interaction.customId.split(':')[3] || null;

  await interaction.reply({ content: `⏩ Étape passée !` }).catch(() => {});

  // Retrouver la présentation
  let pres = null;
  // Chercher dans toutes les guilds si guildId absent
  if (guildId) {
    pres = await Presentation.findOne({ userId, guildId });
  } else {
    pres = await Presentation.findOne({ userId });
  }
  if (!pres) return;

  const nextEtapeIdx = etapeIdx + 1;
  pres.step = nextEtapeIdx + 1;
  await pres.save();

  if (nextEtapeIdx < ETAPES.length) {
    await envoyerEtape(interaction.user, pres.guildId, nextEtapeIdx, 0, pres, client);
  } else {
    await finaliserPresentation(interaction.user, pres.guildId, pres, client);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Finaliser : créer le post forum + donner le rôle
// ─────────────────────────────────────────────────────────────────────────────
async function finaliserPresentation(user, guildId, pres, client) {
  pres.step = 6; // done
  await pres.save();

  const config = await Config.findOne({ guildId });
  const guild  = client.guilds.cache.get(guildId);

  // ── Créer le post dans le forum ──────────────────────────────────────────
  const forumId = config?.presentationForumId;
  const forum   = forumId ? guild?.channels.cache.get(forumId) : null;
  let forumLink = '';

  if (forum && forum.type === ChannelType.GuildForum) {
    const content   = buildForumContent(pres, user.id);
    const safeContent = content.length > 1990 ? content.slice(0, 1990) : content;

    // Tags forum automatiques
    const forumTags = forum.availableTags || [];
    const tagIds    = [];
    const genreLower = (pres.genre || '').toLowerCase();
    for (const t of forumTags) {
      const tn = t.name.toLowerCase();
      if ((tn.includes('fille') || tn.includes('femme')) && (genreLower.includes('fille') || genreLower.includes('femme'))) { tagIds.push(t.id); break; }
      if ((tn.includes('garçon') || tn.includes('gars') || tn.includes('homme') || tn.includes('mec')) && (genreLower.includes('garçon') || genreLower.includes('gars') || genreLower.includes('homme') || genreLower.includes('mec'))) { tagIds.push(t.id); break; }
    }
    const ageNum = parseInt(pres.age) || 0;
    for (const t of forumTags) {
      const tn = t.name.toLowerCase();
      if (tn.includes('-18') && ageNum > 0 && ageNum < 18) { tagIds.push(t.id); break; }
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
      forumLink = `\n📌 Voir ta présentation : <#${thread.id}>`;
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

  // ── DM de confirmation ───────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🎉 Présentation postée !')
    .setDescription(
      `Ta présentation a bien été publiée dans le forum !\n\n` +
      `La communauté va adorer te découvrir.\n` +
      `N'hésite pas à aller te balader dans les salons !` +
      forumLink +
      roleMsg
    )
    .setThumbnail(user.displayAvatarURL());

  await user.send({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. /presentation reprendre (depuis le serveur)
// ─────────────────────────────────────────────────────────────────────────────
async function handleReprendreCommand(interaction, client) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild.id;

  let pres = await Presentation.findOne({ userId, guildId });

  if (pres?.step > 5 && pres?.forumPostId) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`present:modifier_start:${guildId}`)
        .setLabel('✏️ Modifier ma présentation')
        .setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      content: `✅ Ta présentation est déjà publiée !${pres.forumPostId ? ` Tu peux la voir ici : <#${pres.forumPostId}>` : ''}\nTu veux la modifier ?`,
      components: [row],
      ephemeral: true,
    });
  }

  if (!pres) pres = await Presentation.create({ userId, guildId, step: 1 });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`present:dm_start:${guildId}`)
      .setLabel(`${pres.step > 1 ? `▶️ Reprendre (étape ${pres.step}/5)` : '🪪 Commencer ma présentation'}`)
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: `📨 Je vais t'envoyer la suite de ta présentation en MP !`,
    components: [row],
    ephemeral: true,
  });

  // Lancer directement en DM
  await envoyerEtape(
    interaction.user,
    guildId,
    Math.min((pres.step || 1) - 1, ETAPES.length - 1),
    0,
    pres,
    client,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. /presentation modifier (depuis le serveur)
// ─────────────────────────────────────────────────────────────────────────────
async function handleModifierCommand(interaction, client) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild.id;

  let pres = await Presentation.findOne({ userId, guildId });
  if (!pres) {
    return interaction.reply({ content: '❌ Tu n\'as pas encore de présentation. Utilise `/presentation reprendre`.', ephemeral: true });
  }

  // Reset step pour tout refaire
  pres.step = 1;
  await pres.save();

  await interaction.reply({
    content: `✏️ **Modification de ta présentation en cours...**\nJe t'envoie le questionnaire en MP !`,
    ephemeral: true,
  });

  await envoyerEtape(interaction.user, guildId, 0, 0, pres, client);
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Aperçu de sa présentation (commande /presentation voir)
// ─────────────────────────────────────────────────────────────────────────────
async function handleVoirCommand(interaction) {
  const userId  = interaction.user.id;
  const guildId = interaction.guild.id;
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
      { name: '▸ IDENTITÉ', value: `┊ Prénom : ${d(pres.prenom)}\n┊ Âge : ${d(pres.age)}\n┊ Genre : ${d(pres.genre)}\n┊ Origine : ${d(pres.origine)}\n┊ Orientation : ${d(pres.orientation)}`, inline: false },
      { name: '▸ APPARENCE', value: `┊ Taille : ${d(pres.taille)}\n┊ Yeux : ${d(pres.yeux)}\n┊ Cheveux : ${d(pres.cheveux)}\n┊ Style : ${d(pres.style)}`, inline: false },
      { name: '▸ PERSONNALITÉ', value: `┊ Positifs : ${d(pres.positifs)}\n┊ Négatifs : ${d(pres.negatifs)}`, inline: false },
      { name: '▸ PRÉFÉRENCES', value: `┊ Couleur : ${d(pres.couleur)}\n┊ Musique : ${d(pres.musique)}\n┊ Nourriture : ${d(pres.nourriture)}`, inline: false },
      { name: '▸ ANIME & MANGA', value: `┊ Anime : ${d(pres.anime)}\n┊ Perso féminin : ${d(pres.persoF)}\n┊ Perso masculin : ${d(pres.persoM)}`, inline: false },
      { name: '▸ GOÛTS', value: `┊ Aime : ${d(pres.aime)}\n┊ Déteste : ${d(pres.deteste)}`, inline: false },
    )
    .setFooter({ text: pres.forumPostId ? `Publié dans le forum` : `Pas encore publié` });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
  sendWelcomeDM,
  startQuestionnaire,
  skipEtape,
  handleReprendreCommand,
  handleModifierCommand,
  handleVoirCommand,
  activeSessions,
};
