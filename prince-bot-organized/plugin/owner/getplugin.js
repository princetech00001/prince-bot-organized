import fs from "fs";
import path from "path";
import { isPremium, buildContactMessage } from "./premium.js";
import { listPluginFiles, findPluginFile } from "../../utils/pluginFiles.js";

// All available plugins
const PLUGIN_DIR = "./plugin";

export default {
  command: ["getplugin", "plugincode", "pluginsrc", "listplugins"],

  run: async ({ sock, msg, from, cmd, body, isOwner, senderNumber }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(/\s+/).slice(1);
    const query = args.join(" ").trim().toLowerCase().replace(/\.js$/, "");
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    // ── Owner or Premium — this is the bot's actual source code ──────────────
    if (!isOwner && !isPremium(senderNumber)) {
      return reply(buildContactMessage());
    }

    // ── List all plugins ──────────────────────────────────────────────────────
    if (cmd === "listplugins" || !query) {
      let files = [];
      try {
        files = listPluginFiles().map(f => `${f.category}/${f.base}`);
      } catch {
        return reply("❌ Could not read plugin directory.");
      }

      let out =
        "╔══════════════════════════════════════╗\n" +
        "║  📂  PLUGIN LIST                     ║\n" +
        "╠══════════════════════════════════════╣\n" +
        `║  Total: ${files.length} plugins\n` +
        "╠══════════════════════════════════════╣\n\n";

      files.forEach((f, i) => {
        out += `${i + 1}. ${f}\n`;
      });

      out += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      out += "📖 Usage: *.getplugin <name>*\n";
      out += "Example: *.getplugin group*\n";
      out += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

      return reply(out);
    }

    // ── Find the plugin file ──────────────────────────────────────────────────
    // Exact name first, then partial match — searches every category folder
    let filePath = findPluginFile(query)?.full || null;

    if (!filePath) {
      // Show similar plugins
      let similar = [];
      try {
        similar = listPluginFiles()
          .map(f => f.base)
          .filter(f => f.includes(query[0]));
      } catch {}

      return reply(
        "╔══════════════════════════════════════╗\n" +
        "║  ❌  PLUGIN NOT FOUND                ║\n" +
        "╠══════════════════════════════════════╣\n" +
        `║  "${query}" doesn't exist.\n` +
        "║                                      ║\n" +
        (similar.length > 0
          ? `║  Similar: ${similar.slice(0, 5).join(", ")}\n` +
            "║                                      ║\n"
          : "") +
        "║  Use *.listplugins* to see all       ║\n" +
        "╚══════════════════════════════════════╝"
      );
    }

    // ── Read the file ─────────────────────────────────────────────────────────
    let code = "";
    try {
      code = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      return reply(`❌ Could not read file: ${e.message}`);
    }

    const fileName = path.basename(filePath);
    const lines = code.split("\n").length;
    const size = (Buffer.byteLength(code, "utf8") / 1024).toFixed(1);

    // ── Send as document if too large, otherwise as text ─────────────────────
    const MAX_TEXT = 4000;

    if (code.length <= MAX_TEXT) {
      // Send as formatted text
      return reply(
        `╔══════════════════════════════════════╗\n` +
        `║  📄  ${fileName.padEnd(33)}║\n` +
        `╠══════════════════════════════════════╣\n` +
        `║  📏 Lines : ${String(lines).padEnd(25)}║\n` +
        `║  💾 Size  : ${(size + " KB").padEnd(25)}║\n` +
        `╚══════════════════════════════════════╝\n\n` +
        "```\n" + code + "\n```"
      );
    } else {
      // File too large for one message — send as document
      const buffer = Buffer.from(code, "utf8");
      try {
        await sock.sendMessage(from, {
          document: buffer,
          mimetype: "text/javascript",
          fileName: fileName,
          caption:
            `📄 *${fileName}*\n` +
            `📏 Lines : ${lines}\n` +
            `💾 Size  : ${size} KB\n\n` +
            `_Sent as file — too large for text_`
        }, { quoted: msg });
      } catch {
        // Last resort — split into chunks
        const chunks = [];
        for (let i = 0; i < code.length; i += MAX_TEXT) {
          chunks.push(code.slice(i, i + MAX_TEXT));
        }
        await reply(
          `📄 *${fileName}* — Sending in ${chunks.length} parts...\n` +
          `📏 Lines: ${lines} | 💾 Size: ${size} KB`
        );
        for (let i = 0; i < chunks.length; i++) {
          await sock.sendMessage(from, {
            text: `📄 *Part ${i + 1}/${chunks.length}*\n\n\`\`\`\n${chunks[i]}\n\`\`\``
          }, { quoted: msg });
          await new Promise(r => setTimeout(r, 800));
        }
      }
      return;
    }
  }
};
