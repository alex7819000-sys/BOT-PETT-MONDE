'use strict';
const axios = require('axios');
// src/config/constants.js — Toutes les constantes centralisées
'use strict';

const XP = {
  PER_MESSAGE:  () => parseInt(process.env.XP_PER_MESSAGE    || '15'),
  COOLDOWN_MS:  () => parseInt(process.env.XP_COOLDOWN_SECONDS || '60') * 1000,

  // ── Bumps ── récompenses fortes pour inciter à bumper tous les jours
  BUMP_BONUS:        250,   // était 100 — un bump = 17 messages, ça vaut le coup
  BUMP_STREAK_3:     100,   // bonus si 3 bumps consécutifs (même user, même jour)
  BUMP_STREAK_7:     300,   // bonus si 7 bumps dans la semaine
  BUMP_KAKERA:       150,   // kakera Mudae offerts en plus de l'XP

  // ── Invites ── récompenses massives, c'est la clé de la croissance
  INVITE_BONUS:      300,   // était 50 — inviter = 20 messages, c'est rare et précieux
  INVITE_KAKERA:     500,   // kakera Mudae pour chaque invite réussie
  INVITE_MILESTONE_5:  500, // bonus quand tu atteins 5 invites totales
  INVITE_MILESTONE_10: 1000,// bonus quand tu atteins 10 invites totales
  INVITE_MILESTONE_25: 2500,// bonus quand tu atteins 25 invites totales

  // ── Autres ──
  QUIZ_BONUS:   50,
  SINGE_MALUS:  100,
  GUILD_BONUS_MULTIPLIER: 2,     // x2 pour la guilde dominante (24h)
  GUILD_CREATE_LEVEL: 10,        // Niveau requis pour créer une guilde
};

const CROWN = {
  HOUR: () => parseInt(process.env.CROWN_HOUR || '20'),
};

const SMASH = {
  ANIME_INTERVAL:   () => parseInt(process.env.ANIME_INTERVAL_HOURS   || '24'),
  ANIMALS_INTERVAL: () => parseInt(process.env.ANIMALS_INTERVAL_HOURS || '4'),
  MODES: ['anime-auto', 'anime-community', 'animals-auto', 'animals-community', 'face-reveal'],
};

const SINGE = {
  FAULT_SHAME_THRESHOLD:   2,
  FAULT_PING_THRESHOLD:    3,
  FAULT_XP_THRESHOLD:      5,
  FAULT_TIMEOUT_THRESHOLD: 10,
  TIMEOUT_DURATION_MS:     60 * 60 * 1000, // 1h
};

const GUILDES = {
  MAX: 5,
  DUEL_DURATION_DAYS: 7,
  MIN_MEMBERS_ACTIVE: 3,
  INACTIVE_WEEKS: 2,
};

const COLORS = {
  GOLD:    0xFFD700,
  PURPLE:  0x7C4DFF,
  TEAL:    0x00BFA5,
  RED:     0xFF5252,
  BLUE:    0x2196F3,
  GREEN:   0x4CAF50,
  PINK:    0xFF69B4,
  ORANGE:  0xFF9800,
  GRAY:    0x9E9E9E,
  DARK:    0x2C2F33,
};

const EMOJIS = {
  KING:    '👑',
  SINGE:   '🐒',
  COUPLE:  '💑',
  DOG:     '🐶',
  CAT:     '🐱',
  GUILD:   '🏰',
  XP:      '⚡',
  SMASH:   '💚',
  PASS:    '💔',
  STAR:    '⭐',
  ANIME:   '🎌',
  PRISON:  '🔒',
  SECRET:  '🤫',
  BUMP:    '🚀',
  WIN:     '🏆',
};

// Animal APIs gratuites
const ANIMAL_APIS = {
  dog:      () => axios.get('https://dog.ceo/api/breeds/image/random', {timeout:8000}).then(r => ({ image: r.data.message, name: 'Chien', emoji: '🐶' })),
  cat:      () => axios.get('https://api.thecatapi.com/v1/images/search', {timeout:8000}).then(r => ({ image: r.data[0].url, name: 'Chat', emoji: '🐱' })),
  fox:      () => axios.get('https://randomfox.ca/floof/', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Renard', emoji: '🦊' })),
  panda:    () => axios.get('https://some-random-api.com/animal/panda', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Panda', emoji: '🐼' })),
  koala:    () => axios.get('https://some-random-api.com/animal/koala', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Koala', emoji: '🐨' })),
  bird:     () => axios.get('https://some-random-api.com/animal/bird', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Oiseau', emoji: '🐦' })),
  kangaroo: () => axios.get('https://some-random-api.com/animal/kangaroo', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Kangourou', emoji: '🦘' })),
  raccoon:  () => axios.get('https://some-random-api.com/animal/racoon', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Raton laveur', emoji: '🦝' })),
  rabbit:   () => axios.get('https://some-random-api.com/animal/rabbit', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Lapin', emoji: '🐰' })),
  turtle:   () => axios.get('https://some-random-api.com/animal/red_panda', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Tortue', emoji: '🐢' })),
  snake:    () => axios.get('https://some-random-api.com/animal/fox', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Serpent', emoji: '🐍' })),
  hamster:  () => axios.get('https://some-random-api.com/animal/raccoon', {timeout:8000}).then(r => ({ image: r.data.image, name: 'Hamster', emoji: '🐹' })),
};

const ANIMAL_KEYS = Object.keys(ANIMAL_APIS);

// Mots déclencheurs — 2 modes :
// - SOUND : mots sonores (woaf, miaou) → toujours déclenché
// - MENTION : noms d'animaux → seulement en fin de phrase (ownership context)
const TRIGGERS_SOUND = {
  dog:    ['woaf', 'woof', 'wouf', 'ouaf', '🐶', 'bark'],
  cat:    ['miaou', 'meow', 'miao', '🐱', 'miaw'],
  fox:    ['🦊'],
  panda:  ['🐼'],
  koala:  ['🐨'],
  bird:   ['🐦'],
  rabbit: ['🐰'],
};

// Noms d'animaux détectés EN FIN DE PHRASE (genre "j'ai un chien", "ma tortue")
// Regex : mot présent suivi d'optionnel ponctuation/fin
const TRIGGERS_MENTION = {
  dog:       /(chien|chienne|doggo|dog|toutou)\s*[.!?🐶]*\s*$/i,
  cat:       /(chat|chatte|kitty|minou|minet|félin)\s*[.!?🐱]*\s*$/i,
  fox:       /(renard|renarde|fox)\s*[.!?🦊]*\s*$/i,
  panda:     /(panda)\s*[.!?🐼]*\s*$/i,
  koala:     /(koala)\s*[.!?🐨]*\s*$/i,
  bird:      /(oiseau|perroquet|perruche|canari|bird|piaf)\s*[.!?🐦]*\s*$/i,
  rabbit:    /(lapin|lapine|rabbit|bunny|coco)\s*[.!?🐰]*\s*$/i,
  kangaroo:  /(kangourou|kangaroo)\s*[.!?🦘]*\s*$/i,
  raccoon:   /(raton\s*laveur|raccoon|ratons)\s*[.!?🦝]*\s*$/i,
  turtle:    /(tortue|turtle|tortoise)\s*[.!?🐢]*\s*$/i,
  snake:     /(serpent|snake|couleuvre|vipère)\s*[.!?🐍]*\s*$/i,
  hamster:   /(hamster|cochon\s*d.inde|cobaye)\s*[.!?🐹]*\s*$/i,
};

// Utilisé dans handleAnimalTrigger — sons ET noms d'animaux
const TRIGGERS = {
  dog:      ['woaf', 'woof', 'wouf', 'ouaf', '🐶', 'bark', 'chien', 'chienne', 'toutou', 'doggo'],
  cat:      ['miaou', 'meow', 'miao', '🐱', 'miaw', 'chat', 'chatte', 'minou', 'kitty'],
  fox:      ['🦊', 'renard'],
  panda:    ['🐼', 'panda'],
  koala:    ['🐨', 'koala'],
  bird:     ['🐦', 'oiseau', 'perroquet'],
  rabbit:   ['🐰', 'lapin'],
  kangaroo: ['🦘', 'kangourou'],
  raccoon:  ['🦝', 'raton'],
  turtle:   ['🐢', 'tortue'],
  snake:    ['🐍', 'serpent'],
  hamster:  ['🐹', 'hamster'],
};

module.exports = { XP, CROWN, SMASH, SINGE, GUILDES, COLORS, EMOJIS, ANIMAL_APIS, ANIMAL_KEYS, TRIGGERS, TRIGGERS_SOUND, TRIGGERS_MENTION };
