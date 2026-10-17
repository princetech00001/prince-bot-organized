import TelegramBot from "node-telegram-bot-api";
import path from "path";
import { fileURLToPath } from "url";
import { BOT_CONFIG } from "../config.js";
import { startSession, listSessions, ensurePluginsLoaded, listPluginCommands } from "../whatsapp/sessionManager.js";
import * as store from "./store.js";
import { fancy } from "../utils/fancyFont.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNER_PATH = path.join(__dirname, "..", "assets", "prince_banner.png");

const startedAt = Date.now();

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function isAdmin(telegramId) {
  return (BOT_CONFIG.TELEGRAM_ADMIN_IDS || []).map(String).includes(String(telegramId));
}

// ── Update de-duplication ────────────────────────────────────────────────
// If the process crashes and restarts mid-poll (e.g. a WhatsApp-side crash
// that also brings the whole node process down), Telegram can redeliver the
// last update on the next getUpdates() call — which otherwise means a command
// runs twice. This guards every handler with a short-lived seen-set.
const seenUpdates = new Set();
function seenBefore(msg) {
  const key = `${msg.chat.id}:${msg.message_id}`;
  if (seenUpdates.has(key)) return true;
  seenUpdates.add(key);
  if (seenUpdates.size > 500) {
    const first = seenUpdates.values().next().value;
    seenUpdates.delete(first);
  }
  return false;
}
function onceText(bot, regex, handler) {
  bot.onText(regex, async (msg, match) => {
    if (seenBefore(msg)) return;
    try { await handler(msg, match); } catch (e) { console.error("[TG] handler error:", e.message); }
  });
}

// ── Force-join (channel/group subscription gate) ────────────────────────────
async function checkForceJoin(bot, telegramId) {
  const targets = [BOT_CONFIG.TELEGRAM_FORCE_CHANNEL, BOT_CONFIG.TELEGRAM_FORCE_GROUP].filter(Boolean);
  if (targets.length === 0) return { ok: true, missing: [] };

  const missing = [];
  for (const target of targets) {
    try {
      const member = await bot.getChatMember(target, telegramId);
      if (!["member", "administrator", "creator"].includes(member.status)) missing.push(target);
    } catch {
      // If the bot can't check (not an admin there, wrong username, etc.),
      // don't hard-block the user over a misconfiguration.
    }
  }
  return { ok: missing.length === 0, missing };
}

function forceJoinKeyboard() {
  const rows = [];
  if (BOT_CONFIG.TELEGRAM_FORCE_CHANNEL) {
    rows.push([{ text: "📢 Join Channel", url: `https://t.me/${BOT_CONFIG.TELEGRAM_FORCE_CHANNEL.replace("@", "")}` }]);
  }
  if (BOT_CONFIG.TELEGRAM_FORCE_GROUP) {
    rows.push([{ text: "👥 Join Group", url: `https://t.me/${BOT_CONFIG.TELEGRAM_FORCE_GROUP.replace("@", "")}` }]);
  }
  rows.push([{ text: "✅ I've Joined", callback_data: "check_join" }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function mainMenuKeyboard(telegramId) {
  const rows = [
    [{ text: "🔗 Pair WhatsApp", callback_data: "act_pair" }, { text: "📋 Menu", callback_data: "act_menu" }],
    [{ text: "ℹ️ My Info", callback_data: "act_info" }, { text: "⏱ Uptime", callback_data: "act_uptime" }],
    [{ text: "🟢 Online", callback_data: "act_online" }]
  ];
  if (isAdmin(telegramId)) {
    rows.push([{ text: "👥 Sessions", callback_data: "act_sessions" }, { text: "📢 Broadcast", callback_data: "act_broadcast" }]);
  }
  return { reply_markup: { inline_keyboard: rows } };
}

async function sendBanner(bot, chatId, caption, extra = {}) {
  return bot.sendPhoto(chatId, BANNER_PATH, { caption, parse_mode: "Markdown", ...extra }).catch(() =>
    bot.sendMessage(chatId, caption, { parse_mode: "Markdown", ...extra })
  );
}

function buildMenuCaption() {
  const p = BOT_CONFIG.PREFIX || ".";
  const cmds = listPluginCommands();
  const lines = cmds.map(c => `⭐ 👑 *${p}${c}*`).join("\n");
  return (
    `✨👑 *${fancy("PRINCE X UNKNOWN BOT")}* 👑✨\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `*${fancy("WhatsApp commands (once paired)")}:*\n\n` +
    `${lines}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_${fancy("pair your number with /pair to unlock these on WhatsApp")}_`
  );
}

export function startTelegramBot() {
  const bot = new TelegramBot(BOT_CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });
  console.log("✅ Telegram bot polling started");

  bot.on("polling_error", (err) => {
    // ETELEGRAM 409 Conflict specifically means a second instance of this
    // same bot token is already polling somewhere — a strong signal to check
    // for a duplicate/zombie process rather than a real network issue.
    console.error("[TG] polling_error:", err.message);
  });

  ensurePluginsLoaded();

  // Resume any WhatsApp sessions that were paired through Telegram before a restart
  for (const s of store.allSessions()) {
    startSession({
      id: s.sessionId,
      telegramUserId: s.telegramId,
      telegramUsername: s.telegramUsername
    }).catch(e => console.log("Resume session failed:", e.message));
  }

  bot.on("message", (msg) => {
    if (msg.from) store.touchUser(msg.from.id, msg.from.username);
  });

  // ── Inline button actions (shared by /start's keyboard and /menu) ────────
  async function runAction(bot, chatId, telegramId, username, action) {
    switch (action) {
      case "act_pair":
        return bot.sendMessage(chatId, "Send: /pair 2348012345678 (your WhatsApp number, country code, no + or spaces).");
      case "act_menu":
        return sendBanner(bot, chatId, buildMenuCaption());
      case "act_info": {
        const s = store.getSession(telegramId);
        if (!s) return bot.sendMessage(chatId, "ℹ️ You haven't paired a WhatsApp number yet. Use /pair <number>.");
        const live = listSessions().find(x => x.id === s.sessionId);
        return bot.sendMessage(
          chatId,
          `ℹ️ *Your session*\n📱 Number: ${s.phone}\n🔌 Status: ${live?.status || "unknown"}\n📅 Paired: ${new Date(s.pairedAt).toLocaleString()}`,
          { parse_mode: "Markdown" }
        );
      }
      case "act_uptime":
        return bot.sendMessage(chatId, `⏱️ Uptime: ${formatDuration(Date.now() - startedAt)}`);
      case "act_online": {
        const all = listSessions();
        const online = all.filter(s => s.status === "online").length;
        return bot.sendMessage(chatId, `🟢 Online: ${online}/${all.length} paired sessions`);
      }
      case "act_sessions": {
        if (!isAdmin(telegramId)) return bot.sendMessage(chatId, "🚫 Admins only.");
        const all = listSessions();
        if (!all.length) return bot.sendMessage(chatId, "No sessions paired yet.");
        const lines = all.map((s, i) =>
          `${i + 1}. 📱 ${s.phoneNumber || "?"} — ${s.pushname || "no name"} — ${s.status}` +
          (s.telegramUsername ? ` — @${s.telegramUsername}` : "")
        );
        return bot.sendMessage(chatId, `👥 *Paired sessions (${all.length}):*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
      }
      case "act_broadcast":
        if (!isAdmin(telegramId)) return bot.sendMessage(chatId, "🚫 Admins only.");
        return bot.sendMessage(chatId, "Usage: /broadcast Your message here");
    }
  }

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === "check_join") {
      const { ok } = await checkForceJoin(bot, query.from.id);
      await bot.answerCallbackQuery(query.id, {
        text: ok ? "✅ Verified! Send /start again." : "❌ You haven't joined yet.",
        show_alert: true
      });
      return;
    }
    if (query.data?.startsWith("act_")) {
      await bot.answerCallbackQuery(query.id).catch(() => {});
      await runAction(bot, chatId, query.from.id, query.from.username, query.data);
    }
  });

  // ── /start ───────────────────────────────────────────────────────────────
  onceText(bot, /^\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const { ok } = await checkForceJoin(bot, msg.from.id);
    if (!ok) {
      return bot.sendMessage(
        chatId,
        `🔒 *Join our channel & group first to use ${BOT_CONFIG.BOT_NAME}.*`,
        { parse_mode: "Markdown", ...forceJoinKeyboard() }
      );
    }

    const caption =
      `✨👑 *${BOT_CONFIG.BOT_NAME}* 👑✨\n\n` +
      `Pair your own WhatsApp number through this bot and get the full plugin menu ` +
      `running on your WhatsApp — no need to host anything yourself.\n\n` +
      `Tap a button below, or use the /commands directly.`;

    await sendBanner(bot, chatId, caption, mainMenuKeyboard(msg.from.id));
  });

  // ── /pair <number> ───────────────────────────────────────────────────────
  onceText(bot, /^\/pair(?:\s+(.+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const { ok } = await checkForceJoin(bot, telegramId);
    if (!ok) return bot.sendMessage(chatId, "🔒 Join our channel & group first — send /start.");

    const number = (match[1] || "").replace(/[^0-9]/g, "");
    if (!number || number.length < 8) {
      return bot.sendMessage(chatId, "❌ Usage: /pair 2348012345678 (your WhatsApp number, country code, no + or spaces).");
    }

    const existing = store.getSession(telegramId);
    const sessionId = existing?.sessionId || `tg-${telegramId}`;

    await bot.sendMessage(chatId, "⏳ Requesting a pairing code from WhatsApp...");

    startSession({
      id: sessionId,
      pairNumber: number,
      telegramUserId: telegramId,
      telegramUsername: msg.from.username,
      onPairingCode: (code) => {
        bot.sendMessage(
          chatId,
          `📲 *Pairing code:* \`${code}\`\n\nOn your phone: WhatsApp → Linked Devices → Link with phone number → enter this code.`,
          { parse_mode: "Markdown" }
        );
      },
      onOpen: () => {
        store.setSession(telegramId, { sessionId, phone: number, telegramUsername: msg.from.username, pairedAt: Date.now() });
        bot.sendMessage(chatId, `✅ Connected! Your WhatsApp now has the full command menu active — try *${BOT_CONFIG.PREFIX}menu* on WhatsApp.`, { parse_mode: "Markdown" });
      },
      onClose: (reason) => {
        if (reason === "logged_out") {
          store.removeSession(telegramId);
          bot.sendMessage(chatId, "🚫 Your WhatsApp session was logged out. Send /pair again to reconnect.");
        } else if (reason === "replaced") {
          bot.sendMessage(chatId, "⛔ This WhatsApp number is linked elsewhere too. Unlink the other one first, then /pair again.");
        }
      }
    }).catch(e => bot.sendMessage(chatId, `❌ Pairing failed: ${e.message}`));
  });

  // ── /menu ────────────────────────────────────────────────────────────────
  onceText(bot, /^\/menu$/, async (msg) => {
    await ensurePluginsLoaded();
    await sendBanner(bot, msg.chat.id, buildMenuCaption());
  });

  // ── /uptime ──────────────────────────────────────────────────────────────
  onceText(bot, /^\/uptime$/, (msg) => {
    bot.sendMessage(msg.chat.id, `⏱️ Uptime: ${formatDuration(Date.now() - startedAt)}`);
  });

  // ── /online ──────────────────────────────────────────────────────────────
  onceText(bot, /^\/online$/, (msg) => {
    const all = listSessions();
    const online = all.filter(s => s.status === "online").length;
    bot.sendMessage(msg.chat.id, `🟢 Online: ${online}/${all.length} paired sessions`);
  });

  // ── /info ────────────────────────────────────────────────────────────────
  onceText(bot, /^\/info$/, (msg) => {
    const s = store.getSession(msg.from.id);
    if (!s) return bot.sendMessage(msg.chat.id, "ℹ️ You haven't paired a WhatsApp number yet. Use /pair <number>.");
    const live = listSessions().find(x => x.id === s.sessionId);
    bot.sendMessage(
      msg.chat.id,
      `ℹ️ *Your session*\n📱 Number: ${s.phone}\n🔌 Status: ${live?.status || "unknown"}\n📅 Paired: ${new Date(s.pairedAt).toLocaleString()}`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /sessions (admin) ────────────────────────────────────────────────────
  onceText(bot, /^\/sessions$/, (msg) => {
    if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, "🚫 Admins only.");
    const all = listSessions();
    if (!all.length) return bot.sendMessage(msg.chat.id, "No sessions paired yet.");
    const lines = all.map((s, i) =>
      `${i + 1}. 📱 ${s.phoneNumber || "?"} — ${s.pushname || "no name"} — ${s.status}` +
      (s.telegramUsername ? ` — @${s.telegramUsername}` : "")
    );
    bot.sendMessage(msg.chat.id, `👥 *Paired sessions (${all.length}):*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
  });

  // ── /broadcast (admin) ───────────────────────────────────────────────────
  onceText(bot, /^\/broadcast(?:\s+([\s\S]+))?$/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return bot.sendMessage(msg.chat.id, "🚫 Admins only.");
    const text = match[1];
    if (!text) return bot.sendMessage(msg.chat.id, "Usage: /broadcast Your message here");

    const users = store.allUsers();
    let sent = 0, failed = 0;
    await bot.sendMessage(msg.chat.id, `📨 Broadcasting to ${users.length} users...`);
    for (const u of users) {
      try {
        await bot.sendMessage(u.id, `📢 *Announcement*\n\n${text}`, { parse_mode: "Markdown" });
        sent++;
      } catch {
        failed++;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    bot.sendMessage(msg.chat.id, `✅ Broadcast done. Sent: ${sent}, Failed: ${failed}`);
  });

  return bot;
}
