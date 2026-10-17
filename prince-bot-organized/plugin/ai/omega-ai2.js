import axios from "axios";
import fs from "fs";
import https from "https";
import http from "http";

const OMEGA = "https://omegatech-api.dixonomega.tech";

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function get(url) {
  const res = await axios.get(url, {
    timeout: 40000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }
  });
  return res.data;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy();
        try { fs.unlinkSync(dest); } catch {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

// ─── Get quoted image URL from message ───────────────────────────────────────
function getQuotedImgUrl(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx) return null;
  const q = ctx.quotedMessage;
  return q?.imageMessage?.url || q?.videoMessage?.url || null;
}

export default {
  command: [
    // 🎵 Song generation (sonu3)
    "suno", "sonu", "makemusic", "aimusic",

    // 🔊 TTS v3 with voice selection
    "ttsv3", "tts3", "speakv3",

    // 🎨 NanoBanana image gen
    "nano", "nanogen", "nanobanan",

    // 🎨 NanoBanana2 image gen
    "nano2", "nanogen2",

    // 🎨 NanoBanana Pro (needs image)
    "nanopro", "nananapro",

    // 👁️ Qwen Vision (image + prompt)
    "qwen", "qwenvl", "vision",

    // 🧠 WRM GPT (image analysis)
    "wrmgpt", "wrm", "analyzeimg",

    // 🎨 Gemini Flash2 (image + prompt)
    "gemflash", "gemflash2",

    // 🔓 Jailbreak GPT
    "jailbreak", "jb", "uncensored",
  ],

  async run({ sock, msg, from, cmd, body, senderJid }) {
    const args  = body.trim().split(" ").slice(1);
    const input = args.join(" ").trim();
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });
    const react = (e) => sock.sendMessage(from, { react: { text: e, key: msg.key } }).catch(() => {});

    const sendImg = async (url, caption) => {
      try {
        await sock.sendMessage(from, { image: { url }, caption }, { quoted: msg });
      } catch {
        const out = `/tmp/img_${Date.now()}.jpg`;
        await downloadFile(url, out);
        const buf = fs.readFileSync(out);
        await sock.sendMessage(from, { image: buf, caption }, { quoted: msg });
        try { fs.unlinkSync(out); } catch {}
      }
    };

    const sendAudio = async (url) => {
      try {
        await sock.sendMessage(from, { audio: { url }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
      } catch {
        const out = `/tmp/audio_${Date.now()}.mp3`;
        await downloadFile(url, out);
        const buf = fs.readFileSync(out);
        await sock.sendMessage(from, { audio: buf, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
        try { fs.unlinkSync(out); } catch {}
      }
    };

    await react("⏳");

    try {

      // ════════════════════════════════════════════════════════════════════
      // 🎵 SUNO/SONU3 — AI Music Generation
      // ?prompt= → url (mp3), title, lyrics, thumbnail, duration
      // ════════════════════════════════════════════════════════════════════
      if (["suno","sonu","makemusic","aimusic"].includes(cmd)) {
        if (!input) return reply(
          `🎵 *AI MUSIC GENERATOR*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .suno <describe your song>\n\n` +
          `Examples:\n` +
          `• .suno a sad love song about missing someone\n` +
          `• .suno upbeat afrobeat song about success\n` +
          `• .suno dark rap beat with deep bass\n\n` +
          `_⏳ Generation takes 30-60 seconds_`
        );

        await reply(`🎵 *Generating your song...*\n\n_"${input}"_\n\n⏳ This takes 30-60 seconds, please wait...`);

        const d = await get(`${OMEGA}/api/ai/sonu3?prompt=${encodeURIComponent(input)}`);

        if (!d?.success) throw new Error(d?.error || "Suno generation failed");

        const audioUrl   = d?.url || d?.result?.url || d?.result?.audio_url;
        const title      = d?.title || d?.result?.title || input;
        const thumbnail  = d?.thumbnail || d?.result?.thumbnail || "";
        const duration   = d?.duration || d?.result?.duration || 0;
        const lyrics     = d?.lyrics || d?.result?.lyrics || "";

        if (!audioUrl) throw new Error("No audio URL returned from Suno");

        // Send thumbnail if available
        if (thumbnail) {
          await sock.sendMessage(from, {
            image: { url: thumbnail },
            caption:
              `🎵 *${title}*\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `⏱️ Duration: ${Math.floor(duration)}s\n` +
              `🎼 Tags: ${d?.tags || "AI Generated"}\n` +
              `━━━━━━━━━━━━━━━━━━━━━\n` +
              `${lyrics ? lyrics.slice(0, 300) + (lyrics.length > 300 ? "..." : "") : ""}`
          }, { quoted: msg });
        }

        // Send the audio
        await sendAudio(audioUrl);

        await react("✅");
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🔊 TTS V3 — with voice selection
      // ?text=&voice= → url (mp3)
      // voices: woman1, woman2, woman3, man1, man2, man3
      // ════════════════════════════════════════════════════════════════════
      if (["ttsv3","tts3","speakv3"].includes(cmd)) {
        const voices = ["woman1","woman2","woman3","man1","man2","man3"];

        if (!input) return reply(
          `🔊 *TEXT TO SPEECH V3*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .ttsv3 <voice> <text>\n\n` +
          `*Available voices:*\n` +
          `👩 woman1, woman2, woman3\n` +
          `👨 man1, man2, man3\n\n` +
          `Examples:\n` +
          `• .ttsv3 woman1 Hello everyone!\n` +
          `• .ttsv3 man2 Welcome to my bot\n` +
          `• .ttsv3 Hello world _(auto voice)_`
        );

        // Check if first arg is a voice name
        let voice = "woman1";
        let text  = input;
        if (voices.includes(args[0]?.toLowerCase())) {
          voice = args[0].toLowerCase();
          text  = args.slice(1).join(" ").trim();
        }

        if (!text) return reply("❌ Please provide text after the voice name.\n\nExample: .ttsv3 woman1 Hello!");
        if (text.length > 500) return reply("❌ Text too long. Max 500 characters.");

        const d = await get(`${OMEGA}/api/ai/text2speech-v3?text=${encodeURIComponent(text)}&voice=${voice}`);

        const audioUrl = d?.url || d?.result?.url || d?.audio || d?.result;
        if (!audioUrl || typeof audioUrl !== "string") throw new Error(d?.error || "TTS V3 returned no audio");

        await react("✅");
        await reply(`🔊 *TTS V3 — ${voice}*\n\n_"${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"_`);
        await sendAudio(audioUrl);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🎨 NANO BANANA — Image Generation (?prompt=)
      // ════════════════════════════════════════════════════════════════════
      if (["nano","nanogen","nanobanan"].includes(cmd)) {
        if (!input) return reply(
          `🎨 *AI IMAGE GEN*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .nano <image description>\n\n` +
          `Example: .nano a futuristic city at sunset`
        );

        await reply(`🎨 *Generating image...*\n\n_${input}_\n\n⏳ Please wait...`);

        // Use pollinations.ai — free, reliable, no key needed
        const seed = Math.floor(Math.random() * 999999);
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(input)}?seed=${seed}&width=1024&height=1024&nologo=true`;

        // Verify image loads
        try {
          const check = await axios.head(imgUrl, { timeout: 30000 });
          if (check.status !== 200) throw new Error("Image not ready");
        } catch {
          // Try with smaller size
          const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(input)}?seed=${seed}&width=512&height=512&nologo=true`;
          await react("✅");
          await sendImg(fallbackUrl, `🎨 *AI Image*\n\n_${input}_`);
          return;
        }

        await react("✅");
        await sendImg(imgUrl, `🎨 *AI Image*\n\n_${input}_`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🎨 NANO BANANA 2 — Image Generation (?prompt= → image)
      // ════════════════════════════════════════════════════════════════════
      if (["nano2","nanogen2"].includes(cmd)) {
        if (!input) return reply(
          `🎨 *AI IMAGE GEN 2*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .nano2 <image description>\n\n` +
          `Example: .nano2 anime girl with silver hair in a forest`
        );

        await reply(`🎨 *Generating image...*\n\n_${input}_\n\n⏳ Please wait...`);

        const seed = Math.floor(Math.random() * 999999);
        const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(input + ", anime style")}?seed=${seed}&width=1024&height=1024&nologo=true&model=flux`;

        await react("✅");
        await sendImg(imgUrl, `🎨 *AI Image 2*\n\n_${input}_`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🎨 NANO BANANA PRO — Image editing (needs quoted image + prompt)
      // ════════════════════════════════════════════════════════════════════
      if (["nanopro","nananapro"].includes(cmd)) {
        const imgUrl = getQuotedImgUrl(msg);
        if (!imgUrl || !input) return reply(
          `🎨 *NANO BANANA PRO*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: Reply/quote an image + .nanopro <instruction>\n\n` +
          `Example: Quote photo + .nanopro make it look like anime`
        );

        await reply(`🎨 *NanoBanana Pro editing...*\n\n_${input}_`);

        const d = await get(
          `${OMEGA}/api/ai/nano-banana-pro?image=${encodeURIComponent(imgUrl)}&prompt=${encodeURIComponent(input)}`
        );
        const resultUrl = d?.image || d?.result?.image || d?.url || d?.result?.url;
        if (!resultUrl) throw new Error(d?.error || "NanoBanana Pro returned no image");

        await react("✅");
        await sendImg(resultUrl, `🎨 *Nano Banana Pro*\n\n_${input}_`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 👁️ QWEN 3 VL — Vision AI (image + prompt)
      // ════════════════════════════════════════════════════════════════════
      if (["qwen","qwenvl","vision"].includes(cmd)) {
        const imgUrl = getQuotedImgUrl(msg);
        if (!imgUrl) return reply(
          `👁️ *QWEN VISION AI*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: Reply/quote an image + .qwen <question about it>\n\n` +
          `Examples:\n` +
          `• Quote photo + .qwen what is in this image?\n` +
          `• Quote photo + .qwen describe this scene in detail\n` +
          `• Quote photo + .qwen read the text in this image`
        );

        const question = input || "Describe this image in detail";
        await reply(`👁️ *Qwen analyzing image...*`);

        // Try Qwen first, fallback to working vision APIs
        let text = null;
        const errors = [];

        // API 1 — OmegaTech Qwen
        try {
          const d = await get(`${OMEGA}/api/ai/Qwen-3-vl?image=${encodeURIComponent(imgUrl)}&prompt=${encodeURIComponent(question)}`);
          text = d?.result?.response || d?.result?.answer || d?.result?.text
               || d?.response || d?.answer || d?.text || d?.content;
        } catch (e) { errors.push("qwen: " + e.message); }

        // API 2 — siputzx gemini vision
        if (!text) {
          try {
            const d = await get(`https://api.siputzx.my.id/api/ai/gemini-vision?imageUrl=${encodeURIComponent(imgUrl)}&text=${encodeURIComponent(question)}`);
            text = d?.data || d?.result || d?.response || d?.answer;
          } catch (e) { errors.push("gemini-vision: " + e.message); }
        }

        // API 3 — ryzendesu vision
        if (!text) {
          try {
            const d = await get(`https://api.ryzendesu.vip/api/ai/gemini?text=${encodeURIComponent(question)}&url=${encodeURIComponent(imgUrl)}`);
            text = d?.data || d?.result || d?.response;
          } catch (e) { errors.push("ryzen-vision: " + e.message); }
        }

        if (!text) throw new Error("All vision AIs failed:\n" + errors.join("\n"));

        await react("✅");
        return reply(
          `👁️ *Vision AI*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `${text.trim()}`
        );
      }

      // ════════════════════════════════════════════════════════════════════
      // 🧠 WRM GPT — Image analysis (?image=)
      // ════════════════════════════════════════════════════════════════════
      if (["wrmgpt","wrm","analyzeimg"].includes(cmd)) {
        const imgUrl = getQuotedImgUrl(msg);
        if (!imgUrl) return reply(
          `🧠 *WRM GPT — Image Analysis*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: Reply/quote an image + .wrmgpt <optional question>\n\n` +
          `Example: Quote photo + .wrmgpt what breed is this dog?`
        );

        const question = input || "Analyze and describe this image";
        await reply(`🧠 *WRM GPT analyzing...*`);

        const d = await get(
          `${OMEGA}/api/ai/wrmgpt?url=${encodeURIComponent(imgUrl)}&prompt=${encodeURIComponent(question)}`
        );

        const text = d?.result?.response || d?.result?.answer || d?.result?.text
                  || d?.response || d?.answer || d?.text;
        if (!text) throw new Error(d?.error || "WRM GPT returned no response");

        await react("✅");
        return reply(`🧠 *WRM GPT*\n━━━━━━━━━━━━━━━━━━━━━\n${text.trim()}`);
      }

      // ════════════════════════════════════════════════════════════════════
      // 🎨 GEMINI FLASH2 — Image + prompt editing (?url=&prompt=)
      // ════════════════════════════════════════════════════════════════════
      if (["gemflash","gemflash2"].includes(cmd)) {
        const imgUrl = getQuotedImgUrl(msg);
        if (!imgUrl || !input) return reply(
          `🎨 *GEMINI FLASH 2*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: Reply/quote an image + .gemflash <instruction>\n\n` +
          `Example: Quote photo + .gemflash make the background white`
        );

        await reply(`🎨 *Gemini Flash2 processing...*\n\n_${input}_`);

        const d = await get(
          `${OMEGA}/api/ai/Gemini-flash2?url=${encodeURIComponent(imgUrl)}&prompt=${encodeURIComponent(input)}`
        );

        const resultUrl = d?.result?.url || d?.result?.image || d?.result?.image_url
                        || d?.url || d?.image;
        const text      = d?.result?.text || d?.result?.response || d?.text;

        if (resultUrl && typeof resultUrl === "string" && resultUrl.startsWith("http")) {
          await react("✅");
          await sendImg(resultUrl, `🎨 *Gemini Flash 2*\n\n_${input}_`);
        } else if (text) {
          await react("✅");
          return reply(`🎨 *Gemini Flash 2*\n━━━━━━━━━━━━━━━━━━━━━\n${text.trim()}`);
        } else {
          throw new Error(d?.error || "Gemini Flash2 returned no output");
        }
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🔓 JAILBREAK GPT — Uncensored AI (?prompt=)
      // ════════════════════════════════════════════════════════════════════
      if (["jailbreak","jb","uncensored"].includes(cmd)) {
        if (!input) return reply(
          `🔓 *JAILBREAK GPT*\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .jailbreak <your question>\n\n` +
          `⚠️ _Owner use only — no filter mode_`
        );

        await reply(`🔓 *Jailbreak GPT thinking...*`);

        const d = await get(`${OMEGA}/api/ai/jailbreak-Gpt?prompt=${encodeURIComponent(input)}`);

        const text = d?.result?.response || d?.result?.answer || d?.result?.text
                  || d?.response || d?.answer || d?.text || d?.result;
        if (!text || typeof text !== "string") throw new Error(d?.error || "Jailbreak GPT returned no response");

        await react("✅");
        return reply(`🔓 *Jailbreak GPT*\n━━━━━━━━━━━━━━━━━━━━━\n${text.trim()}`);
      }

    } catch (err) {
      await react("❌");
      console.error(`[omega-ai2.js] ${cmd}: ${err.message}`);
      return reply(
        `❌ *${cmd.toUpperCase()} FAILED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${err.message.split("\n")[0]}\n\n` +
        `Try again later.`
      );
    }
  }
};
