// ─────────────────────────────────────────────────────────────────────────────
//  GAMES PLUS — chat games written for this bot (original code).
//
//  .scramble  (.wordscramble)   unscramble the word
//  .scrabble  (.wordscrabble)   build words from 7 letters (checked online)
//  .sudoku    (.sudokugame)     shared sudoku board
//  .snake     (.snakegame)      snake on an 8x8 board
//  .whot      (.naijawhot, .whotgame)   Naija Whot against the bot
//
//  Works in groups and in private chats. Scores: <command> top
// ─────────────────────────────────────────────────────────────────────────────
import { rng, rand, pick, shuffle, userPart, addPoints, setBest, board, boardText } from "../../utils/gameKit.js";
import * as W from "../../utils/whotEngine.js";

const SCRAMBLE_SECONDS = 60;
const SCRABBLE_SECONDS = 90;

// ── scramble word bank ──────────────────────────────────────────────────────
const WORDS = {
  animal: ["elephant", "giraffe", "monkey", "tiger", "zebra", "rabbit", "dolphin", "penguin", "buffalo", "leopard", "camel", "donkey"],
  food: ["pepper", "banana", "orange", "cassava", "plantain", "cabbage", "tomato", "coconut", "mango", "peanut", "pancake", "chicken"],
  country: ["nigeria", "ghana", "kenya", "egypt", "brazil", "canada", "france", "germany", "japan", "india", "mexico", "senegal"],
  tech: ["keyboard", "internet", "battery", "network", "browser", "program", "website", "monitor", "charger", "android", "wireless", "server"],
  nature: ["thunder", "volcano", "forest", "desert", "island", "river", "mountain", "rainbow", "sunrise", "harmattan", "valley", "ocean"],
  school: ["teacher", "student", "library", "science", "history", "pencil", "lesson", "exam", "algebra", "grammar", "college", "diploma"],
  home: ["kitchen", "window", "blanket", "bucket", "mirror", "curtain", "pillow", "ladder", "garden", "bedroom", "carpet", "lantern"],
};
const WORD_LIST = Object.entries(WORDS).flatMap(([cat, ws]) => ws.map(w => [w, cat]));

// ── scrabble tiles ──────────────────────────────────────────────────────────
const TILES = { A: [9, 1], B: [2, 3], C: [2, 3], D: [4, 2], E: [12, 1], F: [2, 4], G: [3, 2], H: [2, 4], I: [9, 1], J: [1, 8], K: [1, 5], L: [4, 1], M: [2, 3], N: [6, 1], O: [8, 1], P: [2, 3], Q: [1, 10], R: [6, 1], S: [4, 1], T: [6, 1], U: [4, 1], V: [2, 4], W: [2, 4], X: [1, 8], Y: [2, 4], Z: [1, 10] };
const BAG = Object.entries(TILES).flatMap(([l, [n]]) => Array(n).fill(l));
const VOWELS = new Set("AEIOU");
const letterValue = (l) => TILES[l][1];

function drawRack() {
  for (let tries = 0; tries < 50; tries++) {
    const rack = shuffle(BAG).slice(0, 7);
    const v = rack.filter(l => VOWELS.has(l)).length;
    if (v >= 2 && v <= 4 && !(rack.includes("Q") && !rack.includes("U"))) return rack;
  }
  return "RETAINS".split("");
}
const canMake = (word, rack) => {
  const pool = {};
  for (const l of rack) pool[l] = (pool[l] || 0) + 1;
  for (const l of word) { if (!pool[l]) return false; pool[l]--; }
  return true;
};
const wordScore = (word) => [...word].reduce((s, l) => s + letterValue(l), 0) + (word.length === 7 ? 20 : 0);

const dictCache = new Map();
/** true = real word, false = not a word, throws if the dictionary can't be reached. */
async function checkWord(w) {
  if (dictCache.has(w)) return dictCache.get(w);
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.toLowerCase())}`, { signal: AbortSignal.timeout(6000) });
  if (res.status === 200) { dictCache.set(w, true); return true; }
  if (res.status === 404) { dictCache.set(w, false); return false; }
  throw new Error(`dictionary status ${res.status}`);
}

// ── sudoku ──────────────────────────────────────────────────────────────────
const LEVELS = { easy: 38, medium: 32, hard: 27 };
const ROWS = "ABCDEFGHI";

function options(g, r, c) {
  const used = new Set();
  for (let i = 0; i < 9; i++) { used.add(g[r][i]); used.add(g[i][c]); }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) used.add(g[br + i][bc + j]);
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}
function mostConstrained(g) {
  let best = null, bestOpts = null;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (g[r][c] !== 0) continue;
    const o = options(g, r, c);
    if (!o.length) return { dead: true };
    if (!best || o.length < bestOpts.length) { best = [r, c]; bestOpts = o; if (o.length === 1) return { cell: best, opts: bestOpts }; }
  }
  return best ? { cell: best, opts: bestOpts } : { done: true };
}
/** How many solutions (stops at `limit`). aborted = gave up searching. */
function solveCount(grid, limit = 2, maxNodes = 40000) {
  const g = grid.map(r => [...r]);
  let count = 0, nodes = 0;
  const rec = () => {
    if (count >= limit || nodes > maxNodes) return;
    nodes++;
    const m = mostConstrained(g);
    if (m.dead) return;
    if (m.done) { count++; return; }
    const [r, c] = m.cell;
    for (const v of m.opts) { g[r][c] = v; rec(); if (count >= limit || nodes > maxNodes) break; }
    g[r][c] = 0;
  };
  rec();
  return { count, aborted: nodes > maxNodes };
}
function fullGrid() {
  const g = Array.from({ length: 9 }, () => Array(9).fill(0));
  const rec = () => {
    const m = mostConstrained(g);
    if (m.dead) return false;
    if (m.done) return true;
    const [r, c] = m.cell;
    for (const v of shuffle(m.opts)) { g[r][c] = v; if (rec()) return true; }
    g[r][c] = 0;
    return false;
  };
  rec();
  return g;
}
function makePuzzle(level = "medium") {
  const solution = fullGrid();
  const puzzle = solution.map(r => [...r]);
  const target = LEVELS[level] ?? LEVELS.medium;
  let givens = 81;
  for (const [r, c] of shuffle(Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9]))) {
    if (givens <= target) break;
    const v = puzzle[r][c];
    puzzle[r][c] = 0;
    const { count, aborted } = solveCount(puzzle, 2);
    if (count !== 1 || aborted) puzzle[r][c] = v; else givens--;
  }
  return { solution, puzzle };
}
function sudokuText(st) {
  const cell = (v) => (v ? String(v) : ".");
  const row = (r) => `${ROWS[r]} │ ${[0, 3, 6].map(b => [0, 1, 2].map(i => cell(st.grid[r][b + i])).join(" ")).join(" │ ")} │`;
  const sep = (a, b, c) => `  ${a}───────${b}───────${b}───────${c}`;
  const out = ["    1 2 3   4 5 6   7 8 9", sep("┌", "┬", "┐")];
  for (let r = 0; r < 9; r++) { out.push(row(r)); if (r === 2 || r === 5) out.push(sep("├", "┼", "┤")); }
  out.push(sep("└", "┴", "┘"));
  return "```\n" + out.join("\n") + "\n```";
}
const sudokuLeft = (st) => st.grid.flat().filter(v => v === 0).length;

// ── snake ───────────────────────────────────────────────────────────────────
const SN = 8;
const DIRS = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
const DIR_WORDS = { up: "w", down: "s", left: "a", right: "d" };
function snakeApple(st) {
  const free = [];
  for (let y = 0; y < SN; y++) for (let x = 0; x < SN; x++) if (!st.body.some(b => b.x === x && b.y === y)) free.push({ x, y });
  return free.length ? free[rand(free.length)] : null;
}
function snakeText(st) {
  const lines = [];
  for (let y = 0; y < SN; y++) {
    let line = "";
    for (let x = 0; x < SN; x++) {
      if (st.body[0].x === x && st.body[0].y === y) line += st.over ? "💥" : "🟢";
      else if (st.body.some(b => b.x === x && b.y === y)) line += "🟩";
      else if (st.apple && st.apple.x === x && st.apple.y === y) line += "🍎";
      else line += "⬛";
    }
    lines.push(line);
  }
  return `${lines.join("\n")}\n\n🍎 Score *${st.score}*`;
}

// ── per-chat game state ─────────────────────────────────────────────────────
const scramble = {}, scrabble = {}, sudoku = {}, snake = {}, whot = {};

function endScramble(chat, why) {
  const g = scramble[chat];
  if (!g) return;
  clearTimeout(g.timer);
  delete scramble[chat];
  if (why === "timeout") g.sock.sendMessage(chat, { text: `⏰ *Time is up!* Nobody got it.\nThe word was *${g.word.toUpperCase()}*` }).catch(() => {});
}
function finishScrabble(chat) {
  const g = scrabble[chat];
  if (!g) return null;
  clearTimeout(g.timer);
  delete scrabble[chat];
  const rows = Object.values(g.players).sort((a, b) => b.total - a.total);
  if (!rows.length) return { text: `🔤 *Round over!* Nobody found a word.\nLetters were: ${g.rack.join(" ")}`, mentions: [] };
  const winner = rows[0];
  addPoints(chat, "scrabble", winner.jid, 1);
  const lines = rows.slice(0, 8).map((p, i) => `${["🥇", "🥈", "🥉"][i] || `${i + 1}.`} @${userPart(p.jid)} — ${p.total} pts  (${p.words.join(", ")})`);
  return { text: `🔤 *SCRABBLE — ROUND OVER*\nLetters: ${g.rack.join(" ")}\n\n${lines.join("\n")}\n\n🏆 @${userPart(winner.jid)} wins the round!`, mentions: rows.slice(0, 8).map(p => p.jid) };
}

// ── whot UI ─────────────────────────────────────────────────────────────────
function whotView(s, extra = "") {
  const t = W.top(s);
  const hand = s.hands.p.map((c, i) => `${i + 1}) ${W.cardText(c)}`).join("\n");
  const log = s.log.length ? s.log.map(l => `• ${l}`).join("\n") + "\n\n" : "";
  const callNote = s.call ? `  → shape: ${W.ICON[s.call]} ${s.call}` : "";
  let prompt;
  if (s.pending > 0) prompt = `⚠️ Fight back with a *${s.pendingNum}* or draw *${s.pending}*: *.whot draw*`;
  else prompt = "Your move: *.whot <card number>*  or  *.whot draw*";
  return `🃏 *NAIJA WHOT*\n\n${log}Top card: *${W.cardText(t)}*${callNote}\nBot has *${s.hands.ai.length}* cards\n\n*Your cards*\n${hand}\n\n${extra || prompt}`;
}

// ── plugin ──────────────────────────────────────────────────────────────────
export default {
  command: [
    "wordscramble", "scramble",
    "scrabble", "wordscrabble",
    "sudoku", "sudokugame",
    "snake", "snakegame",
    "whot", "naijawhot", "whotgame",
  ],

  async run({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid }) {
    const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
    const args = body.trim().split(/\s+/).slice(1);
    const sub = (args[0] || "").toLowerCase();
    const me = msg.key.participant || senderJid;
    const key = userPart(me);
    const tag = (jid) => `@${userPart(jid)}`;
    const game = ["wordscramble", "scramble"].includes(cmd) ? "scramble"
      : ["scrabble", "wordscrabble"].includes(cmd) ? "scrabble"
      : ["sudoku", "sudokugame"].includes(cmd) ? "sudoku"
      : ["snake", "snakegame"].includes(cmd) ? "snake" : "whot";

    // ══ SCRAMBLE ═════════════════════════════════════════════════════════════
    if (game === "scramble") {
      const g = scramble[from];
      if (sub === "top") return reply(boardText("SCRAMBLE LEADERBOARD", board(from, "scramble")), { mentions: board(from, "scramble").map(r => r.jid) });
      if (sub === "stop" || sub === "skip") {
        if (!g) return reply("There is no scramble running.");
        if (g.by !== key && !isOwner) return reply(`Only ${tag(g.starter)} can end this round.`, { mentions: [g.starter] });
        endScramble(from, "stop");
        return reply("🛑 Round ended.");
      }
      if (sub === "hint") {
        if (!g) return reply("No scramble is running. Start one with .scramble");
        g.hints = Math.min(g.hints + 1, g.word.length - 2);
        const pattern = [...g.word].map((c, i) => (i < g.hints ? c.toUpperCase() : "_")).join(" ");
        return reply(`💡 Hint: *${pattern}*\n_Each hint lowers the prize._`);
      }
      if (!g || sub === "new") {
        if (g) endScramble(from, "stop");
        const [word, category] = pick(WORD_LIST);
        let mixed = word;
        for (let i = 0; i < 20 && mixed === word; i++) mixed = shuffle([...word]).join("");
        const state = scramble[from] = { word, category, hints: 0, by: key, starter: me, sock, timer: null };
        state.timer = setTimeout(() => endScramble(from, "timeout"), SCRAMBLE_SECONDS * 1000);
        state.timer.unref?.();
        return reply(`🔀 *WORD SCRAMBLE*\n\nCategory: *${category}*\nLetters: *${[...mixed].join(" ").toUpperCase()}* (${word.length} letters)\n\nType *.scramble <your answer>* — ${SCRAMBLE_SECONDS} seconds!\nNeed help? *.scramble hint*`);
      }
      const guess = args.join("").toLowerCase();
      if (!/^[a-z]+$/.test(guess)) return reply("Type the word like this: *.scramble elephant*");
      if (guess !== g.word) return reply("❌ Not it. Try again!");
      const prize = Math.max(1, 3 - g.hints);
      const total = addPoints(from, "scramble", me, prize);
      endScramble(from, "won");
      return reply(`✅ ${tag(me)} got it! The word was *${g.word.toUpperCase()}*\n+${prize} point${prize > 1 ? "s" : ""} (total ${total})`, { mentions: [me] });
    }

    // ══ SCRABBLE ═════════════════════════════════════════════════════════════
    if (game === "scrabble") {
      const g = scrabble[from];
      if (sub === "top") return reply(boardText("SCRABBLE WINS", board(from, "scrabble"), "wins"), { mentions: board(from, "scrabble").map(r => r.jid) });
      if (sub === "end" || sub === "stop") {
        if (!g) return reply("There is no scrabble round running.");
        if (g.by !== key && !isOwner) return reply(`Only ${tag(g.starter)} can end this round.`, { mentions: [g.starter] });
        const res = finishScrabble(from);
        return sock.sendMessage(from, { text: res.text, mentions: res.mentions });
      }
      if (!g || sub === "new") {
        if (g) finishScrabble(from);
        const rack = drawRack();
        const state = scrabble[from] = { rack, players: {}, used: new Set(), by: key, starter: me, timer: null };
        state.timer = setTimeout(() => {
          const res = finishScrabble(from);
          if (res) sock.sendMessage(from, { text: res.text, mentions: res.mentions }).catch(() => {});
        }, SCRABBLE_SECONDS * 1000);
        state.timer.unref?.();
        return reply(`🔤 *SCRABBLE* — ${SCRABBLE_SECONDS} seconds\n\nYour letters:\n*${rack.join("  ")}*\n\nMake words (3–7 letters) with these letters.\nSend them like *.scrabble stone*\nPoints = letter values. A 7-letter word gets +20!\nI check words in an online dictionary.`);
      }
      if (sub === "rack") return reply(`🔤 Letters: *${g.rack.join("  ")}*`);
      const word = args.join("").toUpperCase();
      if (!/^[A-Z]+$/.test(word)) return reply("Send one word, letters only. Example: *.scrabble stone*");
      if (word.length < 3 || word.length > 7) return reply("Words must be 3 to 7 letters long.");
      if (!canMake(word, g.rack)) return reply(`❌ You can't make *${word}* from ${g.rack.join(" ")}`);
      if (g.used.has(word)) return reply(`⚠️ *${word}* was already played this round.`);
      let real;
      try { real = await checkWord(word); }
      catch { return reply("⚠️ I couldn't reach the dictionary right now. Try that word again in a moment."); }
      if (!real) return reply(`❌ *${word}* is not in the dictionary.`);
      g.used.add(word);
      const p = (g.players[key] ||= { jid: me, words: [], total: 0 });
      const pts = wordScore(word);
      p.words.push(word); p.total += pts; p.jid = me;
      return reply(`✅ *${word}* +${pts} points${word.length === 7 ? " 🎉 all 7 letters!" : ""}\n${tag(me)} now has *${p.total}*`, { mentions: [me] });
    }

    // ══ SUDOKU ═══════════════════════════════════════════════════════════════
    if (game === "sudoku") {
      const st = sudoku[from];
      if (sub === "new" || (!st && !sub) || (!st && LEVELS[sub])) {
        const level = LEVELS[args[sub === "new" ? 1 : 0]?.toLowerCase()] ? args[sub === "new" ? 1 : 0].toLowerCase() : "medium";
        const { solution, puzzle } = makePuzzle(level);
        sudoku[from] = { solution, puzzle, grid: puzzle.map(r => [...r]), mistakes: 0, hints: 0, level, by: {} };
        return reply(`🧩 *SUDOKU — ${level}*\n${sudokuText(sudoku[from])}\nFill a cell: *.sudoku b4 7*  (row B, column 4, number 7)\nMore: *.sudoku hint* · *.sudoku solve* · *.sudoku new hard*`);
      }
      if (!st) return reply("No sudoku running. Start with *.sudoku* (or *.sudoku easy|medium|hard*).");
      if (!sub) return reply(`🧩 *SUDOKU — ${st.level}*\n${sudokuText(st)}\n${sudokuLeft(st)} cells left · mistakes ${st.mistakes}`);
      if (sub === "solve" || sub === "giveup") {
        const text = sudokuText({ grid: st.solution });
        delete sudoku[from];
        return reply(`🏳️ *Solution*\n${text}`);
      }
      const finish = () => {
        const who = Object.values(st.by).sort((a, b) => b.n - a.n).map(p => `${tag(p.jid)} (${p.n})`).join(", ");
        delete sudoku[from];
        return reply(`🎉 *SUDOKU SOLVED!*\nMistakes: ${st.mistakes} · hints: ${st.hints}\nSolved by: ${who || "everyone"}`, { mentions: Object.values(st.by).map(p => p.jid) });
      };
      if (sub === "hint") {
        const empty = [];
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!st.grid[r][c]) empty.push([r, c]);
        const [r, c] = empty[rand(empty.length)];
        st.grid[r][c] = st.solution[r][c]; st.hints++;
        if (!sudokuLeft(st)) return finish();
        return reply(`💡 Filled *${ROWS[r]}${c + 1}* = ${st.solution[r][c]}\n${sudokuText(st)}`);
      }
      const m = args.join(" ").toLowerCase().match(/^([a-i1-9])\s*([1-9])\s*[= ]?\s*([1-9])$/);
      if (!m) return reply("Use row letter + column number + digit:\n*.sudoku b4 7*");
      const r = /[a-i]/.test(m[1]) ? ROWS.indexOf(m[1].toUpperCase()) : +m[1] - 1;
      const c = +m[2] - 1, v = +m[3];
      if (st.puzzle[r][c]) return reply(`⚠️ *${ROWS[r]}${c + 1}* is part of the puzzle and can't change.`);
      if (st.solution[r][c] !== v) { st.mistakes++; return reply(`❌ ${v} doesn't go in *${ROWS[r]}${c + 1}*. Mistakes: ${st.mistakes}`); }
      if (!st.grid[r][c]) { const p = (st.by[key] ||= { jid: me, n: 0 }); p.n++; p.jid = me; }
      st.grid[r][c] = v;
      if (!sudokuLeft(st)) return finish();
      return reply(`✅ *${ROWS[r]}${c + 1}* = ${v}\n${sudokuText(st)}\n${sudokuLeft(st)} cells left`);
    }

    // ══ SNAKE ════════════════════════════════════════════════════════════════
    if (game === "snake") {
      const st = snake[from];
      if (sub === "top") return reply(boardText("SNAKE HIGH SCORES", board(from, "snake")), { mentions: board(from, "snake").map(r => r.jid) });
      if (sub === "stop") { if (!st) return reply("No snake game running."); delete snake[from]; return reply(`🛑 Game ended. Final score *${st.score}*`); }
      const letters = [...args.join("").toLowerCase()].length && DIR_WORDS[sub] ? [DIR_WORDS[sub]] : [...args.join("").toLowerCase()].filter(ch => DIRS[ch]);
      if (!st || sub === "new") {
        const s = snake[from] = { body: [{ x: 3, y: 4 }, { x: 2, y: 4 }], dir: "d", apple: null, score: 0, over: false };
        s.apple = snakeApple(s);
        return reply(`🐍 *SNAKE*\n\n${snakeText(s)}\n\nMove with *w a s d* (up, left, down, right). Send several at once: *.snake dddw*`);
      }
      if (!letters.length) return reply(`🐍 *SNAKE*\n\n${snakeText(st)}\n\nMove with *w a s d*. Example: *.snake ddw*`);
      for (const ch of letters.slice(0, 8)) {
        const [dx, dy] = DIRS[ch];
        const [cx, cy] = DIRS[st.dir];
        if (dx === -cx && dy === -cy && st.body.length > 1) continue;      // can't reverse into yourself
        st.dir = ch;
        const head = { x: st.body[0].x + dx, y: st.body[0].y + dy };
        const hitsWall = head.x < 0 || head.y < 0 || head.x >= SN || head.y >= SN;
        const willEat = st.apple && head.x === st.apple.x && head.y === st.apple.y;
        const bodyToCheck = willEat ? st.body : st.body.slice(0, -1);       // tail moves away unless we grow
        if (hitsWall || bodyToCheck.some(b => b.x === head.x && b.y === head.y)) { st.over = true; if (!hitsWall) st.body.unshift(head); break; }
        st.body.unshift(head);
        if (willEat) { st.score++; st.apple = snakeApple(st); if (!st.apple) { st.over = true; st.won = true; break; } }
        else st.body.pop();
      }
      if (st.over) {
        delete snake[from];
        const { best, isNew } = setBest(from, "snake", me, st.score);
        return reply(`${snakeText(st)}\n\n${st.won ? "🏆 *You filled the whole board!*" : "💥 *Game over!*"}\nScore *${st.score}* ${isNew && st.score ? "— new personal best! 🎉" : `(your best ${best})`}\nPlay again: *.snake*`);
      }
      return reply(snakeText(st));
    }

    // ══ WHOT ═════════════════════════════════════════════════════════════════
    if (sub === "rules") return reply(W.RULES);
    if (sub === "top") return reply(boardText("WHOT WINS", board(from, "whot"), "wins"), { mentions: board(from, "whot").map(r => r.jid) });
    let s = whot[from]?.state;
    const owner = whot[from];
    if (sub === "stop") {
      if (!owner) return reply("No Whot game running.");
      if (owner.by !== key && !isOwner) return reply(`This game belongs to ${tag(owner.starter)}.`, { mentions: [owner.starter] });
      delete whot[from];
      return reply("🛑 Whot game ended.");
    }
    if (!owner || sub === "new") {
      const state = W.newGame();
      whot[from] = { state, by: key, starter: me };
      return reply(whotView(state, "Your move: *.whot <card number>*  or  *.whot draw*\n(Whot 🃏 cards need a shape: *.whot 3 circle*)\nRules: *.whot rules*"), {});
    }
    if (owner.by !== key) return reply(`🃏 This game belongs to ${tag(owner.starter)}. Start your own in a private chat or after they finish.`, { mentions: [owner.starter] });
    s = owner.state;
    s.log = [];
    if (!sub) return reply(whotView(s));

    let result;
    if (sub === "draw" || sub === "market") result = W.market(s, "p");
    else {
      const n = parseInt(sub === "play" ? args[1] : sub, 10);
      const shape = (sub === "play" ? args[2] : args[1])?.toLowerCase();
      if (!n) return reply("Use *.whot <card number>* or *.whot draw*. Cards are numbered in your hand.");
      result = W.play(s, "p", n - 1, shape);
    }
    if (!result.ok) return reply(`⚠️ ${result.error}`);
    if (!s.over && s.turn === "ai") W.botTurns(s);
    if (s.over) {
      const text = whotView(s, s.winner === "p" ? "🏆 *YOU WIN!*" : "🤖 *The bot wins this one.* Try again!");
      delete whot[from];
      if (s.winner === "p") addPoints(from, "whot", me, 1);
      return reply(text + (s.winner === "p" ? "\nPoint added to .whot top" : "") + "\nPlay again: *.whot*");
    }
    return reply(whotView(s));
  },
};

// exposed for tests
export const __games = { makePuzzle, solveCount, checkWord, canMake, wordScore, drawRack, scramble, scrabble, sudoku, snake, whot, sudokuText, WORD_LIST, endScramble, finishScrabble, dictCache };
