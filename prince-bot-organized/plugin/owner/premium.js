import fs from 'fs';
import { BOT_CONFIG } from "../../config.js";
import { fancy } from "../../utils/fancyFont.js";

const PREMIUM_FILE = "./premium-users.json";
const CODES_FILE = "./premium-codes.json";

function loadPremium() {
  try { return fs.existsSync(PREMIUM_FILE) ? JSON.parse(fs.readFileSync(PREMIUM_FILE)) : {}; }
  catch (e) { return {}; }
}
function savePremium(data) {
  fs.writeFileSync(PREMIUM_FILE, JSON.stringify(data, null, 2));
}
function loadCodes() {
  try { return fs.existsSync(CODES_FILE) ? JSON.parse(fs.readFileSync(CODES_FILE)) : {}; }
  catch (e) { return {}; }
}
function saveCodes(data) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(data, null, 2));
}

export function isPremium(number) {
  const db = loadPremium();
  const entry = db[number];
  if (!entry) return false;
  if (entry.expires === "lifetime") return true;
  return new Date(entry.expires) > new Date();
}

export function buildContactMessage() {
  return (
    `💎👑 *${fancy("PRINCE BOT PREMIUM")}* 👑💎\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔒 ${fancy("This is a Premium Feature")}\n\n` +
    `📩 ${fancy("Contact the bot owner to get access")}:\n` +
    `👉 wa.me/${BOT_CONFIG.OWNER[0]}\n\n` +
    `${fancy("Once you've arranged access, the owner will send you a code")}.\n` +
    `${fancy("Activate it with")}:\n` +
    `*${BOT_CONFIG.PREFIX || "."}unlockpremium <code>*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

export default {
  command: [
    "premium", "buypremium", "unlockpremium",
    "genpremium", "revokepremium", "premiumlist"
  ],

  async run({ sock, msg, from, body, senderNumber, isOwner }) {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const args = body.trim().split(" ").slice(1);
    const cmd = body.trim().split(" ")[0].replace(/^[.!#/]/, "").toLowerCase();
    const p = BOT_CONFIG.PREFIX || ".";

    // ── OWNER: ".premium code" — quick wildcard code for the next customer
    // who contacts you, no need to know their number up front. ──
    if (cmd === "premium" && args[0]?.toLowerCase() === "code") {
      if (!isOwner) return reply("❌ Owner only.");
      const plan = args[1] || "lifetime";
      const code = "PRINCE-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const codes = loadCodes();
      const expires = plan === "lifetime" ? "lifetime" : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      codes[code] = { number: "any", plan, expires, used: false };
      saveCodes(codes);

      return reply(
        `✅ *${fancy("Premium Code Generated")}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔑 ${fancy("Code")}:\n` +
        "```" + code + "```\n" +
        `💎 ${fancy("Plan")}  : ${plan}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${fancy("Send this to the customer")}. ${fancy("They activate it with")}:\n` +
        "```" + `${p}unlockpremium ${code}` + "```"
      );
    }

    // ── OWNER: Generate a code for a specific number ──
    if (cmd === "genpremium") {
      if (!isOwner) return reply("❌ Owner only.");
      const targetNumber = args[0];
      const plan = args[1] || "month";
      if (!targetNumber) return reply(`Usage: ${p}genpremium <number> <month|lifetime>\nExample: ${p}genpremium 2348012345678 lifetime`);

      const code = "PRINCE-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const codes = loadCodes();
      const expires = plan === "lifetime" ? "lifetime" : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      codes[code] = { number: targetNumber, plan, expires, used: false };
      saveCodes(codes);

      return reply(
        `✅ *Premium Code Generated*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 For    : ${targetNumber}\n` +
        `💎 Plan   : ${plan}\n` +
        `🔑 Code:\n` +
        "```" + code + "```\n" +
        `📅 Expires: ${expires === "lifetime" ? "♾️ Lifetime" : new Date(expires).toDateString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Send this code to the user.\n` +
        `They activate it with:\n` +
        "```" + `${p}unlockpremium ${code}` + "```"
      );
    }

    // ── USER: Unlock premium with a code ──
    if (cmd === "unlockpremium") {
      const code = args[0]?.toUpperCase();
      if (!code) return reply(`Usage: ${p}unlockpremium YOUR_CODE`);

      const codes = loadCodes();
      const entry = codes[code];

      if (!entry) return reply("❌ Invalid code. Check and try again.");
      if (entry.used) return reply("❌ This code has already been used.");
      if (entry.number !== senderNumber && entry.number !== "any") {
        return reply("❌ This code is not for your number.");
      }

      const db = loadPremium();
      db[senderNumber] = { plan: entry.plan, expires: entry.expires, activatedAt: new Date().toISOString() };
      savePremium(db);
      entry.used = true;
      saveCodes(codes);

      return reply(
        `🎉 *${fancy("Premium Unlocked")}!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 ${fancy("Number")} : ${senderNumber}\n` +
        `💎 ${fancy("Plan")}   : ${entry.plan}\n` +
        `📅 ${fancy("Expires")}: ${entry.expires === "lifetime" ? "♾️ Lifetime" : new Date(entry.expires).toDateString()}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${fancy("You now have access to all premium features")}!\n` +
        `${fancy("Type")} *${p}premium* ${fancy("to see them")}.`
      );
    }

    // ── OWNER: Revoke premium ──
    if (cmd === "revokepremium") {
      if (!isOwner) return reply("❌ Owner only.");
      const target = args[0];
      if (!target) return reply(`Usage: ${p}revokepremium <number>`);
      const db = loadPremium();
      if (!db[target]) return reply(`❌ ${target} is not a premium user.`);
      delete db[target];
      savePremium(db);
      return reply(`✅ Premium revoked for ${target}.`);
    }

    // ── OWNER: List premium users ──
    if (cmd === "premiumlist") {
      if (!isOwner) return reply("❌ Owner only.");
      const db = loadPremium();
      const users = Object.entries(db);
      if (!users.length) return reply("No premium users yet.");
      const list = users.map(([num, data]) =>
        `👤 ${num} — ${data.plan} — ${data.expires === "lifetime" ? "♾️" : new Date(data.expires).toDateString()}`
      ).join("\n");
      return reply(`💎 *Premium Users (${users.length})*\n━━━━━━━━━━━━━━━━━━━━━\n${list}`);
    }

    // ── SHOW PREMIUM INFO ──
    if (cmd === "premium" || cmd === "buypremium") {
      const userIsPremium = isPremium(senderNumber);
      if (userIsPremium) {
        const db = loadPremium();
        const data = db[senderNumber];
        return reply(
          `💎 *${fancy("Your Premium Status")}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ ${fancy("Status")}  : ACTIVE\n` +
          `📦 ${fancy("Plan")}    : ${data.plan}\n` +
          `📅 ${fancy("Expires")} : ${data.expires === "lifetime" ? "♾️ Lifetime" : new Date(data.expires).toDateString()}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `*${fancy("Premium Commands")}:*\n` +
          `⭐👑 *${p}getplugin* — ${fancy("view plugin source")} 📄\n` +
          `⭐👑 *${p}listplugins* — ${fancy("list every plugin")} 📂\n` +
          `⭐👑 *${p}aiscan* — ${fancy("scan the bot for bugs")} 🧠`
        );
      }
      return reply(buildContactMessage());
    }
  }
};
