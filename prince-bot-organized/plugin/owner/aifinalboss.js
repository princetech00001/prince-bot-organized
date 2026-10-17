import fs from "fs";
import nodePath from "path";
import { listPluginFiles, findPluginFile } from "../../utils/pluginFiles.js";
import { isPremium, buildContactMessage } from "./premium.js";

let lastReport = {};
let crashLog = {};

export default {
  command: [
    "aiscan",
    "applyfix",
    "aistatus",
    "aidisable",
    "aienable",
    "aitest"
  ],

  async run(ctx) {
    const { sock, msg, from, isOwner, body, senderNumber } = ctx;
    const cmdName = body.split(" ")[0].slice(1).toLowerCase();

    // aiscan is the one aifinalboss command offered as a premium perk;
    // everything else here can modify the bot's own files, so it stays
    // owner-only regardless of premium status.
    const allowed = isOwner || (cmdName === "aiscan" && isPremium(senderNumber));
    if (!allowed) {
      if (cmdName === "aiscan") return sock.sendMessage(from, { text: buildContactMessage() }, { quoted: msg });
      return sock.sendMessage(from, { text: "❌ Owner only." }, { quoted: msg });
    }

    const cmd = body.split(" ")[0].slice(1).toLowerCase();
    const arg = body.split(" ")[1];

    const pluginDir = "./plugin";
    const backupDir = "./plugin-backup";

    // ───────── SCAN ─────────
    if (cmd === "aiscan") {
      let report = [];
      lastReport = {};

      const entries = listPluginFiles(pluginDir);

      for (const entry of entries) {
        const file = entry.name;
        const path = entry.full;
        let fixes = [];

        try {
          const code = fs.readFileSync(path, "utf8");

          if (!code.includes("export default"))
            fixes.push({ type: "add_export", msg: "Missing export default" });

          if (!code.includes("command"))
            fixes.push({ type: "add_command", msg: "Missing command array" });

          if (!code.includes("run("))
            fixes.push({ type: "add_run", msg: "Missing run() function" });

          if (code.includes("@s.s.whatsapp.net"))
            fixes.push({ type: "fix_jid", msg: "Wrong JID format" });

          if (code.includes("global.sock"))
            fixes.push({ type: "fix_sock", msg: "Use sock instead of global.sock" });

          if (code.includes("msg.key.remoteJid"))
            fixes.push({ type: "fix_from", msg: "Use 'from' instead" });

          if (fixes.length > 0) {
            lastReport[file] = fixes;
            report.push(`⚠️ *${file}*\n${fixes.map(f => "  • " + f.msg).join("\n")}`);
          } else {
            report.push(`✅ ${file}`);
          }

        } catch (e) {
          report.push(`❌ ${file} — ${e.message}`);
        }
      }

      return sock.sendMessage(from, {
        text:
`🧠 *AI SCAN*
━━━━━━━━━━━━━━━━━━━━━
${report.join("\n")}
━━━━━━━━━━━━━━━━━━━━━
Use:
.applyfix file.js
.aistatus`
      }, { quoted: msg });
    }

    // ───────── APPLY FIX ─────────
    if (cmd === "applyfix") {
      if (!arg || !lastReport[arg]) {
        return sock.sendMessage(from, {
          text: "❌ Run .aiscan first"
        }, { quoted: msg });
      }

      const path = findPluginFile(arg)?.full || `${pluginDir}/${arg}`;
      const backup = `${backupDir}/${arg}`;

      try {
        let code = fs.readFileSync(path, "utf8");

        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
        fs.writeFileSync(backup, code);

        for (const fix of lastReport[arg]) {
          if (fix.type === "fix_jid")
            code = code.replace(/@s\.s\.whatsapp\.net/g, "@s.whatsapp.net");

          if (fix.type === "fix_sock")
            code = code.replace(/global\.sock/g, "sock");

          if (fix.type === "fix_from")
            code = code.replace(/msg\.key\.remoteJid/g, "from");

          if (fix.type === "add_export")
            code += "\n\nexport default { command: [], async run() {} };";

          if (fix.type === "add_command")
            code = code.replace("export default {", "export default {\n  command: [],");

          if (fix.type === "add_run")
            code = code.replace("export default {", "export default {\n  async run() {},");
        }

        fs.writeFileSync(path, code);

        return sock.sendMessage(from, {
          text: `✅ Fixed ${arg}`
        }, { quoted: msg });

      } catch (e) {
        return sock.sendMessage(from, {
          text: "❌ Fix failed: " + e.message
        }, { quoted: msg });
      }
    }

    // ───────── STATUS ─────────
    if (cmd === "aistatus") {
      let text = "🧠 *CRASH LOG*\n━━━━━━━━━━━━━━━━━━━━━\n";

      if (Object.keys(crashLog).length === 0) {
        text += "✅ No crashes logged";
      } else {
        for (const f in crashLog) {
          text += `\n❌ ${f}\n  ${crashLog[f].slice(-3).join("\n  ")}`;
        }
      }

      return sock.sendMessage(from, { text }, { quoted: msg });
    }

    // ───────── DISABLE ─────────
    if (cmd === "aidisable") {
      if (!arg) return;

      try {
        const src = findPluginFile(arg)?.full;
        if (!src) throw new Error("plugin not found");
        fs.renameSync(src, nodePath.join(nodePath.dirname(src), `disabled-${nodePath.basename(src)}`));

        return sock.sendMessage(from, {
          text: `🛑 Disabled ${arg}`
        }, { quoted: msg });

      } catch (e) {
        return sock.sendMessage(from, {
          text: "❌ Disable failed"
        }, { quoted: msg });
      }
    }

    // ───────── ENABLE ─────────
    if (cmd === "aienable") {
      if (!arg) return;

      try {
        const off = findPluginFile(arg, { disabled: true })?.full;
        if (!off) throw new Error("disabled plugin not found");
        fs.renameSync(off, nodePath.join(nodePath.dirname(off), nodePath.basename(off).replace(/^disabled-/, "")));

        return sock.sendMessage(from, {
          text: `♻️ Enabled ${arg}`
        }, { quoted: msg });

      } catch (e) {
        return sock.sendMessage(from, {
          text: "❌ Enable failed"
        }, { quoted: msg });
      }
    }

    // ───────── TEST ─────────
    if (cmd === "aitest") {
      if (!arg) {
        return sock.sendMessage(from, {
          text: "❌ Usage: .aitest file.js"
        }, { quoted: msg });
      }

      try {
        const target = findPluginFile(arg);
        if (!target) throw new Error("plugin not found");
        await import(`../${target.rel}?update=${Date.now()}`);

        return sock.sendMessage(from, {
          text: `✅ ${arg} loaded successfully`
        }, { quoted: msg });

      } catch (e) {
        crashLog[arg] = crashLog[arg] || [];
        crashLog[arg].push(e.message);

        return sock.sendMessage(from, {
          text: `❌ ${arg} crashed:\n${e.message}`
        }, { quoted: msg });
      }
    }
  }
};