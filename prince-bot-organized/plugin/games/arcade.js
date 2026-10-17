// ─────────────────────────────────────────────────────────────────────────────
//  ARCADE — five turn-based text arcade games (original code for this bot).
//
//  .cyber    (.cybergame, .neonrunner)       dodge traffic on a 3-lane road
//  .dash     (.dashgame, .ninjadash)         run and jump over spikes
//  .matrix   (.matrixgame, .spaceshooter)    shoot the falling invaders
//  .doom     (.doomgame, .redzone)           fight off a corridor of demons
//  .vampire  (.vampiregame, .nightvamp)      survive the night until dawn
//
//  Send several moves in one message, e.g. ".cyber lrs".  Scores: <game> top
//  Anyone in the chat can play the running game. Works in groups and DMs.
// ─────────────────────────────────────────────────────────────────────────────
import { userPart, setBest, board, boardText } from "../../utils/gameKit.js";
import { ARCADE } from "../../utils/arcadeEngines.js";

const ALIASES = {
  cyber: ["cyber", "cybergame", "neonrunner", "cyberrun"],
  dash: ["dash", "dashgame", "ninjadash", "cursedashgame"],
  matrix: ["matrix", "matrixgame", "spaceshooter"],
  doom: ["doom", "doomgame", "redzone"],
  vampire: ["vampire", "vampiregame", "nightvamp"],
};
const MAX_MOVES = 8;
const gameOf = (cmd) => Object.keys(ALIASES).find(g => ALIASES[g].includes(cmd));

const running = {};                                    // `${game}:${chat}` -> { state, by }

export default {
  command: Object.values(ALIASES).flat(),

  async run({ sock, msg, from, body, cmd, senderJid }) {
    const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
    const name = gameOf(cmd);
    const G = ARCADE[name];
    const args = body.trim().split(/\s+/).slice(1);
    const sub = (args[0] || "").toLowerCase();
    const me = msg.key.participant || senderJid;
    const slot = `${name}:${from}`;
    let run = running[slot];

    if (sub === "top") {
      const rows = board(from, name);
      return reply(boardText(`${G.title} — BEST SCORES`, rows), { mentions: rows.map(r => r.jid) });
    }
    if (sub === "stop" || sub === "quit") {
      if (!run) return reply("No game is running.");
      delete running[slot];
      return reply(`🛑 Game ended. Score *${run.state.score}*`);
    }
    if (sub === "help" || sub === "how") return reply(`${G.title}\n\n${G.help}`);

    if (!run || sub === "new") {
      run = running[slot] = { state: G.create(), by: me };
      return reply(`${G.title}\n\n${G.render(run.state)}\n\n${G.help}`);
    }

    const moves = [...args.join("").toLowerCase()].filter(ch => G.keys.includes(ch)).slice(0, MAX_MOVES);
    if (!moves.length) return reply(`${G.title}\n\n${G.render(run.state)}\n\nMoves: ${[...G.keys].map(k => `*${k}*`).join(" ")}`);

    for (const k of moves) {
      G.step(run.state, k);
      if (run.state.over) break;
    }
    const text = `${G.title}\n\n${G.render(run.state)}`;
    if (!run.state.over) return reply(text);

    delete running[slot];
    const { best, isNew } = setBest(from, name, me, run.state.score);
    const verdict = run.state.won ? "🏆 *You win!*" : "💥 *Game over!*";
    return reply(`${text}\n\n${verdict}  ${isNew ? "New personal best! 🎉" : `Your best: ${best}`}\nPlay again: *.${name}*`);
  },
};

// exposed for tests
export const __arcade = { running, gameOf, ALIASES };
