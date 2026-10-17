import axios from "axios";

const OMEGA = "https://omegatech-api.dixonomega.tech";

// ─── Per-user conversation memory ────────────────────────────────────────────
const memory = new Map();

function getHistory(jid) { return memory.get(jid) || []; }
function addToHistory(jid, role, text) {
  const h = getHistory(jid);
  h.push({ role, text });
  if (h.length > 20) h.splice(0, h.length - 20);
  memory.set(jid, h);
}
function clearHistory(jid) { memory.delete(jid); }
function buildContext(jid, newPrompt) {
  const h = getHistory(jid);
  if (!h.length) return newPrompt;
  const ctx = h.map(x => `${x.role === "user" ? "User" : "Assistant"}: ${x.text}`).join("\n");
  return `${ctx}\nUser: ${newPrompt}`;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function get(url) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return res.data;
}

// ─── AI ENGINES ───────────────────────────────────────────────────────────────

// ✅ Claude Pro — action=chat&prompt=... → d.response
async function askClaude(prompt) {
  const d = await get(`${OMEGA}/api/ai/Claude-pro?action=chat&prompt=${encodeURIComponent(prompt)}`);
  if (d?.success && d?.response) return { text: d.response, engine: "Claude Pro 🤖" };
  throw new Error(d?.error || "Claude-pro failed");
}

// ✅ Gemini Pro — ?message=... → d.answer
async function askGeminiPro(prompt) {
  const d = await get(`${OMEGA}/api/ai/gemini-pro?message=${encodeURIComponent(prompt)}`);
  if (d?.success && d?.answer) return { text: d.answer, engine: "Gemini Pro 🌟" };
  throw new Error(d?.error || "gemini-pro failed");
}

// Fallback — siputzx gemini
async function askGeminiFallback(prompt) {
  const d = await get(`https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(prompt)}`);
  if (d?.status && d?.data) return { text: d.data, engine: "Gemini 🌟" };
  throw new Error("gemini fallback failed");
}

// Fallback — GPT ryzendesu
async function askGptFallback(prompt) {
  const d = await get(`https://api.ryzendesu.vip/api/ai/chatgpt?text=${encodeURIComponent(prompt)}`);
  if (d?.data) return { text: d.data, engine: "ChatGPT 💬" };
  throw new Error("gpt fallback failed");
}

// ─── RESOLVER — tries engines in order ───────────────────────────────────────
async function resolveAI(mode, prompt) {
  const errors = [];
  const order = {
    claude: [askClaude, askGeminiPro, askGptFallback],
    gemini: [askGeminiPro, askGeminiFallback, askClaude],
    gpt:    [askGptFallback, askClaude, askGeminiPro],
    auto:   [askClaude, askGeminiPro, askGptFallback]
  }[mode] || [askClaude, askGeminiPro, askGptFallback];

  for (const fn of order) {
    try { return await fn(prompt); } catch (e) { errors.push(e.message); }
  }
  throw new Error("All AI engines failed:\n" + errors.join("\n"));
}

// ─── PLUGIN ───────────────────────────────────────────────────────────────────
export default {
  command: [
    "ai", "ask", "chatgpt",
    "claude", "claude3", "gem",
    "aiclear", "clearai"],

  async run({ sock, msg, from, cmd, body, senderJid }) {
    const input   = body.trim().split(" ").slice(1).join(" ").trim();
    const reply   = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });
    const react   = (e) => sock.sendMessage(from, { react: { text: e, key: msg.key } }).catch(() => {});
    const userJid = senderJid || from;

    // ── Clear memory ──────────────────────────────────────────────────────────
    if (["aiclear", "clearai"].includes(cmd)) {
      clearHistory(userJid);
      return reply(
        `🧹 *AI MEMORY CLEARED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Your conversation history has been reset.\n` +
        `Start fresh with any AI command! 🚀`
      );
    }

    // ── AI Status ─────────────────────────────────────────────────────────────
    if (cmd === "aistatus") {
      const hist = getHistory(userJid);
      return reply(
        `🤖 *AI STATUS*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 Your memory : ${Math.floor(hist.length / 2)} exchanges\n` +
        `🔌 Engines     : Claude Pro, Gemini Pro, GPT\n` +
        `📡 Provider    : OmegaTech + Fallbacks\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Commands:*\n` +
        `▸ .claude <msg>  — Claude Pro 🤖\n` +
        `▸ .gemini <msg>  — Gemini Pro 🌟\n` +
        `▸ .gpt <msg>     — ChatGPT 💬\n` +
        `▸ .ai <msg>      — Auto best engine\n` +
        `▸ .aiclear       — Reset memory 🧹`
      );
    }

    // ── Require prompt ────────────────────────────────────────────────────────
    if (!input) {
      return reply(
        `🤖 *AI CHAT*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Usage: *.${cmd}* <your message>\n\n` +
        `*Available engines:*\n` +
        `▸ .claude <msg>  — Claude Pro 🤖\n` +
        `▸ .gemini <msg>  — Gemini Pro 🌟\n` +
        `▸ .gpt <msg>     — ChatGPT 💬\n` +
        `▸ .ai <msg>      — Auto select\n\n` +
        `*Memory:*\n` +
        `▸ .aistatus      — Check status\n` +
        `▸ .aiclear       — Reset memory`
      );
    }

    // ── Pick engine ───────────────────────────────────────────────────────────
    const mode = ["claude","claude3"].includes(cmd) ? "claude"
               : ["gemini","gem"].includes(cmd)     ? "gemini"
               : ["gpt","chatgpt"].includes(cmd)    ? "gpt"
               : "auto";

    // Build prompt with memory
    const fullPrompt = buildContext(userJid, input);

    await react("⏳");

    try {
      const { text, engine } = await resolveAI(mode, fullPrompt);

      // Save to memory
      addToHistory(userJid, "user", input);
      addToHistory(userJid, "assistant", text.slice(0, 500));

      await react("✅");

      const hist = getHistory(userJid);
      const memNote = hist.length >= 4
        ? `\n\n_💭 ${Math.floor(hist.length / 2)} exchanges in memory • .aiclear to reset_`
        : "";

      return reply(
        `*${engine}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${text.trim()}` +
        `${memNote}`
      );

    } catch (err) {
      await react("❌");
      console.error(`[ai.js] ${err.message}`);
      return reply(
        `❌ *AI FAILED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${err.message.split("\n")[0]}\n\n` +
        `Try: .claude / .gemini / .gpt`
      );
    }
  }
};
