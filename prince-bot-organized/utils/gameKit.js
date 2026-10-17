// Shared helpers for the chat games (scores, random numbers, small utils).
// Scores are saved to ./data/game-scores.json, per chat, per game.
import fs from "fs";
import path from "path";

const FILE = "./data/game-scores.json";
let DB = {};
let dirty = false;
try { if (fs.existsSync(FILE)) DB = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
function flush() {
  if (!dirty) return;
  dirty = false;
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(DB)); }
  catch (e) { console.log("[gameKit] save failed:", e.message); }
}
setInterval(flush, 15000).unref?.();
process.once("beforeExit", flush);

/** Random source. Tests replace rng.next with a seeded function. */
export const rng = { next: () => Math.random() };
export const rand = (n) => Math.floor(rng.next() * n);
export const pick = (arr) => arr[rand(arr.length)];
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const userPart = (jid) => String(jid || "").split("@")[0].split(":")[0].trim();

function slot(chat, game) {
  const c = (DB[chat] ||= {});
  return (c[game] ||= {});
}

/** Add points for a player. Returns their new total. */
export function addPoints(chat, game, jid, n = 1) {
  const e = (slot(chat, game)[userPart(jid)] ||= { value: 0, jid });
  e.value += n; e.jid = jid; dirty = true;
  return e.value;
}

/** Keep a personal best. Returns { best, isNew }. */
export function setBest(chat, game, jid, score) {
  const e = (slot(chat, game)[userPart(jid)] ||= { value: 0, jid });
  e.jid = jid;
  if (score > e.value) { e.value = score; dirty = true; return { best: score, isNew: true }; }
  return { best: e.value, isNew: false };
}

/** Top players for a game in this chat: [{ jid, value }]. */
export function board(chat, game, n = 10) {
  return Object.values(slot(chat, game)).sort((a, b) => b.value - a.value).slice(0, n);
}

export const MEDALS = ["🥇", "🥈", "🥉"];
export function boardText(title, rows, unit = "pts") {
  if (!rows.length) return `🏆 *${title}*\n\nNobody has scored yet.`;
  const lines = rows.map((r, i) => `${MEDALS[i] || `*${i + 1}.*`} @${userPart(r.jid)} — ${r.value} ${unit}`);
  return `🏆 *${title}*\n\n${lines.join("\n")}`;
}
