// Dungeon RPG OD — idle dungeon crawler (inspired by "Dungeon Crawler RPG OD")
import { openModal, isModalOpen, closeAllModals, toast, esc, confirmBox, copyText } from './ui.js';
import { openGuild } from './guild.js';

/* ======================= CONFIG ======================= */
const SAVE_KEY = 'dro_save_v1';
const ROOMS_PER_FLOOR = 5;
const MAX_EQUIP = 6;
const MAX_INV = 60;
const BASE = { hp: 300, atk: 50, def: 20, atkSpd: 0.6, vamp: 0, critRate: 5, critDmg: 50 };

const STATS = {
  hp: { label: 'HP', icon: '❤️' },
  atk: { label: 'ATK', icon: '⚔️' },
  def: { label: 'DEF', icon: '🛡️' },
  atkSpd: { label: 'ATK.SPD', icon: '⚡', pct: true },
  vamp: { label: 'VAMP', icon: '🩸', pct: true },
  critRate: { label: 'C.RATE', icon: '🎯', pct: true },
  critDmg: { label: 'C.DMG', icon: '💥', pct: true },
};
const STAT_KEYS = Object.keys(STATS);

const LEVEL_OPTS = [
  { stat: 'hp', val: 10 }, { stat: 'atk', val: 8 }, { stat: 'def', val: 8 }, { stat: 'atkSpd', val: 4 },
  { stat: 'vamp', val: 1 }, { stat: 'critRate', val: 1.5 }, { stat: 'critDmg', val: 8 },
];

const RARITIES = [
  { key: 'Common', w: 50, mult: 1, lines: 1 },
  { key: 'Uncommon', w: 28, mult: 1.15, lines: 2 },
  { key: 'Rare', w: 13, mult: 1.3, lines: 3 },
  { key: 'Epic', w: 6.5, mult: 1.5, lines: 4 },
  { key: 'Legendary', w: 2.2, mult: 1.8, lines: 5 },
  { key: 'Heirloom', w: 0.3, mult: 2.3, lines: 6 },
];

const ITEM_TYPES = [
  { type: 'Sword', icon: '⚔️', main: 'atk' }, { type: 'Axe', icon: '🪓', main: 'atk' },
  { type: 'Dagger', icon: '🗡️', main: 'critRate' }, { type: 'Bow', icon: '🏹', main: 'atkSpd' },
  { type: 'Staff', icon: '🪄', main: 'critDmg' }, { type: 'Shield', icon: '🛡️', main: 'def' },
  { type: 'Helmet', icon: '⛑️', main: 'hp' }, { type: 'Armor', icon: '🥋', main: 'hp' },
  { type: 'Gauntlets', icon: '🧤', main: 'def' }, { type: 'Boots', icon: '👢', main: 'atkSpd' },
  { type: 'Ring', icon: '💍', main: 'critDmg' }, { type: 'Amulet', icon: '📿', main: 'vamp' },
];

// tier order: index decides which floors they show up on
const ENEMIES = [
  { name: 'Giant Rat', icon: '🐀', hp: 0.8, atk: 0.9, spd: 0.9 },
  { name: 'Goblin', icon: '👺' },
  { name: 'Bat', icon: '🦇', hp: 0.7, spd: 1.1, vamp: 10 },
  { name: 'Slime', icon: '🫧', hp: 1.35, atk: 0.8, spd: 0.5 },
  { name: 'Wolf', icon: '🐺', atk: 1.1, spd: 0.85 },
  { name: 'Skeleton', icon: '💀', def: 1.3 },
  { name: 'Spider', icon: '🕷️', spd: 0.95, atk: 0.9 },
  { name: 'Zombie', icon: '🧟', hp: 1.4, spd: 0.45 },
  { name: 'Orc', icon: '👹', hp: 1.2, atk: 1.15 },
  { name: 'Ghost', icon: '👻', def: 0.5, atk: 1.2 },
  { name: 'Dark Mage', icon: '🧙', atk: 1.35, hp: 0.8 },
  { name: 'Golem', icon: '🗿', hp: 1.6, def: 1.7, spd: 0.4 },
  { name: 'Vampire', icon: '🧛', vamp: 18, spd: 0.8 },
  { name: 'Lich', icon: '☠️', atk: 1.4, def: 1.2 },
  { name: 'Demon', icon: '😈', hp: 1.3, atk: 1.3 },
  { name: 'Wyvern', icon: '🐉', hp: 1.5, atk: 1.4, spd: 0.8 },
];
const BOSSES = [
  { name: 'Rat King', icon: '🐀' }, { name: 'Goblin Warlord', icon: '👺' }, { name: 'Bone Lord', icon: '💀' },
  { name: 'Spider Queen', icon: '🕷️' }, { name: 'Ogre Chieftain', icon: '👹' }, { name: 'Ancient Golem', icon: '🗿', def: 1.5 },
  { name: 'Vampire Count', icon: '🧛', vamp: 20 }, { name: 'Lich King', icon: '☠️', atk: 1.2 },
  { name: 'Demon Lord', icon: '😈', atk: 1.2, hp: 1.1 }, { name: 'Elder Dragon', icon: '🐉', hp: 1.3, atk: 1.3 },
];
const MIMIC = { name: 'Mimic', icon: '📦', hp: 1.2, atk: 1.25 };

const FLAVOR = [
  'Water drips somewhere in the dark.', 'You step over old bones.', 'A cold draft brushes your neck.',
  'Faint whispers echo, then fade.', 'Cobwebs cling to the walls.', 'The torchlight flickers.',
  'You find scratches on the wall… counting days.', 'An empty room. Suspiciously empty.',
];

/* ======================= UTILS ======================= */
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const r1 = (n) => Math.round(n * 10) / 10;
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => {
  n = Math.round(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e5) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
};
const fmtStat = (k, v) => (STATS[k].pct ? `${r1(v)}%` : fmt(v));
const fmtTime = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};
const optText = (o) => `+${o.val}% ${STATS[o.stat].label}`;
const expMax = (lv) => Math.round(100 * Math.pow(1.15, lv - 1));

/* ======================= STATE ======================= */
function newRun() {
  return {
    level: 1, exp: 0, bonus: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])), hp: null,
    floor: 1, room: 0, curse: 0, blessings: 0, kills: 0, time: 0, rerolls: 2, pendingLv: 0,
  };
}
function newState(name) {
  return {
    v: 1, name, gold: 0, inventory: [], equipped: [], run: newRun(),
    meta: { bestFloor: 1, deaths: 0, totalKills: 0, runs: 1 },
    settings: { autoPick: false, autoSellCommon: false, speed: 1, auto: false, autoTotem: false },
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 1 && s.run) {
      const d = newState(s.name);
      return { ...d, ...s, run: { ...d.run, ...s.run }, meta: { ...d.meta, ...s.meta }, settings: { ...d.settings, ...s.settings } };
    }
  } catch {}
  return null;
}
let S = load();
let lastSave = 0;
function save(force = false) {
  if (!S) return;
  const now = Date.now();
  if (!force && now - lastSave < 1500) return;
  lastSave = now;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch {}
}

function equipSum() {
  const t = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  for (const it of S.equipped) for (const l of it.stats) t[l.stat] += l.val;
  return t;
}
function stats() {
  const e = equipSum(), b = S.run.bonus;
  return {
    hp: Math.round((BASE.hp + e.hp) * (1 + b.hp / 100)),
    atk: Math.round((BASE.atk + e.atk) * (1 + b.atk / 100)),
    def: Math.round((BASE.def + e.def) * (1 + b.def / 100)),
    atkSpd: Math.min(3, BASE.atkSpd * (1 + (b.atkSpd + e.atkSpd) / 100)),
    vamp: Math.min(60, b.vamp + e.vamp),
    critRate: Math.min(100, BASE.critRate + b.critRate + e.critRate),
    critDmg: BASE.critDmg + b.critDmg + e.critDmg,
  };
}
function clampHp() {
  const max = stats().hp;
  if (S.run.hp == null || S.run.hp > max) S.run.hp = max;
}

/* ======================= ITEMS ======================= */
function rollRarity(boost = 0) {
  const ws = RARITIES.map((r, i) => r.w * Math.pow(1 + boost, i));
  let x = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return RARITIES[i]; }
  return RARITIES[0];
}
function rollStat(stat, tier, rm) {
  const tm = Math.pow(1.09, tier - 1);
  switch (stat) {
    case 'hp': return Math.round(rand(25, 50) * tm * rm);
    case 'atk': return Math.round(rand(5, 10) * tm * rm);
    case 'def': return Math.round(rand(3, 6) * tm * rm);
    case 'atkSpd': return r1(rand(1.5, 4) * rm);
    case 'vamp': return r1(rand(0.5, 1.5) * rm);
    case 'critRate': return r1(rand(1, 3) * rm);
    case 'critDmg': return r1(rand(4, 10) * rm);
  }
}
function makeItem(tier, boost = 0) {
  const t = pick(ITEM_TYPES);
  const r = rollRarity(boost);
  const lines = [{ stat: t.main, val: rollStat(t.main, tier, r.mult) }];
  while (lines.length < r.lines) {
    const st = pick(STAT_KEYS);
    const ex = lines.find((l) => l.stat === st);
    const v = rollStat(st, tier, r.mult);
    if (ex) ex.val = STATS[st].pct ? r1(ex.val + v * 0.5) : Math.round(ex.val + v * 0.5);
    else lines.push({ stat: st, val: v });
  }
  const value = Math.round(12 * Math.pow(1.09, tier - 1) * r.mult * r.lines);
  return { id: uid(), type: t.type, icon: t.icon, rarity: r.key, tier, stats: lines, value };
}
const itemName = (it) => `${it.rarity} ${it.type}`;
const itemTag = (it) => `<b class="rc r-${it.rarity}">${it.icon} ${itemName(it)}</b>`;

function addItem(it, source = '') {
  if (S.settings.autoSellCommon && it.rarity === 'Common') {
    S.gold += it.value;
    log(`${source}Found ${itemTag(it)} → auto-sold for 🪙${fmt(it.value)}`, 'loot');
    return;
  }
  if (S.inventory.length >= MAX_INV) {
    S.gold += it.value;
    log(`Bag full! ${itemTag(it)} sold for 🪙${fmt(it.value)}`, 'loot');
    return;
  }
  S.inventory.unshift(it);
  hasNewLoot = true;
  log(`${source}Found ${itemTag(it)} <span class="muted">T${it.tier}</span>`, 'loot');
  if (RARITIES.findIndex((r) => r.key === it.rarity) >= 3) toast(`✨ ${itemTag(it)}`, 'gold');
}

/* ======================= DOM ======================= */
const logEl = $('#log');
const stageEl = $('#stage');
let hasNewLoot = false;

function log(html, cls = '') {
  const li = document.createElement('li');
  li.className = cls;
  li.innerHTML = html;
  logEl.prepend(li);
  while (logEl.children.length > 80) logEl.lastChild.remove();
}

function renderChar() {
  const P = stats(), r = S.run;
  clampHp();
  $('#c-name').textContent = S.name;
  $('#c-level').textContent = `Lv. ${r.level}`;
  $('#c-hp-fill').style.width = `${(r.hp / P.hp) * 100}%`;
  $('#c-hp-text').textContent = `${fmt(r.hp)} / ${fmt(P.hp)}`;
  const em = expMax(r.level);
  $('#c-exp-fill').style.width = `${(r.exp / em) * 100}%`;
  $('#c-exp-text').textContent = `EXP ${fmt(r.exp)} / ${fmt(em)}`;
  $('#c-stats').innerHTML = STAT_KEYS.map((k) => {
    const v = k === 'atkSpd' ? P.atkSpd.toFixed(2) : k === 'hp' ? fmt(P.hp) : fmtStat(k, P[k]);
    return `<div class="stat"><span>${STATS[k].icon} ${STATS[k].label}</span><b>${v}</b></div>`;
  }).join('');
  const eq = $('#c-equip');
  eq.innerHTML = '';
  for (let i = 0; i < MAX_EQUIP; i++) {
    const it = S.equipped[i];
    const b = document.createElement('button');
    b.className = `slot ${it ? 'r-' + it.rarity : 'empty'}`;
    b.innerHTML = it ? `<span class="slot-ico">${it.icon}</span><span class="slot-tier">T${it.tier}</span>` : '<span class="slot-ico">＋</span>';
    b.title = it ? itemName(it) : 'Empty slot';
    b.onclick = () => (it ? openItem(it, true) : openInventory());
    eq.append(b);
  }
  $('#c-eq-count').textContent = `${S.equipped.length}/${MAX_EQUIP}`;
}

function renderTop() {
  const r = S.run;
  $('#t-floor').textContent = `Floor ${r.floor} · ${r.room > ROOMS_PER_FLOOR ? 'Stairs' : `Room ${Math.max(1, r.room)}/${ROOMS_PER_FLOOR}`}`;
  $('#t-gold').textContent = `🪙 ${fmt(S.gold)}`;
  const c = $('#t-curse');
  c.hidden = !r.curse;
  c.textContent = `🗿 Curse ${r.curse}`;
  $('#t-time').textContent = `⏱ ${fmtTime(r.time)}`;
  $('#c-kills').textContent = `${r.kills} kills`;
  $('#inv-dot').hidden = !hasNewLoot;
  const auto = S.settings.auto;
  const ab = $('#btn-auto');
  ab.textContent = auto ? '▶ Auto: ON' : '⏸ Auto: OFF';
  ab.classList.toggle('on', auto);
  $('#btn-speed').textContent = `${S.settings.speed}x`;
  $('#btn-explore').disabled = view.mode !== 'idle';
}
function updateHud() { renderChar(); renderTop(); }

/* ======================= STAGE / VIEW ======================= */
let view = { mode: 'idle' };
let battle = null;
let nextAuto = 0;

function renderStage() {
  const r = S.run;
  stageEl.className = `stage mode-${view.mode}`;
  if (view.mode === 'idle') {
    const pips = Array.from({ length: ROOMS_PER_FLOOR + 1 }, (_, i) =>
      `<i class="pip ${i < r.room ? 'done' : ''} ${i === ROOMS_PER_FLOOR ? 'boss' : ''}"></i>`).join('');
    stageEl.innerHTML = `
      <div class="torch l">🔥</div><div class="torch r">🔥</div>
      <div class="idle-view">
        <div class="floor-label">Floor</div>
        <div class="floor-num">${r.floor}</div>
        <div class="pips">${pips}</div>
        <p class="idle-hint">${S.settings.auto ? 'Exploring the depths…' : 'Press <b>Explore</b> to venture deeper.'}</p>
      </div>`;
  } else if (view.mode === 'event') {
    stageEl.innerHTML = `
      <div class="torch l">🔥</div><div class="torch r">🔥</div>
      <div class="event-card tone-${view.tone || 'neutral'}">
        <div class="event-icon">${view.icon}</div>
        <h3>${view.title}</h3>
        <p>${view.text || ''}</p>
        <div class="event-actions">${view.choices.map((c, i) =>
          `<button class="btn ${i === 0 ? 'btn-gold' : 'btn-ghost'}" data-i="${i}" ${c.disabled ? 'disabled' : ''}>${c.label}</button>`).join('')}</div>
        ${S.settings.auto ? '<div class="auto-bar"><i></i></div>' : ''}
      </div>`;
    stageEl.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => choose(Number(b.dataset.i))));
    const bar = stageEl.querySelector('.auto-bar i');
    if (bar) bar.style.animationDuration = `${view.autoDelay}ms`;
  } else if (view.mode === 'battle') {
    const e = battle.enemy;
    stageEl.innerHTML = `
      <div class="battle">
        <div class="combatant enemy ${e.boss ? 'boss' : ''} ${e.elite ? 'elite' : ''}" id="b-enemy">
          <div class="c-tags">${e.boss ? '<span class="tag tag-boss">GUARDIAN</span>' : ''}${e.elite ? '<span class="tag tag-elite">ELITE</span>' : ''}<span class="tag">Lv.${e.lvl}</span></div>
          <div class="c-sprite">${e.icon}</div>
          <div class="c-name">${esc(e.name)}</div>
          <div class="bar bar-hp sm"><div class="fill" id="b-ehp"></div><span id="b-ehp-t"></span></div>
          <div class="bar bar-atk"><div class="fill" id="b-eatk"></div></div>
          <div class="c-mini">⚔️ ${fmt(e.atk)} · 🛡️ ${fmt(e.def)} · ⚡ ${e.atkSpd.toFixed(2)}</div>
        </div>
        <div class="vs">VS</div>
        <div class="combatant player" id="b-player">
          <div class="c-sprite sm">🧝</div>
          <div class="c-name">${esc(S.name)} <span class="muted">Lv.${r.level}</span></div>
          <div class="bar bar-hp sm"><div class="fill" id="b-php"></div><span id="b-php-t"></span></div>
          <div class="bar bar-atk"><div class="fill" id="b-patk"></div></div>
        </div>
      </div>`;
    updateBattleBars();
  }
  renderTop();
}

function showEvent(ev) {
  const delay = Math.round((ev.autoDelay || 1200) / S.settings.speed);
  view = { mode: 'event', ...ev, autoDelay: delay, autoAt: performance.now() + delay };
  renderStage();
}
function endEvent() {
  view = { mode: 'idle' };
  battle = null;
  nextAuto = performance.now() + 1300 / S.settings.speed;
  renderStage();
  updateHud();
  save();
  maybeLevelUp();
}
function choose(i) {
  if (view.mode !== 'event') return;
  const c = view.choices[i];
  if (!c || c.disabled) return;
  c.fn();
}

/* ======================= EXPLORATION ======================= */
function explore() {
  if (view.mode !== 'idle' || isModalOpen() || !S) return;
  const r = S.run;
  r.room++;
  if (r.room > ROOMS_PER_FLOOR) { bossEvent(); return save(); }
  const x = Math.random() * 100;
  if (x < 55) enemyEvent();
  else if (x < 65) chestEvent();
  else if (x < 73) statueEvent();
  else if (x < 79) totemEvent();
  else if (x < 85) campfireEvent();
  else { log(`<span class="muted">${pick(FLAVOR)}</span>`); endEvent(); }
  save();
}

function enemyEvent(forced) {
  const e = makeEnemy(false, forced);
  log(`${e.icon} <b>${esc(e.name)}</b> <span class="muted">Lv.${e.lvl}</span> appears!`, 'danger');
  showEvent({
    icon: e.icon, tone: e.elite ? 'elite' : 'danger',
    title: `${esc(e.name)} appears!`,
    text: `Lv.${e.lvl} · ❤️ ${fmt(e.maxHp)} · ⚔️ ${fmt(e.atk)} · 🛡️ ${fmt(e.def)}`,
    choices: [
      { label: '⚔️ Fight', fn: () => startBattle(e) },
      { label: '🏃 Flee', fn: () => {
        if (Math.random() < 0.5) { log('You slipped away into the shadows.'); endEvent(); }
        else { log('Failed to flee!', 'danger'); startBattle(e); }
      } },
    ],
    autoIdx: 0,
  });
}

function bossEvent() {
  const e = makeEnemy(true);
  log(`👑 The guardian <b>${esc(e.name)}</b> blocks the stairs!`, 'danger');
  showEvent({
    icon: e.icon, tone: 'boss', title: `${esc(e.name)}`,
    text: `Guardian of Floor ${S.run.floor} · Lv.${e.lvl} · ❤️ ${fmt(e.maxHp)} · ⚔️ ${fmt(e.atk)}`,
    choices: [{ label: '⚔️ Challenge', fn: () => startBattle(e) }],
    autoIdx: 0, autoDelay: 1600,
  });
}

function chestEvent() {
  showEvent({
    icon: '🧰', tone: 'gold', title: 'Treasure Chest',
    text: 'A dusty chest sits in the corner. It might hold riches… or teeth.',
    choices: [
      { label: '🔓 Open', fn: () => {
        const r = S.run;
        if (Math.random() < 0.12) { log('📦 The chest was a <b>Mimic</b>!', 'danger'); return startBattle(makeEnemy(false, MIMIC, true)); }
        if (Math.random() < 0.55) {
          const g = Math.round(rand(25, 45) * Math.pow(1.09, r.floor - 1) * (1 + r.curse * 0.15));
          S.gold += g;
          log(`🧰 The chest held 🪙<b>${fmt(g)}</b> gold.`, 'gold');
        } else addItem(makeItem(r.floor + r.curse, 0.3 + r.curse * 0.1), '🧰 ');
        endEvent();
      } },
      { label: 'Ignore', fn: () => { log('You leave the chest alone.'); endEvent(); } },
    ],
    autoIdx: 0,
  });
}

function statueEvent() {
  const r = S.run;
  const cost = Math.round(60 * Math.pow(1.12, r.floor - 1) * (1 + r.blessings * 0.5));
  const can = S.gold >= cost;
  showEvent({
    icon: '🗽', tone: 'holy', title: 'Statue of Blessing',
    text: `An ancient statue hums with light. Offer 🪙${fmt(cost)} for a blessing?`,
    choices: [
      { label: `🙏 Offer 🪙${fmt(cost)}`, disabled: !can, fn: () => {
        S.gold -= cost;
        r.blessings++;
        const o = pick(LEVEL_OPTS);
        r.bonus[o.stat] += o.val;
        log(`🗽 Blessed! <b class="good">${optText(o)}</b>`, 'gold');
        toast(`🙏 Blessing: ${optText(o)}`, 'gold');
        endEvent();
      } },
      { label: 'Leave', fn: () => endEvent() },
    ],
    autoIdx: can ? 0 : 1,
  });
}

function totemEvent() {
  const r = S.run;
  showEvent({
    icon: '🗿', tone: 'curse', title: 'Cursed Totem',
    text: 'Touching it will strengthen every monster ahead — but their spoils grow richer.',
    choices: [
      { label: '✋ Touch', fn: () => {
        r.curse++;
        log(`🗿 The curse deepens… <b class="bad">Curse ${r.curse}</b> (enemies +10%, loot & exp +15%)`, 'danger');
        endEvent();
      } },
      { label: 'Walk away', fn: () => endEvent() },
    ],
    autoIdx: S.settings.autoTotem ? 0 : 1,
  });
}

function campfireEvent() {
  showEvent({
    icon: '🏕️', tone: 'holy', title: 'Abandoned Campfire',
    text: 'Embers still glow. A good place to catch your breath.',
    choices: [{ label: '🔥 Rest', fn: () => {
      const max = stats().hp;
      const h = Math.round(max * 0.35);
      S.run.hp = Math.min(max, S.run.hp + h);
      log(`🏕️ You rest and recover <b class="good">${fmt(h)}</b> HP.`);
      endEvent();
    } }],
    autoIdx: 0,
  });
}

/* ======================= COMBAT ======================= */
function makeEnemy(boss = false, forced = null, elite = false) {
  const r = S.run, f = r.floor;
  const lvl = f + (boss ? 2 : randInt(0, 2));
  let base = forced;
  if (!base) {
    if (boss) base = BOSSES[Math.floor((f - 1) / 2) % BOSSES.length];
    else {
      const top = Math.min(ENEMIES.length, 4 + Math.floor(f / 2));
      base = pick(ENEMIES.slice(Math.max(0, top - 6), top));
    }
  }
  elite = elite || (!boss && Math.random() < 0.1);
  const m = Math.pow(1.1, lvl - 1) * (1 + 0.1 * r.curse);
  const hpM = boss ? 3.2 : elite ? 1.6 : 1;
  const atkM = boss ? 1.35 : elite ? 1.3 : 1;
  const maxHp = Math.round(110 * m * hpM * (base.hp || 1));
  const rw = 1 + 0.15 * r.curse;
  return {
    name: (elite && !boss ? 'Elite ' : '') + base.name, icon: base.icon, lvl, boss, elite,
    maxHp, hp: maxHp,
    atk: Math.round(20 * m * atkM * (base.atk || 1)),
    def: Math.round(7 * m * (base.def || 1)),
    atkSpd: (boss ? 0.7 : rand(0.55, 0.8)) * (base.spd ? base.spd / 0.7 : 1),
    critRate: 5 + Math.min(25, f * 0.5), critDmg: 50 + f, vamp: base.vamp || 0,
    exp: Math.round(25 * Math.pow(1.1, lvl - 1) * rw * (boss ? 4 : elite ? 2 : 1)),
    gold: Math.round(rand(8, 15) * Math.pow(1.08, lvl - 1) * rw * (boss ? 5 : elite ? 2 : 1)),
  };
}

function startBattle(enemy) {
  battle = { enemy, pT: 0, eT: 0 };
  view = { mode: 'battle' };
  renderStage();
}

function calcHit(att, defVal) {
  const crit = Math.random() * 100 < att.critRate;
  let d = att.atk * (100 / (100 + defVal)) * rand(0.9, 1.1);
  if (crit) d *= 1 + att.critDmg / 100;
  return { dmg: Math.max(1, Math.round(d)), crit };
}

function floatNum(targetId, text, cls) {
  const host = document.getElementById(targetId);
  if (!host) return;
  const s = document.createElement('span');
  s.className = `float ${cls}`;
  s.textContent = text;
  s.style.left = `${rand(30, 70)}%`;
  host.append(s);
  setTimeout(() => s.remove(), 900);
  if (cls.includes('dmg')) {
    host.classList.remove('hit');
    void host.offsetWidth;
    host.classList.add('hit');
  }
}

function battleTick(dt) {
  if (!battle) return;
  const P = stats(), e = battle.enemy, r = S.run;
  battle.pT += dt * P.atkSpd;
  battle.eT += dt * e.atkSpd;
  while (battle && battle.pT >= 1) {
    battle.pT -= 1;
    const h = calcHit(P, e.def);
    e.hp -= h.dmg;
    floatNum('b-enemy', `${h.crit ? '💥' : ''}${fmt(h.dmg)}`, h.crit ? 'dmg crit' : 'dmg');
    if (P.vamp > 0) {
      const heal = Math.round(h.dmg * P.vamp / 100);
      if (heal > 0) { r.hp = Math.min(P.hp, r.hp + heal); floatNum('b-player', `+${fmt(heal)}`, 'heal'); }
    }
    if (e.hp <= 0) return winBattle();
  }
  while (battle && battle.eT >= 1) {
    battle.eT -= 1;
    const h = calcHit(e, P.def);
    r.hp -= h.dmg;
    floatNum('b-player', `${h.crit ? '💥' : ''}${fmt(h.dmg)}`, h.crit ? 'dmg crit' : 'dmg');
    if (e.vamp) e.hp = Math.min(e.maxHp, e.hp + Math.round(h.dmg * e.vamp / 100));
    if (r.hp <= 0) return loseBattle();
  }
  updateBattleBars();
}

function updateBattleBars() {
  if (!battle) return;
  const e = battle.enemy, P = stats(), r = S.run;
  const set = (id, w) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.max(0, Math.min(100, w))}%`; };
  const txt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set('b-ehp', (e.hp / e.maxHp) * 100); txt('b-ehp-t', `${fmt(Math.max(0, e.hp))} / ${fmt(e.maxHp)}`);
  set('b-php', (r.hp / P.hp) * 100); txt('b-php-t', `${fmt(Math.max(0, r.hp))} / ${fmt(P.hp)}`);
  set('b-eatk', battle.eT * 100); set('b-patk', battle.pT * 100);
  $('#c-hp-fill').style.width = `${(Math.max(0, r.hp) / P.hp) * 100}%`;
  $('#c-hp-text').textContent = `${fmt(Math.max(0, r.hp))} / ${fmt(P.hp)}`;
}

function winBattle() {
  const e = battle.enemy, r = S.run;
  battle = null;
  r.kills++;
  S.meta.totalKills++;
  S.gold += e.gold;
  log(`🏆 Defeated <b>${esc(e.name)}</b> · <span class="good">+${fmt(e.exp)} EXP</span> · 🪙${fmt(e.gold)}`, 'win');
  const dropChance = e.boss ? 1 : (e.elite ? 0.6 : 0.3) + r.curse * 0.03;
  if (Math.random() < dropChance) addItem(makeItem(e.lvl + r.curse, r.curse * 0.1 + (e.boss ? 0.6 : e.elite ? 0.3 : 0)));
  if (e.boss) {
    r.floor++;
    r.room = 0;
    const max = stats().hp;
    r.hp = Math.min(max, r.hp + Math.round(max * 0.2));
    if (r.floor > S.meta.bestFloor) S.meta.bestFloor = r.floor;
    log(`🪜 You descend to <b>Floor ${r.floor}</b>.`, 'gold');
    toast(`🪜 Floor ${r.floor}`, 'gold');
  }
  gainExp(e.exp);
  endEvent();
}

function loseBattle() {
  const e = battle.enemy, r = S.run;
  battle = null;
  r.hp = 0;
  S.settings.auto = false;
  S.meta.deaths++;
  log(`☠️ You were slain by <b>${esc(e.name)}</b> on Floor ${r.floor}.`, 'danger');
  view = { mode: 'idle' };
  renderStage();
  updateHud();
  save(true);
  const m = openModal({
    title: '☠️ You Have Fallen', className: 'modal-sm death', dismissible: false,
    body: `<p class="death-sub">Slain by ${e.icon} <b>${esc(e.name)}</b></p>
      <div class="death-stats">
        <div><span>Floor</span><b>${r.floor}</b></div><div><span>Level</span><b>${r.level}</b></div>
        <div><span>Kills</span><b>${r.kills}</b></div><div><span>Time</span><b>${fmtTime(r.time)}</b></div>
      </div>
      <p class="muted center">Your equipment and gold remain. Best floor: <b>${S.meta.bestFloor}</b></p>
      <div class="modal-actions"><button class="btn btn-gold btn-lg" data-rise>✨ Rise Again</button></div>`,
  });
  m.body.querySelector('[data-rise]').onclick = () => {
    S.run = newRun();
    S.meta.runs++;
    clampHp();
    m.close();
    logEl.innerHTML = '';
    log(`✨ ${esc(S.name)} rises again and re-enters the dungeon.`, 'gold');
    endEvent();
  };
}

/* ======================= LEVEL UP ======================= */
let lvModal = null;
function gainExp(x) {
  const r = S.run;
  r.exp += x;
  let up = false;
  while (r.exp >= expMax(r.level)) {
    r.exp -= expMax(r.level);
    r.level++;
    r.pendingLv++;
    up = true;
  }
  if (up) {
    r.hp = stats().hp;
    log(`⭐ <b>Level up!</b> You are now Lv.${r.level}.`, 'gold');
  }
}
function rollOpts() {
  const pool = [...LEVEL_OPTS];
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
function applyLevelOpt(o) {
  S.run.bonus[o.stat] += o.val;
  S.run.pendingLv--;
  S.run.rerolls = 2;
  clampHp();
  if (o.stat === 'hp') S.run.hp = stats().hp;
}
function maybeLevelUp() {
  const r = S.run;
  if (r.pendingLv <= 0 || lvModal || window.__guildOpen) return;
  if (S.settings.autoPick) {
    while (r.pendingLv > 0) {
      const o = pick(rollOpts());
      applyLevelOpt(o);
      log(`⭐ Auto-picked <b class="good">${optText(o)}</b>`);
    }
    updateHud();
    return save();
  }
  let opts = rollOpts();
  lvModal = openModal({ title: '⭐ Level Up!', className: 'modal-sm levelup', dismissible: false, onClose: () => { lvModal = null; } });
  const draw = () => {
    lvModal.body.innerHTML = `
      <p class="center muted">Lv. ${r.level - r.pendingLv + 1} — choose a blessing${r.pendingLv > 1 ? ` <b>(${r.pendingLv} left)</b>` : ''}</p>
      <div class="lv-opts">${opts.map((o, i) => `<button class="lv-opt" data-i="${i}"><span class="lv-ico">${STATS[o.stat].icon}</span><b>${optText(o)}</b></button>`).join('')}</div>
      <div class="modal-actions"><button class="btn btn-ghost" data-reroll ${r.rerolls <= 0 ? 'disabled' : ''}>🎲 Reroll (${r.rerolls})</button></div>`;
    lvModal.body.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => {
      const o = opts[Number(b.dataset.i)];
      applyLevelOpt(o);
      log(`⭐ Gained <b class="good">${optText(o)}</b>`);
      updateHud();
      save(true);
      if (r.pendingLv > 0) { opts = rollOpts(); draw(); } else lvModal.close();
    }));
    lvModal.body.querySelector('[data-reroll]').onclick = () => {
      if (r.rerolls <= 0) return;
      r.rerolls--;
      opts = rollOpts();
      draw();
    };
  };
  draw();
}

/* ======================= INVENTORY ======================= */
let invModal = null;
function itemCard(it) {
  return `<button class="item r-${it.rarity}" data-id="${it.id}" title="${itemName(it)}">
    <span class="item-ico">${it.icon}</span><span class="item-tier">T${it.tier}</span></button>`;
}
function renderInventory() {
  if (!invModal) return;
  const order = (it) => RARITIES.findIndex((r) => r.key === it.rarity);
  const items = [...S.inventory].sort((a, b) => order(b) - order(a) || b.tier - a.tier);
  invModal.body.innerHTML = `
    <div class="inv-head"><span>🎒 ${S.inventory.length}/${MAX_INV}</span><span>🪙 ${fmt(S.gold)}</span></div>
    <div class="sub-head"><h4>Equipped</h4><small>${S.equipped.length}/${MAX_EQUIP}</small></div>
    <div class="inv-grid eq">${S.equipped.map(itemCard).join('') || '<p class="muted">Nothing equipped.</p>'}</div>
    <div class="sub-head"><h4>Bag</h4></div>
    <div class="inv-grid">${items.map(itemCard).join('') || '<p class="muted">Your bag is empty. Go loot something!</p>'}</div>
    <div class="inv-tools">
      <button class="btn btn-ghost btn-sm" data-sell="1">Sell Common</button>
      <button class="btn btn-ghost btn-sm" data-sell="2">Sell ≤ Uncommon</button>
      <button class="btn btn-ghost btn-sm" data-sell="3">Sell ≤ Rare</button>
    </div>`;
  invModal.body.querySelectorAll('.item').forEach((b) => (b.onclick = () => {
    const id = b.dataset.id;
    const eq = S.equipped.find((x) => x.id === id);
    openItem(eq || S.inventory.find((x) => x.id === id), !!eq);
  }));
  invModal.body.querySelectorAll('[data-sell]').forEach((b) => (b.onclick = async () => {
    const n = Number(b.dataset.sell);
    const keys = RARITIES.slice(0, n).map((r) => r.key);
    const list = S.inventory.filter((it) => keys.includes(it.rarity));
    if (!list.length) return toast('Nothing to sell.');
    const total = list.reduce((a, it) => a + it.value, 0);
    if (!(await confirmBox('Sell items', `Sell <b>${list.length}</b> items for 🪙<b>${fmt(total)}</b>?`, 'Sell'))) return;
    S.inventory = S.inventory.filter((it) => !keys.includes(it.rarity));
    S.gold += total;
    toast(`Sold ${list.length} items for 🪙${fmt(total)}`);
    save(true); updateHud(); renderInventory();
  }));
}
function openInventory() {
  hasNewLoot = false;
  invModal = openModal({ title: 'Inventory', className: 'modal-wide', onClose: () => { invModal = null; } });
  renderInventory();
  renderTop();
}

function openItem(it, equipped) {
  if (!it) return;
  const m = openModal({
    title: `<span class="rc r-${it.rarity}">${it.icon} ${itemName(it)}</span>`, className: `modal-sm item-modal r-${it.rarity}`,
    body: `<div class="item-meta"><span class="tag">Tier ${it.tier}</span><span class="tag rc r-${it.rarity}">${it.rarity}</span></div>
      <ul class="item-lines">${it.stats.map((l) => `<li><span>${STATS[l.stat].icon} ${STATS[l.stat].label}</span><b>+${fmtStat(l.stat, l.val)}</b></li>`).join('')}</ul>
      <p class="muted center">Sell value 🪙${fmt(it.value)}</p>
      <div class="modal-actions">
        ${equipped ? '<button class="btn btn-ghost" data-act="unequip">Unequip</button>'
    : `<button class="btn btn-gold" data-act="equip" ${S.equipped.length >= MAX_EQUIP ? 'disabled' : ''}>Equip</button>`}
        ${equipped ? '' : '<button class="btn btn-danger" data-act="sell">Sell</button>'}
      </div>
      ${!equipped && S.equipped.length >= MAX_EQUIP ? '<p class="muted center small">All 6 slots are full — unequip something first.</p>' : ''}`,
  });
  m.body.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'equip' && S.equipped.length < MAX_EQUIP) {
      S.inventory = S.inventory.filter((x) => x.id !== it.id);
      S.equipped.push(it);
    } else if (act === 'unequip') {
      if (S.inventory.length >= MAX_INV) return toast('Bag is full!');
      S.equipped = S.equipped.filter((x) => x.id !== it.id);
      S.inventory.unshift(it);
      clampHp();
    } else if (act === 'sell') {
      S.inventory = S.inventory.filter((x) => x.id !== it.id);
      S.gold += it.value;
      toast(`Sold for 🪙${fmt(it.value)}`);
    }
    m.close();
    save(true);
    updateHud();
    if (view.mode === 'battle') updateBattleBars();
    renderInventory();
  }));
}

/* ======================= SETTINGS ======================= */
function openSettings() {
  const st = S.settings;
  const m = openModal({
    title: '⚙️ Settings', className: 'modal-sm',
    body: `
      <div class="set-group">
        <label class="toggle"><input type="checkbox" data-k="autoPick" ${st.autoPick ? 'checked' : ''}><span></span>Auto-pick level-up bonuses</label>
        <label class="toggle"><input type="checkbox" data-k="autoSellCommon" ${st.autoSellCommon ? 'checked' : ''}><span></span>Auto-sell Common drops</label>
        <label class="toggle"><input type="checkbox" data-k="autoTotem" ${st.autoTotem ? 'checked' : ''}><span></span>Auto mode touches Cursed Totems</label>
      </div>
      <div class="set-group">
        <h4>Records</h4>
        <div class="records">
          <div><span>Best floor</span><b>${S.meta.bestFloor}</b></div><div><span>Total kills</span><b>${fmt(S.meta.totalKills)}</b></div>
          <div><span>Deaths</span><b>${S.meta.deaths}</b></div><div><span>Runs</span><b>${S.meta.runs}</b></div>
        </div>
      </div>
      <div class="set-group">
        <h4>Save data</h4>
        <div class="btn-row">
          <button class="btn btn-ghost btn-sm" data-act="export">Export</button>
          <button class="btn btn-ghost btn-sm" data-act="import">Import</button>
          <button class="btn btn-danger btn-sm" data-act="reset">Reset</button>
        </div>
      </div>
      <div class="set-group guild-entry">
        <div class="guild-crest">🏰</div>
        <div class="guild-text"><b>Guild</b><small>Meet your guildmates in the hall.</small></div>
        <button class="btn btn-gold" data-act="guild">Login Guild</button>
      </div>
      <p class="muted center small">Dungeon RPG OD · v1.0</p>`,
  });
  m.body.querySelectorAll('[data-k]').forEach((cb) => (cb.onchange = () => { st[cb.dataset.k] = cb.checked; save(true); }));
  m.body.querySelector('[data-act="guild"]').onclick = () => {
    closeAllModals();
    openGuild();
  };
  m.body.querySelector('[data-act="export"]').onclick = async () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    const ok = await copyText(code);
    toast(ok ? 'Save copied to clipboard' : 'Could not copy save');
  };
  m.body.querySelector('[data-act="import"]').onclick = () => {
    const code = prompt('Paste your save code:');
    if (!code) return;
    try {
      const s = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!s || s.v !== 1 || !s.run) throw 0;
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      location.reload();
    } catch { toast('Invalid save code', 'bad'); }
  };
  m.body.querySelector('[data-act="reset"]').onclick = async () => {
    if (!(await confirmBox('Reset progress', 'Delete your hero, gear and records? This cannot be undone.', 'Delete', true))) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  };
}

/* ======================= LOOP ======================= */
let lastTick = performance.now();
let secAcc = 0;
function tick() {
  const now = performance.now();
  const dt = Math.min(1, (now - lastTick) / 1000);
  lastTick = now;
  if (!S || window.__guildOpen) return;
  S.run.time += dt;
  secAcc += dt;
  if (view.mode === 'battle') battleTick(dt * S.settings.speed);
  if (S.settings.auto && !isModalOpen()) {
    if (view.mode === 'idle' && now >= nextAuto) explore();
    else if (view.mode === 'event' && now >= view.autoAt) choose(view.autoIdx ?? 0);
  }
  if (secAcc >= 1) { secAcc = 0; renderTop(); save(); }
}

/* ======================= BOOT ======================= */
function startGame() {
  $('#title-screen').hidden = true;
  $('#game-screen').hidden = false;
  if (S.run.hp != null && S.run.hp <= 0) { S.run = newRun(); S.meta.runs++; } // died before pressing "Rise Again"
  clampHp();
  updateHud();
  view = { mode: 'idle' };
  renderStage();
  log(`🕯️ ${esc(S.name)} stands at Floor ${S.run.floor}. The dungeon awaits.`, 'gold');
  maybeLevelUp();
}

$('#btn-explore').onclick = () => explore();
$('#btn-auto').onclick = () => {
  S.settings.auto = !S.settings.auto;
  nextAuto = performance.now() + 300;
  if (view.mode === 'event') view.autoAt = performance.now() + view.autoDelay;
  renderStage();
  save(true);
};
$('#btn-speed').onclick = () => {
  const sp = [1, 2, 3];
  S.settings.speed = sp[(sp.indexOf(S.settings.speed) + 1) % sp.length];
  renderTop();
  save(true);
};
$('#btn-inv').onclick = () => openInventory();
$('#btn-settings').onclick = () => openSettings();

$('#name-form').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#name-input').value.trim().slice(0, 16) || 'Hero';
  S = newState(name);
  // starter gear
  S.equipped.push(makeItem(1, 0), makeItem(1, 0));
  save(true);
  startGame();
};

window.addEventListener('guild:closed', () => {
  lastTick = performance.now();
  nextAuto = performance.now() + 800;
  maybeLevelUp();
});
window.addEventListener('beforeunload', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

if (S) startGame();
else $('#title-screen').hidden = false;
setInterval(tick, 100);
