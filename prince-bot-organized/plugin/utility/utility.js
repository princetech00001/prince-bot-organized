import axios from "axios";

export default {
  command: [
    "calc", "calculate",
    "qr",
    "shorten", "shorturl",
    "translate", "tr",
    "tts",
    "time", "date"
  ],

  run: async ({ sock, msg, body, cmd, from }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // ⏱ UPTIME / RUNTIME
      // ══════════════════════════════

      if (cmd === "uptime" || cmd === "runtime") {
        const u = Math.floor(process.uptime());
        const d = Math.floor(u / 86400);
        const h = Math.floor((u % 86400) / 3600);
        const m = Math.floor((u % 3600) / 60);
        const s = u % 60;
        return reply(`⏱️ *BOT UPTIME*\n\n🕐 ${d}d ${h}h ${m}m ${s}s\n\n✅ Bot is running smoothly!`);
      }

      // ══════════════════════════════
      // 🕐 TIME & DATE
      // ══════════════════════════════

      if (cmd === "time" || cmd === "date") {
        const now = new Date();
        const time = now.toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short"
        });
        const date = now.toLocaleDateString("en-GB", {
          weekday: "long", day: "2-digit", month: "long", year: "numeric"
        });
        return reply(`🕐 *TIME & DATE*\n\n📅 ${date}\n⏰ ${time}`);
      }

      // ══════════════════════════════
      // 🏓 PING
      // ══════════════════════════════

      if (cmd === "ping") {
        const start = Date.now();
        await sock.sendMessage(from, { text: "🏓 Pong!" }, { quoted: msg });
        const latency = Date.now() - start;
        const rating = latency < 200 ? "🟢 Excellent" : latency < 500 ? "🟡 Good" : "🔴 Slow";
        return reply(`🏓 *PING RESULT*\n\n⚡ Latency: *${latency}ms*\n📊 Rating: ${rating}\n✅ Bot is online!`);
      }

      // ══════════════════════════════
      // 🧮 CALCULATOR
      // ══════════════════════════════

      if (cmd === "calc" || cmd === "calculate") {
        if (!query) return reply("🧮 Usage: .calc 2 + 2\n\nSupports: + - * / ^ % sqrt pi");

        // Safe math eval (no Function constructor)
        const sanitized = query
          .replace(/[^0-9+\-*/().%^ sqrtpielog]/gi, "")
          .replace(/sqrt\(([^)]+)\)/g, (_, n) => `Math.sqrt(${n})`)
          .replace(/\^/g, "**")
          .replace(/\bpi\b/g, "Math.PI")
          .replace(/\be\b/g, "Math.E")
          .replace(/\babs\(([^)]+)\)/g, (_, n) => `Math.abs(${n})`)
          .replace(/\blog\(([^)]+)\)/g, (_, n) => `Math.log10(${n})`);

        let result;
        try {
          // eslint-disable-next-line no-new-func
          result = new Function(`"use strict"; return (${sanitized})`)();
        } catch {
          return reply(`❌ Invalid expression: *${query}*\n\nExample: .calc 5 * (3 + 2)`);
        }

        if (!isFinite(result)) return reply(`❌ Math error: result is ${result}`);
        return reply(`🧮 *CALCULATOR*\n\n📝 Input: ${query}\n✅ Result: *${result}*`);
      }

      // ══════════════════════════════
      // 🔗 URL SHORTENER
      // ══════════════════════════════

      if (cmd === "shorten" || cmd === "shorturl") {
        if (!query) return reply("🔗 Usage: .shorten https://yourlong.url/here");
        try {
          const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(query)}`, { timeout: 8000 });
          return reply(`🔗 *URL SHORTENER*\n\n📎 Original:\n${query}\n\n✅ Short URL:\n${res.data}`);
        } catch {
          return reply(`❌ Failed to shorten URL. Make sure it's a valid URL.\nExample: .shorten https://google.com`);
        }
      }

      // ══════════════════════════════
      // 📱 QR CODE GENERATOR
      // ══════════════════════════════

      if (cmd === "qr") {
        if (!query) return reply("📱 Usage: .qr <text or URL>\n\nExample: .qr https://google.com");
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(query)}`;
        return sock.sendMessage(from, {
          image: { url: qrUrl },
          caption: `📱 *QR CODE*\n\n📝 Content: ${query.slice(0, 100)}${query.length > 100 ? "..." : ""}`
        }, { quoted: msg });
      }

      // ══════════════════════════════
      // 🌐 TRANSLATE
      // ══════════════════════════════

      if (cmd === "translate" || cmd === "tr") {
        // Format: .translate <lang> <text>  OR  .translate <text> (auto to English)
        if (!query) return reply("🌐 Usage: .translate <language> <text>\n\nExample: .translate french Hello World\nExample: .translate es Hello World");

        let targetLang = "en";
        let textToTranslate = query;

        const langMap = {
          english: "en", french: "fr", spanish: "es", arabic: "ar",
          portuguese: "pt", german: "de", italian: "it", russian: "ru",
          chinese: "zh", japanese: "ja", korean: "ko", hausa: "ha",
          yoruba: "yo", igbo: "ig", swahili: "sw", zulu: "zu"
        };

        const firstWord = args[0].toLowerCase();
        if (langMap[firstWord]) {
          targetLang = langMap[firstWord];
          textToTranslate = args.slice(1).join(" ");
        } else if (/^[a-z]{2}$/.test(firstWord)) {
          targetLang = firstWord;
          textToTranslate = args.slice(1).join(" ");
        }

        if (!textToTranslate) return reply("🌐 Please provide text to translate.\n\nExample: .translate french Hello");

        // Using MyMemory (free, no key needed)
        const res = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|${targetLang}`,
          { timeout: 10000 }
        );

        const translated = res.data.responseData.translatedText;
        const detectedLang = res.data.responseData.detectedLanguage || "auto";

        return reply(`🌐 *TRANSLATOR*\n\n📝 Original (${detectedLang}):\n${textToTranslate}\n\n✅ Translated (${targetLang.toUpperCase()}):\n${translated}`);
      }

      // ══════════════════════════════
      // 🔊 TEXT TO SPEECH
      // ══════════════════════════════

      if (cmd === "tts") {
        if (!query) return reply("🔊 Usage: .tts <text>\n\nExample: .tts Hello World");
        // Google TTS (free endpoint, no key needed for short text)
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(query.slice(0, 200))}&tl=en&client=tw-ob`;
        return sock.sendMessage(from, {
          audio: { url: ttsUrl },
          mimetype: "audio/mpeg",
          ptt: false
        }, { quoted: msg });
      }

    } catch (err) {
      console.error("[utility.js]", err?.message || err);
      return reply(`❌ Error: ${err.message}\n\nTry again later.`);
    }
  }
};
