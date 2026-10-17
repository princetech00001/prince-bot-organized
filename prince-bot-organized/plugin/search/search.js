import axios from "axios";
import yts from "yt-search";
import fs from "fs";
import { BOT_CONFIG } from "../../config.js";

export default {

  command: [
    "bible", "quran",
    "define", "weather",
    "image",
    "wiki", "wikipedia",
    "google", "web",
    "lyrics"
  ],

  run: async ({ sock, msg, body, cmd, isOwner }) => {

    const from = msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();

    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    if (!query && !["owner"].includes(cmd)) {
      const usageMap = {
        bible: "📖 Usage: .bible John 3:16",
        quran: "📖 Usage: .quran 1",
        define: "📘 Usage: .define <word>",
        weather: "🌤 Usage: .weather <city>",
        yts: "🎬 Usage: .yts <search query>",
        song2: "🎵 Usage: .song2 <song name>",
        wiki: "🌐 Usage: .wiki <topic>",
        wikipedia: "🌐 Usage: .wikipedia <topic>",
        google: "🔍 Usage: .google <query>",
        web: "🔍 Usage: .web <query>",
        image: "🖼 Usage: .image <search term>",
        lyrics: "🎵 Usage: .lyrics <song name>",
        glowingtext: "✨ Usage: .glowingtext <your text>",
        setprefix: "⚙️ Usage: .setprefix <new prefix>"
      };
      if (usageMap[cmd]) return reply(usageMap[cmd]);
    }

    try {

      // ══════════════════════════════
      // 📖 RELIGION
      // ══════════════════════════════

      if (cmd === "bible") {
        const res = await axios.get(`https://bible-api.com/${encodeURIComponent(query)}`, { timeout: 8000 });
        return reply(`📖 *${res.data.reference}*\n\n${res.data.text.trim()}`);
      }

      if (cmd === "quran") {
        if (isNaN(args[0])) return reply("📖 Usage: .quran <surah number> e.g .quran 1");
        const res = await axios.get(`https://api.alquran.cloud/v1/surah/${args[0]}/en.asad`, { timeout: 8000 });
        const surah = res.data.data;
        const ayahs = surah.ayahs.slice(0, 10).map(a => `*${a.numberInSurah}.* ${a.text}`).join("\n\n");
        return reply(`📖 *Surah ${surah.englishName}* (${surah.name})\n_${surah.englishNameTranslation}_\n\n${ayahs}${surah.ayahs.length > 10 ? "\n\n_(Showing first 10 ayahs)_" : ""}`);
      }

      // ══════════════════════════════
      // 🔍 SEARCH
      // ══════════════════════════════

      if (cmd === "define") {
        const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(args[0])}`, { timeout: 8000 });
        const entry = res.data[0];
        const meanings = entry.meanings.slice(0, 2).map(m => {
          const defs = m.definitions.slice(0, 2).map((d, i) => `  ${i + 1}. ${d.definition}`).join("\n");
          return `*${m.partOfSpeech}*\n${defs}`;
        }).join("\n\n");
        const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || "";
        return reply(`📘 *${entry.word}* ${phonetic}\n\n${meanings}`);
      }

      if (cmd === "weather") {
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(query)}?format=4`, { timeout: 8000 });
        return reply(`🌤️ *Weather — ${query}*\n\n${res.data}`);
      }

      if (cmd === "yts") {
        const search = await yts(query);
        const vids = search.videos.slice(0, 3);
        if (!vids.length) return reply("❌ No results found.");
        const list = vids.map((v, i) =>
          `*${i + 1}. ${v.title}*\n⏱ ${v.timestamp} | 👁 ${v.views.toLocaleString()} views\n🔗 ${v.url}`
        ).join("\n\n");
        return reply(`🎬 *YouTube Search: ${query}*\n\n${list}`);
      }

      if (cmd === "song2") {
        const search = await yts(query);
        const vid = search.videos[0];
        if (!vid) return reply("❌ No results found.");
        return reply(`🎵 *${vid.title}*\n👤 ${vid.author.name}\n⏱ ${vid.timestamp}\n👁 ${vid.views.toLocaleString()} views\n🔗 ${vid.url}\n\n_Use any YouTube MP3 converter to download._`);
      }

      if (cmd === "wiki" || cmd === "wikipedia") {
        const searchRes = await axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/ /g, "_"))}`,
          { timeout: 10000 }
        );
        const page = searchRes.data;
        if (page.type === "disambiguation") {
          return reply(`🌐 *${page.title}* is a disambiguation page.\n\nPlease be more specific, e.g: .wiki ${query} (country)`);
        }
        const text = page.extract
          ? page.extract.slice(0, 800) + (page.extract.length > 800 ? "..." : "")
          : "No summary available.";
        return reply(`🌐 *${page.title}*\n\n${text}\n\n🔗 ${page.content_urls?.desktop?.page || "https://en.wikipedia.org"}`);
      }

      if (cmd === "google" || cmd === "web") {
        // Using DuckDuckGo instant answers (free, no key needed)
        const res = await axios.get(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`,
          { timeout: 10000 }
        );
        const data = res.data;
        let result = "";

        if (data.AbstractText) {
          result = `📝 *${data.Heading}*\n\n${data.AbstractText.slice(0, 500)}`;
          if (data.AbstractURL) result += `\n\n🔗 ${data.AbstractURL}`;
        } else if (data.Answer) {
          result = `✅ *Answer:* ${data.Answer}`;
        } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          const topics = data.RelatedTopics
            .filter(t => t.Text)
            .slice(0, 3)
            .map((t, i) => `${i + 1}. ${t.Text.slice(0, 120)}`)
            .join("\n\n");
          result = `🔍 *Results for: ${query}*\n\n${topics}`;
        } else {
          result = `🔍 No instant results for *"${query}"*.\n\nTry searching directly:\nhttps://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
        return reply(result);
      }

      if (cmd === "lyrics") {
        // Using lyrics.ovh (free API)
        const parts = query.split(" ");
        const artist = parts[0];
        const song = parts.slice(1).join(" ") || parts[0];
        try {
          const res = await axios.get(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`,
            { timeout: 10000 }
          );
          const lyricsText = res.data.lyrics.slice(0, 1500);
          return reply(`🎵 *${query.toUpperCase()}*\n\n${lyricsText}${res.data.lyrics.length > 1500 ? "\n\n_(lyrics truncated)_" : ""}`);
        } catch {
          // Fallback: search YouTube for the song
          const search = await yts(`${query} lyrics`);
          const vid = search.videos[0];
          return reply(`🎵 Lyrics not found for *"${query}"*\n\nYou can check:\n🔗 ${vid ? vid.url : "https://genius.com"}`);
        }
      }

      // ══════════════════════════════
      // 🖼 IMAGE SEARCH
      // ══════════════════════════════

      if (cmd === "image") {
        // Using Unsplash (replace YOUR_UNSPLASH_KEY with your actual key)
        const UNSPLASH_KEY = process.env.UNSPLASH_KEY || "YOUR_UNSPLASH_KEY";
        if (UNSPLASH_KEY === "YOUR_UNSPLASH_KEY") {
          // Fallback to picsum with a label
          return reply(`🖼 Image Search: *${query}*\n\nGet images here:\nhttps://unsplash.com/s/photos/${encodeURIComponent(query)}\n\n_Tip: Set UNSPLASH_KEY in .env to enable direct image sending._`);
        }
        const res = await axios.get(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${UNSPLASH_KEY}`,
          { timeout: 10000 }
        );
        if (!res.data.results.length) return reply(`❌ No images found for: ${query}`);
        const img = res.data.results[0].urls.regular;
        return sock.sendMessage(from, {
          image: { url: img },
          caption: `🖼 *${query}*\n📸 via Unsplash`
        }, { quoted: msg });
      }

      // ══════════════════════════════
      // 🎨 PHOTO EFFECTS
      // ══════════════════════════════

      if (cmd === "glowingtext") {
        const url = `https://api.popcat.xyz/text?text=${encodeURIComponent(query)}`;
        return sock.sendMessage(from, {
          image: { url },
          caption: `✨ *Glowing Text:* ${query}`
        }, { quoted: msg });
      }

      // ══════════════════════════════
      // 👑 OWNER
      // ══════════════════════════════

      if (cmd === "owner") {
        return reply(`👑 *BOT OWNER*\n\n📱 Number: +${BOT_CONFIG.OWNER[0]}\n🤖 Bot: ${BOT_CONFIG.BOT_NAME || "PRINCE X UNKNOWN BOT"}`);
      }

      // ══════════════════════════════
      // ⚙️ SETTINGS
      // ══════════════════════════════

      if (cmd === "setprefix") {
        if (!isOwner) return reply("❌ This command is for the owner only.");
        if (!args[0]) return reply(`⚙️ Usage: .setprefix !\n\n📌 Current prefix: *${BOT_CONFIG.PREFIX}*`);
        const old = BOT_CONFIG.PREFIX;
        BOT_CONFIG.PREFIX = args[0];
        return reply(`✅ Prefix changed!\n\n📌 Old: *${old}*\n📌 New: *${args[0]}*`);
      }

    } catch (err) {
      console.error("[search.js]", err?.message || err);
      return reply(`❌ Command failed: ${err?.response?.data?.message || err.message || "Unknown error"}\n\nTry again later.`);
    }
  }
};
