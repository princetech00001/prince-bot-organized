import { BOT_CONFIG } from "../../config.js";

async function toggle(key, label, onText, offText, { sock, from, msg, botSettings, saveSettings }) {
  botSettings[key] = !botSettings[key];
  saveSettings();
  await sock.sendMessage(from, {
    text:
      `${botSettings[key] ? "✅" : "❌"} *${label}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Status: *${botSettings[key] ? "ON" : "OFF"}*\n` +
      `${botSettings[key] ? onText : offText}\n` +
      `━━━━━━━━━━━━━━━━━━━━━`
  }, { quoted: msg });
}

export default {
  command: [
    "setprefix", "anticall", "autoread", "autotype", "autorecord",
    "autoviewstatus", "alwaysonline", "autobio", "antidelete",
    "autoblock", "chatbot", "autoreactstatus", "delanticallmsg",
    "autorecordtyping", "autotype"
  ],

  async run(ctx) {
    const { sock, msg, from, cmd, body, isOwner, botSettings, saveSettings } = ctx;

    if (!isOwner) {
      return sock.sendMessage(from, {
        text: "❌ *Owner only command.*"
      }, { quoted: msg });
    }

    const args = body.trim().split(" ").slice(1);

    if (cmd === "setprefix") {
      const np = args[0];
      if (!np || np.length > 3) {
        return sock.sendMessage(from, {
          text:
            `⚙️ *SET PREFIX*\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Current: *${botSettings.prefix}*\n\n` +
            `Usage: .setprefix <symbol>\nExample: .setprefix !\n` +
            `Note: dot (.) always works as fallback.\n━━━━━━━━━━━━━━━━━━━━━`
        }, { quoted: msg });
      }
      botSettings.prefix = np;
      saveSettings();
      return sock.sendMessage(from, {
        text: `✅ *PREFIX CHANGED*\n━━━━━━━━━━━━━━━━━━━━━\nNew prefix: *${np}*\nExample: ${np}menu\n━━━━━━━━━━━━━━━━━━━━━`
      }, { quoted: msg });
    }

    if (cmd === "anticall" || cmd === "delanticallmsg") {
      return toggle("anticall", "ANTI-CALL",
        "Incoming calls will be rejected automatically.",
        "Bot will not reject calls.", ctx);
    }

    if (cmd === "autoread") {
      return toggle("autoread", "AUTO-READ",
        "Bot marks all messages as read instantly.",
        "Auto-read disabled.", ctx);
    }

    if (cmd === "autotype" || cmd === "autorecordtyping") {
      return toggle("autotype", "AUTO-TYPING",
        "Bot shows typing indicator on every message.",
        "Typing indicator disabled.", ctx);
    }

    if (cmd === "autorecord") {
      return toggle("autorecord", "AUTO-RECORDING",
        "Bot shows recording indicator on every message.",
        "Recording indicator disabled.", ctx);
    }

    if (cmd === "autoviewstatus" || cmd === "autoviewstatuses") {
      return toggle("autoviewstatus", "AUTO-VIEW STATUS",
        "Bot automatically views all statuses.",
        "Auto-view status disabled.", ctx);
    }

    if (cmd === "alwaysonline") {
      botSettings.alwaysonline = !botSettings.alwaysonline;
      saveSettings();
      if (botSettings.alwaysonline) {
        await sock.sendPresenceUpdate("available").catch(() => {});
      } else {
        await sock.sendPresenceUpdate("unavailable").catch(() => {});
      }
      return sock.sendMessage(from, {
        text:
          `${botSettings.alwaysonline ? "✅" : "❌"} *ALWAYS ONLINE*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Status: *${botSettings.alwaysonline ? "ON — Bot always appears online." : "OFF — Normal status."}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━`
      }, { quoted: msg });
    }

    if (cmd === "autobio") {
      const text = args.join(" ");
      if (!text) {
        botSettings.autobio = !botSettings.autobio;
        saveSettings();
        return sock.sendMessage(from, {
          text:
            `${botSettings.autobio ? "✅" : "❌"} *AUTO-BIO*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Status: *${botSettings.autobio ? "ON" : "OFF"}*\n` +
            `Bio text: ${botSettings.autobioText || "(none — set with .autobio Your text)"}\n` +
            `Tip: use {time} to insert current time.\n` +
            `━━━━━━━━━━━━━━━━━━━━━`
        }, { quoted: msg });
      }
      botSettings.autobioText = text;
      botSettings.autobio = true;
      saveSettings();
      return sock.sendMessage(from, {
        text:
          `✅ *AUTO-BIO SET*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Bio: ${text}\nUpdates every 5 minutes.\n━━━━━━━━━━━━━━━━━━━━━`
      }, { quoted: msg });
    }

    if (cmd === "antidelete") {
      return toggle("antidelete", "ANTI-DELETE",
        "Bot will resend deleted messages.",
        "Anti-delete disabled.", ctx);
    }

    if (cmd === "autoblock") {
      return toggle("autoblock", "AUTO-BLOCK",
        "Bot will auto-block unknown numbers.",
        "Auto-block disabled.", ctx);
    }

    if (cmd === "chatbot") {
      return toggle("chatbot", "CHATBOT",
        "Bot will auto-reply to messages.",
        "Chatbot disabled.", ctx);
    }

    if (cmd === "autoreactstatus") {
      return toggle("autoreactstatus", "AUTO-REACT STATUS",
        "Bot will react to statuses automatically.",
        "Auto-react status disabled.", ctx);
    }
  }
};
