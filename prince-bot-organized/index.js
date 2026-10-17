import "./utils/keepalive.js"; // Keep-alive HTTP server — must import here to activate
import { BOT_CONFIG } from "./config.js";
import { startSession } from "./whatsapp/sessionManager.js";

// ── Owner's own WhatsApp session (unchanged behavior from before) ───────────
startSession({
  id: BOT_CONFIG.PAIR_NUMBER || "owner",
  pairNumber: BOT_CONFIG.PAIR_NUMBER
});

// ── Telegram side: lets anyone pair their own WhatsApp through the bot ──────
if (BOT_CONFIG.TELEGRAM_BOT_TOKEN) {
  const { startTelegramBot } = await import("./telegram/bot.js");
  startTelegramBot();
} else {
  console.log("ℹ️ TELEGRAM_BOT_TOKEN not set in config.js — Telegram side disabled.");
}

console.log("✅ BOT ONLINE");

process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));
