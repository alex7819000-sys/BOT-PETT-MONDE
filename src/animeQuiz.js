// src/animeQuiz.js — Quiz Anime Quotidien 🎌

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");
const fs   = require("fs");
const path = require("path");

const QUIZ_FILE = path.join(__dirname, "../data/animeQuiz.json");

function loadQuizDB() {
  if (!fs.existsSync(QUIZ_FILE)) return { scores: {}, todayAnswered: {}, lastQuizDate: null };
  return JSON.parse(fs.readFileSync(QUIZ_FILE, "utf-8"));
}
function saveQuizDB(db) {
  fs.mkdirSync(path.dirname(QUIZ_FILE), { recursive: true });
  fs.writeFileSync(QUIZ_FILE, JSON.stringify(db, null, 2));
}

// ── Base de questions ─────────────────────────────────────────────────────
const QUESTIONS = [
  { q: "Dans quel anime trouve-t-on le personnage **Naruto Uzumaki** ?", answers: ["naruto"], wrong: ["bleach", "one piece", "dragon ball"] },
  { q: "Quel est le vrai nom de **Light Yagami** dans Death Note ?", answers: ["light yagami", "light"], wrong: ["kira", "l lawliet", "ryuk"] },
  { q: "Dans **One Piece**, quel est le fruit du démon de Luffy ?", answers: ["gomu gomu", "gom gom", "rubber"], wrong: ["mera mera", "hie hie", "yami yami"] },
  { q: "Quel studio a produit **Demon Slayer** (Kimetsu no Yaiba) ?", answers: ["ufotable"], wrong: ["mappa", "bones", "wit studio"] },
  { q: "Dans **Attack on Titan**, de quelle ville vient Eren Yeager ?", answers: ["shiganshina", "shinganshina"], wrong: ["trost", "stohess", "orvud"] },
  { q: "Quel est le nom du dragon de **Natsu** dans Fairy Tail ?", answers: ["igneel"], wrong: ["metalicana", "grandeeney", "weisslogia"] },
  { q: "Dans **Dragon Ball Z**, combien de boules de cristal faut-il rassembler ?", answers: ["7", "sept"], wrong: ["6", "8", "5"] },
  { q: "Quel personnage de **My Hero Academia** a comme Alter 'One For All' ?", answers: ["izuku midoriya", "midoriya", "deku"], wrong: ["bakugo", "todoroki", "all might"] },
  { q: "Dans **Bleach**, quel est le type d'épée de Ichigo ?", answers: ["zanpakuto", "zanpakutō"], wrong: ["katana", "nodachi", "wakizashi"] },
  { q: "Quel anime se passe dans la ville de **Hinamizawa** ?", answers: ["higurashi", "higurashi no naku koro ni", "when they cry"], wrong: ["another", "tokyo ghoul", "elfen lied"] },
  { q: "Dans **Hunter x Hunter**, qu'est-ce que le **Nen** ?", answers: ["énergie vitale", "energie", "aura", "chi"], wrong: ["magie", "chakra", "ki"] },
  { q: "Quel est le nom de l'académie dans **My Hero Academia** ?", answers: ["yuei", "u.a.", "ua", "u.a. high school"], wrong: ["shiketsu", "ketsubutsu", "seiai"] },
  { q: "Dans **Sword Art Online**, comment s'appelle le monde virtuel du premier arc ?", answers: ["aincrad", "sword art online"], wrong: ["alfheim", "ggo", "alicization"] },
  { q: "Qui est le capitaine de l'équipe de volley dans **Haikyuu** (Karasuno) ?", answers: ["daichi sawamura", "daichi"], wrong: ["hinata", "kageyama", "tsukishima"] },
  { q: "Dans **Fullmetal Alchemist**, qu'est-ce que la **Loi d'équivalence** ?", answers: ["équivalence", "échange équivalent", "pour obtenir quelque chose il faut sacrifier quelque chose"], wrong: ["alchimie pure", "transmutation", "pierre philosophale"] },
  { q: "Quel est le vrai nom de **Tanjiro** dans Demon Slayer ?", answers: ["kamado tanjiro", "tanjiro kamado", "tanjiro"], wrong: ["zenitsu", "inosuke", "giyu"] },
  { q: "Dans **Tokyo Ghoul**, quel est le surnom de Kaneki Ken ?", answers: ["le goule au masque blanc", "eyepatch", "bandage", "le borgne"], wrong: ["jason", "owl", "black reaper"] },
  { q: "Quel personnage dit la célèbre phrase **'Je suis le plus fort'** dans One Punch Man ?", answers: ["saitama"], wrong: ["genos", "bang", "king"] },
  { q: "Dans **Jujutsu Kaisen**, quel est le nom du professeur de Yuji ?", answers: ["gojo satoru", "gojo", "satoru"], wrong: ["nanami", "megumi", "sukuna"] },
  { q: "Dans **Spy x Family**, quel est le vrai nom de l'espion Loid Forger ?", answers: ["twilight", "le crépuscule"], wrong: ["night owl", "dawn", "dusk"] },
];

// ── Poster le quiz du jour ────────────────────────────────────────────────
async function postDailyQuiz(client, cfg) {
  if (!cfg.animeChannelId) return;

  const db      = loadQuizDB();
  const today   = new Date().toDateString();

  if (db.lastQuizDate === today) return; // Déjà posté aujourd'hui

  const channel = await client.channels.fetch(cfg.animeChannelId).catch(() => null);
  if (!channel) return;

  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

  db.lastQuizDate    = today;
  db.todayAnswered   = {};
  db.todayQuestion   = q;
  db.todayWinner     = null;
  saveQuizDB(db);

  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle("🎌 Quiz Anime du Jour !")
    .setDescription(`${q.q}\n\n📝 **Réponds en tapant ta réponse dans le chat !**\n⚡ Premier qui répond juste gagne **+50 XP bonus** !`)
    .setFooter({ text: "Quiz quotidien • 1 seule tentative par personne" })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  console.log("[QUIZ] Question du jour postée !");
}

// ── Vérifier les réponses dans le chat ───────────────────────────────────
async function checkQuizAnswer(message, addXPCallback) {
  const db = loadQuizDB();
  if (!db.todayQuestion || db.todayWinner) return false;
  if (db.todayAnswered[message.author.id]) return false;

  const today = new Date().toDateString();
  if (db.lastQuizDate !== today) return false;

  const userAnswer = message.content.toLowerCase().trim();
  const correct    = db.todayQuestion.answers.some(a => userAnswer.includes(a.toLowerCase()));

  db.todayAnswered[message.author.id] = true;

  if (correct) {
    db.todayWinner = message.author.id;
    saveQuizDB(db);

    // Ajouter 50 XP bonus
    if (addXPCallback) addXPCallback(message.author.id, 50);

    // Mettre à jour le score
    db.scores[message.author.id] = (db.scores[message.author.id] || 0) + 1;
    saveQuizDB(db);

    await message.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x00FF88)
        .setTitle("🎉 BONNE RÉPONSE !")
        .setDescription(`<@${message.author.id}> a trouvé la bonne réponse !\n\n✅ **+50 XP bonus** remporté !\n\n*La réponse était : **${db.todayQuestion.answers[0]}***`)
      ]
    });

    // Vérifier les rôles otaku
    await checkOtakuRoles(message.member, db.scores[message.author.id], message.guild);

    return true;
  } else {
    saveQuizDB(db);
    await message.react("❌").catch(() => {});
    return false;
  }
}

// ── Vérifier et attribuer les rôles otaku ────────────────────────────────
async function checkOtakuRoles(member, score, guild) {
  const roles = [
    { name: "🎌 Weeb Débutant",     min: 1  },
    { name: "⚔️ Otaku Confirmé",    min: 5  },
    { name: "👑 Senpai Suprême",    min: 20 },
    { name: "🐉 Sensei Légendaire", min: 50 },
  ];

  for (const roleInfo of roles) {
    if (score >= roleInfo.min) {
      let role = guild.roles.cache.find(r => r.name === roleInfo.name);
      if (!role) {
        role = await guild.roles.create({ name: roleInfo.name, reason: "Rôle Otaku automatique" }).catch(() => null);
      }
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
        await member.send(`🎌 Tu as débloqué le rôle **${roleInfo.name}** grâce au quiz anime ! Félicitations !`).catch(() => {});
      }
    }
  }
}

// ── Commande /quiz ────────────────────────────────────────────────────────
const quizCommandDef = new SlashCommandBuilder()
  .setName("quiz")
  .setDescription("🎌 Quiz Anime")
  .addSubcommand(s => s
    .setName("classement")
    .setDescription("🏆 Voir le classement des meilleurs au quiz"))
  .addSubcommand(s => s
    .setName("moi")
    .setDescription("📊 Voir mon score au quiz"))
  .addSubcommand(s => s
    .setName("forcer")
    .setDescription("🔄 [ADMIN] Forcer le quiz maintenant"))
  .toJSON();

async function handleQuizCommand(interaction, cfg) {
  const sub = interaction.options.getSubcommand();

  if (sub === "classement") {
    const db     = loadQuizDB();
    const sorted = Object.entries(db.scores).sort((a, b) => b[1] - a[1]).slice(0, 10);

    if (!sorted.length) return interaction.reply({ content: "Aucun score encore !", ephemeral: true });

    const medals = ["🥇", "🥈", "🥉"];
    const lines  = sorted.map(([id, score], i) =>
      `${medals[i] || `\`#${i+1}\``} <@${id}> — **${score}** bonne(s) réponse(s)`
    );

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("🎌 Classement Quiz Anime")
      .setDescription(lines.join("\n"))
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === "moi") {
    const db    = loadQuizDB();
    const score = db.scores[interaction.user.id] || 0;

    const rang = Object.entries(db.scores)
      .sort((a, b) => b[1] - a[1])
      .findIndex(([id]) => id === interaction.user.id) + 1;

    const nextRole = score < 1 ? "🎌 Weeb Débutant (1 réponse)" :
                     score < 5 ? "⚔️ Otaku Confirmé (5 réponses)" :
                     score < 20 ? "👑 Senpai Suprême (20 réponses)" :
                     score < 50 ? "🐉 Sensei Légendaire (50 réponses)" : "Tu as tous les rôles ! 🏆";

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle("📊 Mes Stats Quiz Anime")
      .addFields(
        { name: "✅ Bonnes réponses", value: `**${score}**`, inline: true },
        { name: "🏆 Rang", value: rang > 0 ? `**#${rang}**` : "*Non classé*", inline: true },
        { name: "🎯 Prochain rôle", value: nextRole, inline: false },
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "forcer") {
    await interaction.deferReply({ ephemeral: true });
    const db = loadQuizDB();
    db.lastQuizDate = null; // Reset pour forcer
    saveQuizDB(db);
    await postDailyQuiz(interaction.client, cfg);
    return interaction.editReply({ content: "✅ Quiz posté !" });
  }
}

module.exports = { quizCommandDef, handleQuizCommand, postDailyQuiz, checkQuizAnswer };
