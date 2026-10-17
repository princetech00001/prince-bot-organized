// Turn-based text arcade games. Pure logic + text rendering (no WhatsApp code).
// Every game exposes:
//   title, help, keys (valid action letters), create(), step(state, key), render(state)
// Each action letter is one game tick, so a player can send several at once ("lrs").
import { rand, rng } from "./gameKit.js";

const roll = (p) => rng.next() < p;                         // tests seed rng.next for repeatable games

// ───────────────────────────── CYBER RUNNER (lanes) ─────────────────────────
const CY_ROWS = 7, CY_LANES = 3;
/**
 * Builds the next road row. Fairness rule: whichever open lane the player is
 * standing in on the previous row, this row has an open lane within one step
 * of it, so the road is never an unavoidable crash.
 */
function cyberRow(prevOpen) {
  const row = Array.from({ length: CY_LANES }, () => (roll(0.5) ? "X" : " "));
  const everyoneCanPass = () => prevOpen.every(p => [p - 1, p, p + 1].some(l => l >= 0 && l < CY_LANES && row[l] !== "X"));
  if (!everyoneCanPass()) row[1] = " ";                                  // the middle lane is within one step of every lane
  const open = row.map((c, i) => (c !== "X" ? i : -1)).filter(i => i >= 0);
  if (roll(0.3)) row[open[rand(open.length)]] = "C";
  return { row, freeLanes: open };
}
const cyber = {
  title: "🏍️ CYBER RUNNER",
  help: "Steer with *l* (left), *s* (straight), *r* (right). Dodge 🚧, grab 🪙. Send several at once, like *.cyber lrs*",
  keys: "lsr",
  create() {
    const st = { rows: [], lane: 1, score: 0, coins: 0, over: false, free: [0, 1, 2], crashed: false };
    for (let i = 0; i < CY_ROWS; i++) st.rows.push(Array(CY_LANES).fill(" "));
    return st;
  },
  step(st, k) {
    if (st.over) return;
    if (k === "l") st.lane = Math.max(0, st.lane - 1);
    if (k === "r") st.lane = Math.min(CY_LANES - 1, st.lane + 1);
    const { row, freeLanes } = cyberRow(st.free);
    st.free = freeLanes;
    st.rows = [row, ...st.rows.slice(0, -1)];            // everything moves down one row
    const here = st.rows[CY_ROWS - 1][st.lane];
    if (here === "X") { st.over = true; st.crashed = true; return; }
    if (here === "C") { st.coins++; st.score += 5; st.rows[CY_ROWS - 1][st.lane] = " "; }
    st.score += 1;
  },
  render(st) {
    const cell = { " ": "⬛", X: "🚧", C: "🪙" };
    const lines = st.rows.map((r, y) => r.map((c, l) => (y === CY_ROWS - 1 && l === st.lane ? (st.crashed ? "💥" : "🏍️") : cell[c])).join(""));
    return `${lines.join("\n")}\n\nScore *${st.score}*  🪙 ${st.coins}`;
  },
};

// ───────────────────────────── NINJA DASH (side runner) ─────────────────────
const DA_VIEW = 9;
function dashNext(st) {
  st.sinceObstacle++;
  if (st.sinceObstacle >= 2 && roll(0.35)) { st.sinceObstacle = 0; return "^"; }   // at least one safe cell between obstacles
  return roll(0.12) ? "*" : ".";
}
const dash = {
  title: "🥷 NINJA DASH",
  help: "*r* = run, *j* = jump. Jump over ▲ spikes, run through everything else. You can't jump twice in a row (landing). Try *.dash rrjrj*",
  keys: "rj",
  create() {
    const st = { track: [], score: 0, stars: 0, over: false, landing: false, air: false, sinceObstacle: 5 };
    for (let i = 0; i < DA_VIEW; i++) st.track.push(".");
    return st;
  },
  step(st, k) {
    if (st.over) return;
    let jump = k === "j";
    if (jump && st.landing) jump = false;                 // still landing: it counts as a run
    const next = st.track[0];
    if (next === "^" && !jump) { st.over = true; st.air = false; return; }
    if (next === "*") { st.stars++; st.score += 3; }
    st.track.shift();
    st.track.push(dashNext(st));
    st.landing = jump;
    st.air = jump;
    st.score += 1;
  },
  render(st) {
    const g = { ".": "⬜", "^": "🔺", "*": "⭐" };
    const ground = st.track.map(c => g[c]).join("");
    const air = (st.air ? "🥷" : "⬛") + "⬛".repeat(DA_VIEW);
    const floor = (st.air ? "⬛" : st.over ? "💥" : "🥷") + ground;
    return `${air}\n${floor}\n\nScore *${st.score}*  ⭐ ${st.stars}`;
  },
};

// ───────────────────────────── MATRIX (space shooter) ───────────────────────
const MX_W = 7, MX_H = 8;
const matrix = {
  title: "🚀 MATRIX SHOOTER",
  help: "*a* left, *d* right, *f* fire, *x* wait. Shoot 👾 before they reach the bottom. 3 lives. Try *.matrix aaffd*",
  keys: "adfx",
  create() { return { x: 3, enemies: [], score: 0, kills: 0, lives: 3, over: false, flash: -1 }; },
  step(st, k) {
    if (st.over) return;
    st.flash = -1;
    if (k === "a") st.x = Math.max(0, st.x - 1);
    if (k === "d") st.x = Math.min(MX_W - 1, st.x + 1);
    if (k === "f") {
      const inCol = st.enemies.filter(e => e.x === st.x).sort((a, b) => b.y - a.y)[0];
      st.flash = st.x;
      if (inCol) { st.enemies.splice(st.enemies.indexOf(inCol), 1); st.kills++; st.score += 10; }
    }
    st.ticks = (st.ticks || 0) + 1;
    if (st.ticks % 2 === 0) for (const e of st.enemies) e.y++;            // invaders drop one row every second move
    const landed = st.enemies.filter(e => e.y >= MX_H - 1);
    st.enemies = st.enemies.filter(e => e.y < MX_H - 1);
    if (landed.length) { st.lives -= landed.length; if (st.lives <= 0) { st.lives = 0; st.over = true; } }
    if (roll(0.35)) {
      const x = rand(MX_W);
      if (!st.enemies.some(e => e.x === x && e.y === 0)) st.enemies.push({ x, y: 0 });
    }
    st.score += 1;
  },
  render(st) {
    const lines = [];
    for (let y = 0; y < MX_H; y++) {
      let line = "";
      for (let x = 0; x < MX_W; x++) {
        if (y === MX_H - 1 && x === st.x) line += st.over ? "💥" : "🚀";
        else if (st.enemies.some(e => e.x === x && e.y === y)) line += "👾";
        else if (x === st.flash && y < MX_H - 1) line += "▫️";
        else line += "⬛";
      }
      lines.push(line);
    }
    return `${lines.join("\n")}\n\n${"❤️".repeat(st.lives) || "💀"}  Score *${st.score}*  Kills ${st.kills}`;
  },
};

// ───────────────────────────── DOOM (corridor shooter) ──────────────────────
const DM_LEN = 9;
const TYPES = {
  demon: { icon: "👹", hp: 1, dmg: 15 },
  imp:   { icon: "👿", hp: 2, dmg: 10 },
  boss:  { icon: "💀", hp: 5, dmg: 25 },
};
function spawnWave(st) {
  st.wave++;
  const n = Math.min(2 + st.wave, 7);
  for (let i = 0; i < n; i++) {
    const t = st.wave % 5 === 0 && i === 0 ? "boss" : roll(0.4) ? "imp" : "demon";
    st.enemies.push({ type: t, hp: TYPES[t].hp, dist: 4 + rand(DM_LEN - 4) });
  }
}
const doom = {
  title: "🔫 DOOM CORRIDOR",
  help: "*s* shoot nearest, *b* bash (kills anything right next to you), *r* reload, *m* medkit. Enemies walk at you. Try *.doom ssr*",
  keys: "sbrm",
  create() { const st = { hp: 100, ammo: 6, kits: 2, enemies: [], wave: 0, score: 0, kills: 0, over: false, note: "" }; spawnWave(st); return st; },
  step(st, k) {
    if (st.over) return;
    st.note = "";
    const sorted = () => [...st.enemies].sort((a, b) => a.dist - b.dist);
    const kill = (e) => { st.enemies.splice(st.enemies.indexOf(e), 1); st.kills++; st.score += e.type === "boss" ? 50 : e.type === "imp" ? 15 : 10; };
    if (k === "s") {
      if (st.ammo <= 0) st.note = "🔫 Click! Out of ammo — reload with r.";
      else {
        st.ammo--;
        const t = sorted()[0];
        if (t && roll(t.dist <= 3 ? 0.85 : 0.6)) { t.hp--; st.note = t.hp <= 0 ? "💥 Direct hit!" : "💥 Hit, still standing!"; if (t.hp <= 0) kill(t); }
        else st.note = "💨 Missed!";
      }
    } else if (k === "b") {
      const t = sorted()[0];
      if (t && t.dist <= 1) { kill(t); st.note = "👊 Smashed it!"; } else st.note = "👊 Nothing close enough to bash.";
    } else if (k === "r") { st.ammo = 6; st.note = "🔄 Reloaded."; }
    else if (k === "m") {
      if (st.kits > 0) { st.kits--; st.hp = Math.min(100, st.hp + 40); st.note = "🩹 +40 health."; } else st.note = "🩹 No medkits left!";
    }
    for (const e of st.enemies) {                                     // enemies move or attack
      if (e.dist > 0) e.dist--;
      if (e.dist === 0) st.hp -= TYPES[e.type].dmg;
    }
    if (st.hp <= 0) { st.hp = 0; st.over = true; return; }
    if (!st.enemies.length) { st.note += " 🌊 Wave cleared!"; if (st.wave % 3 === 0) st.kits++; spawnWave(st); }
    st.score += 1;
  },
  render(st) {
    const cells = Array(DM_LEN).fill("▫️");
    for (const e of st.enemies) cells[Math.min(DM_LEN - 1, e.dist)] = TYPES[e.type].icon;
    const bar = "█".repeat(Math.ceil(st.hp / 10)) + "░".repeat(10 - Math.ceil(st.hp / 10));
    return `${st.over ? "☠️" : "🧑‍🚀"}${cells.join("")}\n\n❤️ ${bar} ${st.hp}\n🔫 ${st.ammo}/6   🩹 ${st.kits}   🌊 Wave ${st.wave}   Kills ${st.kills}   Score *${st.score}*${st.note ? "\n" + st.note : ""}`;
  },
};

// ───────────────────────────── VAMPIRE NIGHT (grid survival) ────────────────
const VP = 7, DAWN = 30;
const vampire = {
  title: "🧛 VAMPIRE NIGHT",
  help: `Survive until dawn (${DAWN} moves). *w a s d* move, *f* holy burst kills vampires next to you (recharges in 3 moves), *x* wait. Try *.vampire wwf*`,
  keys: "wasdfx",
  create() { return { x: 3, y: 3, v: [], hearts: 3, tick: 0, cool: 0, kills: 0, score: 0, over: false, won: false, burst: false }; },
  step(st, k) {
    if (st.over) return;
    st.burst = false;
    if (k === "w") st.y = Math.max(0, st.y - 1);
    if (k === "s") st.y = Math.min(VP - 1, st.y + 1);
    if (k === "a") st.x = Math.max(0, st.x - 1);
    if (k === "d") st.x = Math.min(VP - 1, st.x + 1);
    if (k === "f" && st.cool === 0) {
      const near = st.v.filter(e => Math.max(Math.abs(e.x - st.x), Math.abs(e.y - st.y)) <= 1);
      st.v = st.v.filter(e => !near.includes(e));
      st.kills += near.length; st.score += near.length * 5; st.cool = 3; st.burst = true;
    } else if (st.cool > 0) st.cool--;
    for (const e of st.v) {                                           // vampires step toward you (every second move)
      if (st.tick % 2 === 1) break;
      const dx = Math.sign(st.x - e.x), dy = Math.sign(st.y - e.y);
      if (Math.abs(st.x - e.x) >= Math.abs(st.y - e.y) && dx) e.x += dx; else if (dy) e.y += dy; else e.x += dx;
    }
    const hit = st.v.filter(e => e.x === st.x && e.y === st.y);
    if (hit.length) { st.hearts -= hit.length; st.v = st.v.filter(e => !hit.includes(e)); }
    st.tick++;
    st.score += 1;
    if (st.hearts <= 0) { st.hearts = 0; st.over = true; return; }
    if (st.tick >= DAWN) { st.over = true; st.won = true; st.score += 50; return; }
    if (st.tick % 2 === 0 && st.v.length < 6) {                       // new vampire from an edge
      const edge = rand(4), p = rand(VP);
      const e = edge === 0 ? { x: p, y: 0 } : edge === 1 ? { x: p, y: VP - 1 } : edge === 2 ? { x: 0, y: p } : { x: VP - 1, y: p };
      if (!(e.x === st.x && e.y === st.y) && !st.v.some(o => o.x === e.x && o.y === e.y)) st.v.push(e);
    }
  },
  render(st) {
    const lines = [];
    for (let y = 0; y < VP; y++) {
      let line = "";
      for (let x = 0; x < VP; x++) {
        if (x === st.x && y === st.y) line += st.over && !st.won ? "💀" : st.burst ? "🌟" : "🧑";
        else if (st.v.some(e => e.x === x && e.y === y)) line += "🧛";
        else line += "⬛";
      }
      lines.push(line);
    }
    const night = Math.max(0, DAWN - st.tick);
    return `${lines.join("\n")}\n\n${"❤️".repeat(st.hearts) || "💀"}  🌙 ${night} left  ${st.cool ? `⏳ burst in ${st.cool}` : "✨ burst ready"}\nKills ${st.kills}  Score *${st.score}*${st.won ? "\n🌅 *Dawn breaks. You survived!*" : ""}`;
  },
};

export const ARCADE = { cyber, dash, matrix, doom, vampire };
