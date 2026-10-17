import { getGroup, updateGroup } from "../../utils/groupStore.js";
import { getGroupContext, numberOf } from "../../utils/groupAdmin.js";
import { fillTemplate, DEFAULT_WELCOME, DEFAULT_GOODBYE } from "../../utils/welcomeGuard.js";

// .welcome / .goodbye  on | off | set <text> | reset | test | status
// (.setgreeting .cleargreeting .setbye .clearbye still work as shortcuts)
export default {
  command: ["welcome", "goodbye", "setgreeting", "cleargreeting", "setbye", "clearbye"],

  run: async ({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber, prefix = "." }) => {
    const reply = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg });
    if (!isGroup) return reply("❌ This command only works inside a group.");

    let ctx;
    try { ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }); }
    catch { return reply("❌ Could not read group info. Try again."); }
    if (!ctx.senderIsAdmin) return reply("🚫 Only group admins can change welcome and goodbye messages.");

    const args = body.trim().split(/\s+/).slice(1);
    const rest = body.trim().split(/\s+/).slice(1).join(" ").trim();

    // Which message are we editing, and what action?
    const which = (cmd === "goodbye" || cmd === "setbye" || cmd === "clearbye") ? "goodbye" : "welcome";
    let action = args[0]?.toLowerCase() || "status";
    let text = args.slice(1).join(" ").trim();
    if (cmd === "setgreeting" || cmd === "setbye") { action = "set"; text = rest; }
    if (cmd === "cleargreeting" || cmd === "clearbye") { action = "reset"; }

    const label = which === "welcome" ? "Welcome" : "Goodbye";
    const fallback = which === "welcome" ? DEFAULT_WELCOME : DEFAULT_GOODBYE;
    const cfg = getGroup(from)[which];
    const preview = (tpl) => fillTemplate(tpl, {
      jid: senderJid, group: ctx.meta.subject || "This Group",
      count: ctx.participants.length, desc: ctx.meta.desc || "",
    });

    if (action === "on" || action === "off") {
      updateGroup(from, g => { g[which].enabled = action === "on"; });
      return reply(action === "on"
        ? `✅ *${label} messages are ON.*\nCustomize: *${prefix}${which} set <text>*`
        : `❌ *${label} messages are OFF.*`);
    }

    if (action === "set") {
      if (!text) {
        return reply(
          `❌ Usage: *${prefix}${which} set <text>*\n\n` +
          `You can use:\n• {user} – tags the member\n• {group} – group name\n• {count} – member count\n• {desc} – group description\n\n` +
          `Example:\n${prefix}${which} set Welcome {user} to {group}! 🎉`
        );
      }
      updateGroup(from, g => { g[which].text = text.slice(0, 800); g[which].enabled = true; });
      return reply(`✅ *${label} message saved and turned ON.*\n\n*Preview:*\n${preview(text)}`, [senderJid]);
    }

    if (action === "reset" || action === "clear") {
      updateGroup(from, g => { g[which].text = null; });
      return reply(`✅ ${label} message reset to the default.`);
    }

    if (action === "test") {
      return reply(preview(cfg.text || fallback), [senderJid]);
    }

    // status
    return reply(
      `${which === "welcome" ? "👋" : "🚪"} *${label} message*\n` +
      `Status : ${cfg.enabled ? "✅ ON" : "❌ OFF"}\n` +
      `Text   : ${cfg.text ? cfg.text : "(default)"}\n\n` +
      `*${prefix}${which} on* / *off*\n*${prefix}${which} set <text>*\n*${prefix}${which} reset*\n*${prefix}${which} test*`
    );
  }
};
