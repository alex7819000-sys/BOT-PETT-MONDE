// src/config/constants.js — Toutes les constantes centralisées
'use strict';

const XP = {
  PER_MESSAGE:  () => parseInt(process.env.XP_PER_MESSAGE    || '15'),
  COOLDOWN_MS:  () => parseInt(process.env.XP_COOLDOWN_SECONDS || '60') * 1000,
  BUMP_BONUS:   100,
  QUIZ_BONUS:   50,
  SINGE_MALUS:  100,
  GUILD_BONUS_MULTIPLIER: 2,     // x2 pour la guilde dominante (24h)
  GUILD_CREATE_LEVEL: 10,        // Niveau requis pour créer une guilde
};

const CROWN = {
  HOUR: () => parseInt(process.env.CROWN_HOUR || '20'),
};

const SMASH = {
  ANIME_INTERVAL:   () => parseInt(process.env.ANIME_INTERVAL_HOURS   || '6'),
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
  dog:      () => fetch('https://dog.ceo/api/breeds/image/random').then(r => r.json()).then(d => ({ image: d.message, name: 'Chien', emoji: '🐶' })),
  cat:      () => fetch('https://api.thecatapi.com/v1/images/search').then(r => r.json()).then(d => ({ image: d[0].url, name: 'Chat', emoji: '🐱' })),
  fox:      () => fetch('https://randomfox.ca/floof/').then(r => r.json()).then(d => ({ image: d.image, name: 'Renard', emoji: '🦊' })),
  panda:    () => fetch('https://some-random-api.com/animal/panda').then(r => r.json()).then(d => ({ image: d.image, name: 'Panda', emoji: '🐼' })),
  koala:    () => fetch('https://some-random-api.com/animal/koala').then(r => r.json()).then(d => ({ image: d.image, name: 'Koala', emoji: '🐨' })),
  bird:     () => fetch('https://some-random-api.com/animal/bird').then(r => r.json()).then(d => ({ image: d.image, name: 'Oiseau', emoji: '🐦' })),
  kangaroo: () => fetch('https://some-random-api.com/animal/kangaroo').then(r => r.json()).then(d => ({ image: d.image, name: 'Kangourou', emoji: '🦘' })),
  raccoon:  () => fetch('https://some-random-api.com/animal/racoon').then(r => r.json()).then(d => ({ image: d.image, name: 'Raton laveur', emoji: '🦝' })),
  rabbit:   () => fetch('https://some-random-api.com/animal/rabbit').then(r => r.json()).then(d => ({ image: d.image, name: 'Lapin', emoji: '🐰' })),
};

const ANIMAL_KEYS = Object.keys(ANIMAL_APIS);

// Mots déclencheurs pour la détection de messages
const TRIGGERS = {
  dog: ['woaf', 'woof', 'wouf', 'ouaf', 'chien', 'doggo', '🐶', 'dog', 'bark'],
  cat: ['miaou', 'meow', 'miao', 'chat', 'kitty', '🐱', 'cat', 'miaw'],
  fox: ['renard', 'fox', '🦊'],
  panda: ['panda', '🐼'],
  koala: ['koala', '🐨'],
  bird: ['oiseau', 'piaf', '🐦', 'bird'],
  rabbit: ['lapin', 'rabbit', 'bunny', '🐰'],
};

module.exports = { XP, CROWN, SMASH, SINGE, GUILDES, COLORS, EMOJIS, ANIMAL_APIS, ANIMAL_KEYS, TRIGGERS };
