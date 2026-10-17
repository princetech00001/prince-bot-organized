import { getGroup, updateGroup } from "../../utils/groupStore.js";
import { getGroupContext } from "../../utils/groupAdmin.js";
import { hostOf } from "../../utils/linkGuard.js";

// .antilink on | off | status | mode <delete|warn|kick> | allow <domain> | unallow <domain> | list
// The live link checking itself runs on every group message
// (see utils/linkGuard.js, called from whatsapp/sessionManager.js).
const MODES = {
  delete: "Delete the message only",
  warn:   "Delete + warn (removed at the warn limit)",
  kick:   "Delete + remove the member immediately",
};

export default {
  command: ["antilink"],

  run: async ({ sock, msg, from, body, isOwner, isGroup, senderJid, botNumber, prefix = "." }) => {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    if (!isGroup) return reply("❌ This command only works inside a group.");

    let ctx;
    try { ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }); }
    catch { return reply("❌ Could not read group info. Try again."); }
    if (!ctx.senderIsAdmin) return reply("🚫 Only group admins can change Anti-Link settings.");

    const args = body.trim().split(/\s+/).slice(1);
    const action = args[0]?.toLowerCase() || "status";
    const s = getGroup(from).antilink;

    if (action === "on") {
      updateGroup(from, g => { g.antilink.enabled = true; });
      return reply(
        `🛡️ *Anti-Link is ON*\nMode: *${s.mode}* — ${MODES[s.mode]}\nAdmins and bot commands are never touched.` +
        (ctx.botIsAdmin ? "" : "\n\n⚠️ I'm not a group admin yet — make me admin so I can delete links.")
      );
    }
    if (action === "off") {
      updateGroup(from, g => { g.antilink.enabled = false; });
      return reply("🔓 *Anti-Link is OFF.*");
    }
    if (action === "mode") {
      const m = args[1]?.toLowerCase();
      if (!MODES[m]) return reply(`❌ Choose a mode:\n${Object.entries(MODES).map(([k, v]) => `• *${prefix}antilink mode ${k}* — ${v}`).join("\n")}`);
      updateGroup(from, g => { g.antilink.mode = m; });
      return reply(`✅ Anti-Link mode: *${m}* — ${MODES[m]}`);
    }
    if (action === "allow") {
      const domain = args[1] ? hostOf(args[1]) : "";
      if (!domain || !domain.includes(".")) return reply(`❌ Usage: *${prefix}antilink allow youtube.com*`);
      updateGroup(from, g => { if (!g.antilink.allow.includes(domain)) g.antilink.allow.push(domain); });
      return reply(`✅ Links from *${domain}* are now allowed.`);
    }
    if (action === "unallow" || action === "remove") {
      const domain = args[1] ? hostOf(args[1]) : "";
      if (!domain) return reply(`❌ Usage: *${prefix}antilink unallow youtube.com*`);
      updateGroup(from, g => { g.antilink.allow = g.antilink.allow.filter(d => d !== domain); });
      return reply(`✅ *${domain}* removed from the allowed list.`);
    }
    if (action === "list") {
      return reply(s.allow.length ? `✅ *Allowed domains:*\n${s.allow.map(d => `• ${d}`).join("\n")}` : "No allowed domains yet.\nAdd one: *" + prefix + "antilink allow youtube.com*");
    }

    return reply(
      `🔗 *Anti-Link*\nStatus : ${s.enabled ? "✅ ON" : "❌ OFF"}\nMode   : ${s.mode} — ${MODES[s.mode]}\n` +
      `Allowed: ${s.allow.length ? s.allow.join(", ") : "none"}\n\n` +
      `*${prefix}antilink on* / *off*\n*${prefix}antilink mode <delete|warn|kick>*\n*${prefix}antilink allow <domain>*\n*${prefix}antilink unallow <domain>*\n*${prefix}antilink list*`
    );
  }
};
