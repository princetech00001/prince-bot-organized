import axios from "axios";
import fs from "fs";
import path from "path";

export default {
  command: [
    "sticker", "s",
    "toimg", "stickertoimg",
    "attp", "ttp",
    "screenshot", "ss"
  ],

  run: async ({ sock, msg, body, cmd, from, isOwner }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // 🎨 IMAGE → STICKER
      // ══════════════════════════════
      if (cmd === "sticker" || cmd === "s") {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imageMsg = msg.message?.imageMessage || quoted?.imageMessage;
        if (!imageMsg) return reply("📸 Reply to an image to convert it to a sticker!\nExample: Reply to any image with *.sticker*");

        const buffer = await sock.downloadMediaMessage(
          { message: { imageMessage: imageMsg } }
        );

        await sock.sendMessage(from, {
          sticker: buffer
        }, { quoted: msg });
        return;
      }

      // ══════════════════════════════
      // 🖼️ STICKER → IMAGE
      // ══════════════════════════════
      if (cmd === "toimg" || cmd === "stickertoimg") {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const stickerMsg = msg.message?.stickerMessage || quoted?.stickerMessage;
        if (!stickerMsg) return reply("🖼️ Reply to a sticker to convert it to an image!\nExample: Reply to any sticker with *.toimg*");

        const buffer = await sock.downloadMediaMessage(
          { message: { stickerMessage: stickerMsg } }
        );

        await sock.sendMessage(from, {
          image: buffer,
          caption: "✅ Here's your sticker as an image!"
        }, { quoted: msg });
        return;
      }

      // ══════════════════════════════
      // ✏️ TEXT → STICKER (ATTP)
      // ══════════════════════════════
      if (cmd === "attp" || cmd === "ttp") {
        if (!query) return reply(`✏️ Provide text!\nExample: *.${cmd} Hello World*`);
        try {
          const res = await axios.get(
            `https://api.siputzx.my.id/api/maker/attp?text=${encodeURIComponent(query)}`,
            { responseType: "arraybuffer", timeout: 15000 }
          );
          await sock.sendMessage(from, {
            sticker: Buffer.from(res.data)
          }, { quoted: msg });
        } catch {
          // Fallback API
          const res2 = await axios.get(
            `https://api.nexoracle.com/maker/attp?apikey=free&text=${encodeURIComponent(query)}`,
            { responseType: "arraybuffer", timeout: 15000 }
          );
          await sock.sendMessage(from, {
            sticker: Buffer.from(res2.data)
          }, { quoted: msg });
        }
        return;
      }

      // ══════════════════════════════
      // 🔊 TEXT TO SPEECH
      // ══════════════════════════════
      if (cmd === "tts") {
        if (!query) return reply("🔊 Provide text!\nExample: *.tts Hello, how are you?*");
        const lang = args[0]?.startsWith("lang:") ? args[0].split(":")[1] : "en";
        const text2 = lang !== "en" ? args.slice(1).join(" ") : query;
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text2 || query)}&tl=${lang}&client=tw-ob`;
        const res = await axios.get(url, {
          responseType: "arraybuffer",
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 10000
        });
        await sock.sendMessage(from, {
          audio: Buffer.from(res.data),
          mimetype: "audio/mp4",
          ptt: true
        }, { quoted: msg });
        return;
      }

      // ══════════════════════════════
      // 📱 QR CODE GENERATOR
      // ══════════════════════════════
      if (cmd === "qr") {
        if (!query) return reply("📱 Provide text or URL!\nExample: *.qr https://wa.me/2349033168045*");
        const res = await axios.get(
          `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(query)}`,
          { responseType: "arraybuffer", timeout: 10000 }
        );
        await sock.sendMessage(from, {
          image: Buffer.from(res.data),
          caption: `📱 *QR CODE GENERATED*\n\n📝 Content: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`
        }, { quoted: msg });
        return;
      }

      // ══════════════════════════════
      // 🔢 CALCULATOR
      // ══════════════════════════════
      if (cmd === "calc" || cmd === "calculate") {
        if (!query) return reply("🔢 Provide a math expression!\nExample: *.calc 25 * 4 + 10 / 2*");
        // Safe eval — only allow math chars
        const safe = query.replace(/[^0-9+\-*/().%^ ]/g, "").trim();
        if (!safe) return reply("❌ Invalid expression! Only use: numbers and + - * / ( ) . %");
        try {
          // Support ^ for power
          const expr = safe.replace(/\^/g, "**");
          // eslint-disable-next-line no-new-func
          const result = Function(`"use strict"; return (${expr})`)();
          if (!isFinite(result)) return reply("❌ Math error: result is undefined (e.g. division by zero)");
          return reply(
            `🔢 *CALCULATOR*\n\n📥 Input: \`${query}\`\n📤 Result: *${result.toLocaleString()}*`
          );
        } catch {
          return reply("❌ Invalid math expression. Check your input and try again.");
        }
      }

      // ══════════════════════════════
      // 🌍 TRANSLATE
      // ══════════════════════════════
      if (cmd === "translate" || cmd === "tr") {
        if (args.length < 2) return reply(
          "🌍 Usage: *.translate <lang> <text>*\nExample: *.translate fr Hello how are you*\n\nCodes: en, fr, es, de, pt, ar, yo, ha, ig, zh, ja, ko, ru"
        );
        const toLang = args[0];
        const text = args.slice(1).join(" ");
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${toLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await axios.get(url, { timeout: 10000 });
        const translated = res.data[0].map(t => t[0]).join("");
        const detectedLang = res.data[2] || "auto";
        return reply(
          `🌍 *TRANSLATE*\n\n📥 Original (${detectedLang}): ${text}\n📤 ${toLang.toUpperCase()}: *${translated}*`
        );
      }

      // ══════════════════════════════
      // 🔗 URL SHORTENER
      // ══════════════════════════════
      if (cmd === "shorten" || cmd === "shorturl") {
        if (!query) return reply("🔗 Provide a URL!\nExample: *.shorten https://www.example.com/very/long/url*");
        if (!query.startsWith("http")) return reply("❌ URL must start with http:// or https://");
        const res = await axios.get(
          `https://tinyurl.com/api-create.php?url=${encodeURIComponent(query)}`,
          { timeout: 10000 }
        );
        return reply(
          `🔗 *URL SHORTENER*\n\n📥 Original:\n${query}\n\n📤 Shortened:\n${res.data}\n\n_Powered by TinyURL_ ✂️`
        );
      }

      // ══════════════════════════════
      // 📸 SCREENSHOT WEBSITE
      // ══════════════════════════════
      if (cmd === "screenshot" || cmd === "ss") {
        if (!query) return reply("📸 Provide a URL!\nExample: *.ss https://google.com*");
        if (!query.startsWith("http")) return reply("❌ URL must start with http:// or https://");
        const ssUrl = `https://image.thum.io/get/width/1280/crop/800/${encodeURIComponent(query)}`;
        const res = await axios.get(ssUrl, { responseType: "arraybuffer", timeout: 20000 });
        await sock.sendMessage(from, {
          image: Buffer.from(res.data),
          caption: `📸 *SCREENSHOT*\n\n🌐 URL: ${query}`
        }, { quoted: msg });
        return;
      }

    } catch (e) {
      return reply(`❌ Error: ${e.message}`);
    }
  }
};
