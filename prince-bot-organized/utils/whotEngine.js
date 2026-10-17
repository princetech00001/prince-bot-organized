// Naija Whot — rules engine (pure logic, no WhatsApp code). Player vs the bot.
//
// Deck (54): circle 12, triangle 12, cross 9, square 9, star 7, whot(20) 5.
// Special cards:
//   1  Hold On        play again
//   2  Pick Two       next player draws 2 (or counters with another 2)
//   5  Pick Three     next player draws 3 (or counters with another 5)
//   8  Suspension     next player misses a turn (you play again)
//   14 General Market opponent draws 1 (you play again)
//   20 Whot           can be played on anything; you call the next shape
import { rand, shuffle } from "./gameKit.js";

export const SHAPES = ["circle", "triangle", "cross", "square", "star"];
export const ICON = { circle: "⭕", triangle: "🔺", cross: "❌", square: "🟦", star: "⭐", whot: "🃏" };
const NUMBERS = {
  circle:   [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross:    [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square:   [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star:     [1, 2, 3, 4, 5, 7, 8],
};
const SPECIAL = new Set([1, 2, 5, 8, 14, 20]);
const HAND_SIZE = 6;

export const cardText = (c) => (c.shape === "whot" ? "🃏 Whot 20" : `${ICON[c.shape]} ${c.num}`);

export function newDeck() {
  const d = [];
  for (const s of SHAPES) for (const n of NUMBERS[s]) d.push({ shape: s, num: n });
  for (let i = 0; i < 5; i++) d.push({ shape: "whot", num: 20 });
  return d;
}

export function newGame() {
  const deck = shuffle(newDeck());
  const state = { deck, discard: [], hands: { p: [], ai: [] }, turn: "p", call: null, pending: 0, pendingNum: null, over: false, winner: null, log: [] };
  for (let i = 0; i < HAND_SIZE; i++) { state.hands.p.push(state.deck.pop()); state.hands.ai.push(state.deck.pop()); }
  // first card: a plain (non-special) card
  let idx = state.deck.findIndex(c => !SPECIAL.has(c.num));
  if (idx < 0) idx = 0;
  state.discard.push(state.deck.splice(idx, 1)[0]);
  return state;
}

export const top = (s) => s.discard[s.discard.length - 1];
export const currentShape = (s) => s.call || top(s).shape;
const other = (w) => (w === "p" ? "ai" : "p");

export function drawCards(s, who, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!s.deck.length && s.discard.length > 1) {
      const keep = s.discard.pop();
      s.deck = shuffle(s.discard);
      s.discard = [keep];
    }
    if (!s.deck.length) break;                 // nothing left anywhere
    s.hands[who].push(s.deck.pop());
    got++;
  }
  return got;
}

export function canPlay(s, card) {
  if (s.pending > 0) return card.num === s.pendingNum;      // must counter (or draw)
  if (card.shape === "whot") return true;
  return card.shape === currentShape(s) || card.num === top(s).num;
}

export const playable = (s, who) => s.hands[who].map((c, i) => [c, i]).filter(([c]) => canPlay(s, c)).map(([, i]) => i);

/** Play card #index (0-based) from `who`'s hand. Returns { ok, error?, extra? }. */
export function play(s, who, index, shape = null) {
  if (s.over) return { ok: false, error: "The game is over." };
  if (s.turn !== who) return { ok: false, error: "It is not your turn." };
  const card = s.hands[who][index];
  if (!card) return { ok: false, error: "You don't have that card number." };
  if (!canPlay(s, card)) {
    const t = top(s);
    return { ok: false, error: s.pending > 0
      ? `You must play a ${s.pendingNum} to fight back, or draw ${s.pending} cards.`
      : s.call
        ? `Play a ${ICON[s.call]} ${s.call} card (or a Whot).`
        : `Play a ${ICON[t.shape]} card or a ${t.num} (or a Whot).` };
  }
  if (card.shape === "whot" && !SHAPES.includes(shape)) return { ok: false, error: "A Whot card needs a shape: circle, triangle, cross, square or star." };

  s.hands[who].splice(index, 1);
  s.discard.push(card);
  s.call = card.shape === "whot" ? shape : null;
  const name = who === "p" ? "You" : "Bot";
  s.log.push(`${name} played ${cardText(card)}${card.shape === "whot" ? ` and called ${ICON[shape]} ${shape}` : ""}`);

  let extra = false;
  if (card.num === 2) { s.pending += 2; s.pendingNum = 2; }
  else if (card.num === 5) { s.pending += 3; s.pendingNum = 5; }
  else if (card.num === 1) { extra = true; s.log.push(`${name} ${who === "p" ? "play" : "plays"} again (Hold On)`); }
  else if (card.num === 8) { extra = true; s.log.push(`${who === "p" ? "Bot" : "You"} miss a turn (Suspension)`); }
  else if (card.num === 14) {
    const got = drawCards(s, other(who), 1);
    extra = true; s.log.push(`General Market: ${who === "p" ? "Bot" : "You"} draw ${got} card`);
  }

  if (s.hands[who].length === 0) { s.over = true; s.winner = who; return { ok: true, extra: false }; }
  if (s.hands[who].length === 1) s.log.push(`${who === "p" ? "⚠️ You have" : "⚠️ Bot has"} LAST CARD!`);
  if (!extra) s.turn = other(who);
  return { ok: true, extra };
}

/** Draw (market). If a Pick penalty is pending, take it; otherwise draw one card. Turn passes. */
export function market(s, who) {
  if (s.over) return { ok: false, error: "The game is over." };
  if (s.turn !== who) return { ok: false, error: "It is not your turn." };
  const name = who === "p" ? "You" : "Bot";
  if (s.pending > 0) {
    const got = drawCards(s, who, s.pending);
    s.log.push(`${name} ${who === "p" ? "draw" : "draws"} ${got} cards (penalty)`);
    s.pending = 0; s.pendingNum = null;
  } else {
    const got = drawCards(s, who, 1);
    s.log.push(`${name} ${who === "p" ? "go" : "goes"} to market (${got} card)`);
  }
  s.turn = other(who);
  return { ok: true };
}

/** The bot takes its turn(s) until it is the player's turn or the game ends. */
export function botTurns(s) {
  let guard = 0;
  while (s.turn === "ai" && !s.over && guard++ < 30) {
    const options = playable(s, "ai");
    if (!options.length) { market(s, "ai"); continue; }
    const hand = s.hands.ai;
    const score = (i) => {
      const n = hand[i].num;
      if (hand[i].shape === "whot") return (hand.length === 1 || s.hands.p.length <= 2) ? 50 : 1;   // keep Whot for later
      if (n === 14) return 40;
      if (n === 2 || n === 5) return 35;
      if (n === 1 || n === 8) return 30;
      return 10 + hand.filter(c => c.shape === hand[i].shape).length;                        // dump the biggest shape group
    };
    const best = options.sort((a, b) => score(b) - score(a) || a - b)[0];
    let shape = null;
    if (hand[best].shape === "whot") {
      const counts = {};
      hand.forEach((c, i) => { if (i !== best && c.shape !== "whot") counts[c.shape] = (counts[c.shape] || 0) + 1; });
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      shape = sorted.length ? sorted[0][0] : SHAPES[rand(SHAPES.length)];
    }
    play(s, "ai", best, shape);
  }
}

export const RULES = `🃏 *NAIJA WHOT — RULES*

Match the top card by *shape* or *number*. First to empty their hand wins.

*1* Hold On — play again
*2* Pick Two — opponent draws 2 (or fights back with a 2)
*5* Pick Three — opponent draws 3 (or fights back with a 5)
*8* Suspension — opponent misses a turn
*14* General Market — opponent draws 1, you play again
*🃏 20* Whot — play it on anything and call a shape

Can't play? Go to market with *.whot draw*.
Say "last card" is automatic, the bot announces it for you.`;
