// Boxer creator: preset options, the saved player, and the ◀ value ▶ option rows (hand-cursor friendly).

const STORAGE_KEY = 'povboxing.player.v1';

const SKINS = ['#f6d3b8', '#eabd98', '#d29a6e', '#a8704a', '#7a4a2c', '#4e2f1c'];
const HAIR_COLORS = ['#141010', '#3a2416', '#6b4423', '#c99a4b', '#a8401f', '#9a9a9a', '#e8e8e8'];
const KIT = ['#d8352a', '#2f6fe0', '#1c1c22', '#f2f2f2', '#2f9e4a', '#e2b33c', '#7b3fc4', '#e46aa0', '#f07a1a', '#18a6b8'];

// Each option: key in the player record, label, list of values, and how to display a value.
// Original ring nicknames (no real boxers' names)
export const NICKNAMES = ['The Spark', 'Cyclone', 'Haymaker', 'Bulldozer', 'The Comet', 'Thunderclap', 'Wildcard', 'Firecracker', 'Blitz', 'The Rookie', 'Neon', 'Afterburner'];

export const OPTIONS = [
  { group: 'LOOK', key: 'skin', label: 'Skin', values: SKINS, swatch: true },
  { group: 'LOOK', key: 'faceShape', label: 'Face', values: ['round', 'oval', 'wide', 'long'] },
  { group: 'LOOK', key: 'hair', label: 'Hair', values: ['short', 'buzz', 'bald', 'mohawk', 'twists', 'afro', 'curly'] },
  { group: 'LOOK', key: 'hairColor', label: 'Hair color', values: HAIR_COLORS, swatch: true },
  { group: 'LOOK', key: 'brows', label: 'Eyebrows', values: ['normal', 'thick', 'thin'] },
  { group: 'LOOK', key: 'beard', label: 'Facial hair', values: ['none', 'stubble', 'goatee', 'short', 'full'] },
  { group: 'LOOK', key: 'build', label: 'Build', values: ['middle', 'light', 'heavy'] },
  { group: 'GEAR', key: 'trunks', label: 'Trunks', values: KIT, swatch: true },
  { group: 'GEAR', key: 'gloves', label: 'Gloves', values: KIT, swatch: true },
  { group: 'GEAR', key: 'robe', label: 'Robe', values: KIT, swatch: true },
  { group: 'NAME', key: 'first', label: 'Name', values: ['Kid', 'Tommy', 'Leo', 'Max', 'Sam', 'Ray', 'Eli', 'Noa', 'Dani', 'Alex', 'Jules', 'Rio'] },
  { group: 'NAME', key: 'nick', label: 'Nickname', values: NICKNAMES },
  { group: 'NAME', key: 'last', label: 'Last name', values: ['Cohen', 'Silva', 'Park', 'Moreno', 'Walker', 'Novak', 'Levi', 'Okoro', 'Brooks', 'Sato', 'Rossi', 'Haddad'] },
];

const BUILDS = { light: { width: 0.92, belly: 0.9 }, middle: { width: 1.0, belly: 1.0 }, heavy: { width: 1.15, belly: 1.12 } };

export function defaultPlayer() {
  return {
    skin: SKINS[2], faceShape: 'round', hair: 'short', hairColor: HAIR_COLORS[1], brows: 'normal', beard: 'none', build: 'middle',
    trunks: KIT[0], gloves: KIT[0], robe: KIT[0], first: 'Kid', nick: 'The Spark', last: 'Cohen',
  };
}

export function randomPlayer() {
  const p = {};
  for (const o of OPTIONS) p[o.key] = o.values[Math.floor(Math.random() * o.values.length)];
  return p;
}

export function loadPlayer() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!p || !p.skin) return null;
    // Saves from older versions may use a nickname that was removed: swap it for a current one
    if (!NICKNAMES.includes(p.nick)) p.nick = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
    return { ...defaultPlayer(), ...p };
  } catch {
    return null;
  }
}

export function savePlayer(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

// Player record → the `look` the Boxer rig understands.
export function toLook(p) {
  const light = ['#f2f2f2', '#e2b33c'].includes(p.trunks);
  return {
    skin: p.skin, faceShape: p.faceShape, brows: p.brows,
    hair: p.hair, hairColor: p.hairColor, beard: p.beard, beardColor: p.hairColor,
    trunks: p.trunks, trim: light ? '#1c1c22' : '#f2f2f2', gloves: p.gloves, shoes: p.trunks, robe: p.robe,
    height: 1, ...BUILDS[p.build],
  };
}

export const fullName = (p) => `${p.first} "${p.nick}" ${p.last}`;

// Builds the option rows into the two panels; calls onChange(player, key) after every change.
export function buildCreatorUI({ left, right, player, onChange }) {
  left.innerHTML = '';
  right.innerHTML = '';
  let group = null;
  for (const o of OPTIONS) {
    const panel = o.group === 'LOOK' ? left : right;
    if (o.group !== group) {
      group = o.group;
      const h = document.createElement('div');
      h.className = 'opt-group';
      h.textContent = group;
      panel.appendChild(h);
    }
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.innerHTML = `<label>${o.label}</label>
      <div class="opt-ctrl">
        <button class="opt-arrow" data-hand data-dir="-1">◀</button>
        <span class="opt-value"></span>
        <button class="opt-arrow" data-hand data-dir="1">▶</button>
      </div>`;
    const value = row.querySelector('.opt-value');
    const render = () => {
      const v = player[o.key];
      value.innerHTML = o.swatch ? `<i class="swatch" style="background:${v}"></i>` : cap(v);
    };
    row.querySelectorAll('.opt-arrow').forEach((b) =>
      b.addEventListener('click', () => {
        const i = o.values.indexOf(player[o.key]);
        player[o.key] = o.values[(i + Number(b.dataset.dir) + o.values.length) % o.values.length];
        render();
        onChange(player, o.key);
      })
    );
    render();
    panel.appendChild(row);
  }
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
