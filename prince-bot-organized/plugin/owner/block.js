import { BOT_CONFIG } from "../../config.js";

export default {
  command: ["block", "blokir", "unblock", "unblokir"],

  async run({ sock, msg, from, cmd, body, isOwner, senderJid, botNumber }) {

    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    if (!isOwner) {
      return reply(
        `❌ *ACCESS DENIED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Only the bot owner can use this command.\n` +
        `━━━━━━━━━━━━━━━━━━━━━`
      );
    }

    const isBlock = cmd === "block" || cmd === "blokir";
    const action  = isBlock ? "block" : "unblock";
    const args    = body.trim().split(" ").slice(1);

    // ── Resolve target JID ────────────────────────────────────────────────────
    let targetJid = null;

    // 1. Mentioned user
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid;
    if (mentioned?.length > 0) {
      targetJid = mentioned[0];
    }

    // 2. Quoted message sender
    if (!targetJid && ctx?.participant) {
      targetJid = ctx.participant;
    }
    if (!targetJid && ctx?.remoteJid && !ctx.remoteJid.endsWith("@g.us")) {
      targetJid = ctx.remoteJid;
    }

    // 3. Number from args
    if (!targetJid && args[0]) {
      const num = args[0].replace(/[^0-9]/g, "");
      if (!num) return reply("❌ Invalid number. Use digits only, e.g: 628xxxxxxxx");
      targetJid = num + "@s.whatsapp.net";
    }

    // 4. Current private chat
    if (!targetJid && !from.endsWith("@g.us")) {
      targetJid = from;
    }

    if (!targetJid) {
      return reply(
        `⚠️ *HOW TO USE .${cmd}*\n\n` +
        `> *.${cmd} 628xxx* — by number\n` +
        `> *.${cmd}* (reply a msg) — block that sender\n` +
        `> *.${cmd} @mention* — block mentioned user\n` +
        `> *.${cmd}* (in private chat) — block this user`
      );
    }

    // ── Safety checks ─────────────────────────────────────────────────────────
    const targetNum = targetJid.split("@")[0].split(":")[0];
    const botJid    = (botNumber || BOT_CONFIG.OWNER[0]) + "@s.whatsapp.net";

    if (targetJid === botJid || targetNum === (botNumber || "")) {
      return reply("❌ Cannot block the bot's own number.");
    }
    if (BOT_CONFIG.OWNER.includes(targetNum)) {
      return reply("❌ Cannot block the bot owner.");
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    try {
      await sock.updateBlockStatus(targetJid, action);

      await sock.sendMessage(from, {
        react: { text: isBlock ? "🚫" : "✅", key: msg.key }
      }).catch(() => {});

      const label = isBlock ? "🚫 *NUMBER BLOCKED*" : "✅ *NUMBER UNBLOCKED*";
      const tip   = isBlock
        ? `Type *.unblock ${targetNum}* to remove block.`
        : "User can now message the bot again.";

      return reply(
        `${label}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 Target : @${targetNum}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💡 ${tip}`
      );
    } catch (err) {
      console.error(`[block.js] ${err.message}`);
      return reply(
        `❌ *FAILED TO ${action.toUpperCase()}*\n\n` +
        `Error: ${err.message}\n\n` +
        `Make sure the number is valid and try again.`
      );
    }
  }
};
