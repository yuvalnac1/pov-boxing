// The career: 5 fights, each with a venue and an opponent.
// `look` drives the procedural 3D boxer, `ai` drives the fight logic (see fight.js).
//
// Attack fields: windup (s, the tell), damage, weight (how often it's picked),
// combo (extra quick strikes after the first), feint (wind-up that never lands).
// AI: maxKnockdowns = the knockdown that finishes him (KO), footwork = how much he moves around the ring / dances out of range, counterChance = fires back off a block.

export const CAREER = [
  {
    id: 'basement',
    venue: 'basement',
    venueName: 'The Basement Gym',
    headline: 'Nobody saw it coming: {nick} flattens Rusty Vega in a basement brawl!',
    opponent: {
      name: 'Rusty Vega',
      nickname: 'Rusty',
      tagline: 'Out-of-shape veteran. Slow, but still has a punch.',
      tip: 'Rusty telegraphs everything. When he pulls back a fist, show the palm on that side (his right → your left), then punch while he is dizzy!',
      look: {
        skin: '#e8b48f', trunks: '#1c2340', trim: '#d9a521', gloves: '#2a2f55', shoes: '#1a1a22',
        hair: 'bald', hairColor: '#cfcfcf', beard: 'stubble', beardColor: '#9a9a9a',
        height: 0.98, width: 1.05, belly: 1.25,
      },
      ai: {
        hp: 95, idle: [1.1, 1.9], maxKnockdowns: 2, blockChance: 0.12, interruptChance: 0.6, spamLimit: 4, footwork: 0.35, counterChance: 0.15,
        attacks: [
          { type: 'jab', windup: 0.65, damage: 10, weight: 2 },
          { type: 'hook', windup: 0.75, damage: 14, weight: 1 },
        ],
      },
    },
  },
  {
    id: 'club',
    venue: 'club',
    venueName: 'Suburban Boxing Club',
    headline: 'Two-Step stopped cold! {nick} is the talk of the suburbs.',
    opponent: {
      name: 'Danny Okafor',
      nickname: 'Two-Step',
      tagline: 'Speedy amateur who loves the double jab.',
      tip: 'Two-Step dances out of reach. Lean in toward the camera to catch him, or lean sideways to slip his jabs.',
      look: {
        skin: '#7a4a2c', trunks: '#2f9e4a', trim: '#f2f2f2', gloves: '#2f9e4a', shoes: '#2f9e4a',
        hair: 'twists', hairColor: '#1a1210', beard: 'goatee', beardColor: '#1a1210',
        height: 1.0, width: 0.92, belly: 0.9,
      },
      ai: {
        hp: 105, idle: [0.9, 1.5], maxKnockdowns: 3, blockChance: 0.18, interruptChance: 0.5, spamLimit: 4, footwork: 0.9, counterChance: 0.3,
        attacks: [
          { type: 'jab', windup: 0.5, damage: 9, weight: 2 },
          { type: 'jab', windup: 0.52, damage: 8, weight: 2, combo: 1 },
          { type: 'hook', windup: 0.6, damage: 13, weight: 1 },
        ],
      },
    },
  },
  {
    id: 'regional',
    venue: 'regional',
    venueName: 'Regional Championship',
    headline: 'The Wall comes down! {nick} takes the Regional title.',
    opponent: {
      name: 'Ivan Petrov',
      nickname: 'The Wall',
      tagline: 'Huge, patient, and blocks almost everything.',
      tip: "The Wall guards his head. Punch low to the body to go under it and slow him down. Parry his uppercut!",
      look: {
        skin: '#8a5a3b', trunks: '#18181c', trim: '#e0b030', gloves: '#202024', shoes: '#18181c',
        hair: 'bald', hairColor: '#111', beard: 'full', beardColor: '#1b1410',
        height: 1.08, width: 1.22, belly: 1.05,
      },
      ai: {
        hp: 145, idle: [1.0, 1.7], maxKnockdowns: 3, blockChance: 0.65, interruptChance: 0.15, spamLimit: 3, footwork: 0.35, counterChance: 0.45,
        attacks: [
          { type: 'jab', windup: 0.58, damage: 11, weight: 2 },
          { type: 'hook', windup: 0.65, damage: 16, weight: 1 },
          { type: 'uppercut', windup: 0.72, damage: 18, weight: 1 },
        ],
      },
    },
  },
  {
    id: 'national',
    venue: 'national',
    venueName: 'National Championship',
    headline: 'El Toro tamed! {nick} is the new national champion.',
    opponent: {
      name: 'Marco Ruiz',
      nickname: 'El Toro',
      tagline: 'Aggressive brawler. Watch out for the charging hook.',
      tip: "When El Toro's whole body glows, the charging hook is coming. Parry it for a huge opening!",
      look: {
        skin: '#d29a6e', trunks: '#c41f1f', trim: '#7a0f0f', gloves: '#c41f1f', shoes: '#c41f1f',
        hair: 'mohawk', hairColor: '#3a2416', beard: 'none', beardColor: '#3a2416',
        height: 1.0, width: 1.15, belly: 1.0,
      },
      ai: {
        hp: 130, idle: [0.6, 1.2], maxKnockdowns: 4, blockChance: 0.22, interruptChance: 0.3, spamLimit: 3, footwork: 1.0, counterChance: 0.35,
        attacks: [
          { type: 'jab', windup: 0.45, damage: 10, weight: 3, combo: 1 },
          { type: 'hook', windup: 0.5, damage: 15, weight: 2 },
          { type: 'uppercut', windup: 0.55, damage: 17, weight: 1 },
          { type: 'hook', windup: 0.85, damage: 28, weight: 1, signature: true },
        ],
      },
    },
  },
  {
    id: 'title',
    venue: 'title',
    venueName: 'World Title — Grand Arena, Las Vegas',
    headline: 'NEW WORLD CHAMPION! From a basement gym to the top of the world.',
    opponent: {
      name: 'Jordan Hayes',
      nickname: 'King',
      tagline: 'The champion. Fast, smart, and he fakes you out.',
      tip: "The King fakes some wind-ups. Wait until the glow is bright before you parry.",
      look: {
        skin: '#5c3a24', trunks: '#f4f1ea', trim: '#d4a72c', gloves: '#d4a72c', shoes: '#f4f1ea',
        hair: 'short', hairColor: '#120c08', beard: 'short', beardColor: '#120c08',
        height: 1.06, width: 1.12, belly: 0.95,
      },
      ai: {
        hp: 150, idle: [0.45, 0.95], maxKnockdowns: 4, blockChance: 0.35, interruptChance: 0.2, spamLimit: 3, footwork: 1.2, counterChance: 0.5,
        attacks: [
          { type: 'jab', windup: 0.42, damage: 10, weight: 3, combo: 2 },
          { type: 'hook', windup: 0.45, damage: 15, weight: 2 },
          { type: 'uppercut', windup: 0.5, damage: 19, weight: 2 },
          { type: 'jab', windup: 0.42, damage: 0, weight: 1, feint: true },
        ],
      },
    },
  },
];
