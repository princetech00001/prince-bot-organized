import axios from "axios";
import fs from "fs";
import https from "https";
import http from "http";

const OMEGA = "https://omegatech-api.dixonomega.tech";

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
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

// ─── Poll flux-pro2 task ──────────────────────────────────────────────────────
async function pollFluxPro2(taskId, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 4000));
    try {
      const d = await get(`${OMEGA}/api/ai/flux-pro2?action=result&task_id=${taskId}`);
      if (d?.success && d?.result) return d.result;
      if (d?.status === "failed") throw new Error("Flux Pro2 generation failed");
    } catch (e) {
      if (e.message.includes("failed")) throw e;
    }
  }
  throw new Error("Flux Pro2 timed out after 60s");
}

// ─── PLUGIN ───────────────────────────────────────────────────────────────────
export default {
  command: [
    "gpt5", "gpt5plus",           // GPT-5 Plus (text + optional image)
    "gptx", "omegagpt",           // GPT basic (?question=)
    "glm", "glmai",               // GLM AI (?prompt= → result.answer)
    "flux",                       // Flux image gen (direct binary)
    "fluxpro", "fluxpro2",        // Flux Pro2 (async task_id poll)
    "fluxedit",                   // Flux Pro2 edit (image + prompt)
    "gptedit", "gptimage",        // GPT image edit (imageUrl + text)
    "faceswap", "swap"            // Face swap (sourceUrl + targetUrl)
  ],

  async run({ sock, msg, from, cmd, body, senderJid }) {
    const args  = body.trim().split(" ").slice(1);
    const input = args.join(" ").trim();
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });
    const react = (e) => sock.sendMessage(from, { react: { text: e, key: msg.key } }).catch(() => {});

    // ── Helper: send image ────────────────────────────────────────────────────
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

    // ── Helper: send audio ────────────────────────────────────────────────────
    const sendAudio = async (url, caption) => {
      try {
        await sock.sendMessage(from, { audio: { url }, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
        if (caption) await reply(caption);
      } catch {
        const out = `/tmp/tts_${Date.now()}.mp3`;
        await downloadFile(url, out);
        const buf = fs.readFileSync(out);
        await sock.sendMessage(from, { audio: buf, mimetype: "audio/mpeg", ptt: false }, { quoted: msg });
        try { fs.unlinkSync(out); } catch {}
      }
    };

    // ── Get quoted image URL ──────────────────────────────────────────────────
    const getQuotedImgUrl = () => {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx) return null;
      const q = ctx.quotedMessage;
      if (q?.imageMessage?.url) return q.imageMessage.url;
      if (q?.videoMessage?.url) return q.videoMessage.url;
      return null;
    };

    await react("⏳");

    try {

      // ════════════════════════════════════════════════════════════════════
      // 🤖 GPT-5 PLUS — ?text= + optional ?imageUrl=
      // ════════════════════════════════════════════════════════════════════
      if (["gpt5","gpt5plus"].includes(cmd)) {
        if (!input) return reply(
          `🤖 *GPT-5 PLUS*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .gpt5 <your question>\n` +
          `With image: Reply/quote an image + .gpt5 <question>\n\n` +
          `Example: .gpt5 Explain quantum physics`
        );

        const imgUrl = getQuotedImgUrl();
        let url = `${OMEGA}/api/ai/gpt5plus?text=${encodeURIComponent(input)}`;
        if (imgUrl) url += `&imageUrl=${encodeURIComponent(imgUrl)}`;

        const d = await get(url);
        const text = d?.result?.response || d?.result?.text || d?.result?.answer
                  || d?.response || d?.text || d?.answer;
        if (!text) throw new Error(d?.error || "GPT-5 Plus returned no response");

        await react("✅");
        return reply(`🤖 *GPT-5 Plus*\n━━━━━━━━━━━━━━━━━━━━━\n${text.trim()}`);
      }

      // ════════════════════════════════════════════════════════════════════
      // 💬 GPT BASIC — ?question=
      // ════════════════════════════════════════════════════════════════════
      if (["gptx","omegagpt"].includes(cmd)) {
        if (!input) return reply(
          `💬 *GPT*\n━━━━━━━━━━━━━━━━━━━━━\nUsage: .gptx <your question>`
        );

        const d = await get(`${OMEGA}/api/ai/gpt?question=${encodeURIComponent(input)}`);
        const text = d?.result?.response || d?.result?.text || d?.result?.answer
                  || d?.response || d?.text || d?.answer;
        if (!text) throw new Error(d?.error || "GPT returned no response");

        await react("✅");
        return reply(`💬 *GPT*\n━━━━━━━━━━━━━━━━━━━━━\n${text.trim()}`);
      }

      // ════════════════════════════════════════════════════════════════════
      // 🧠 GLM AI — ?prompt= → result.answer
      // ════════════════════════════════════════════════════════════════════
      if (["glm","glmai"].includes(cmd)) {
        if (!input) return reply(
          `🧠 *GLM AI*\n━━━━━━━━━━━━━━━━━━━━━\nUsage: .glm <your question>\n\n` +
          `GLM is a powerful Chinese AI model by Z.ai`
        );

        const d = await get(`${OMEGA}/api/ai/glm?prompt=${encodeURIComponent(input)}`);
        const text = d?.result?.answer || d?.result?.response || d?.result?.text
                  || d?.answer || d?.response;
        if (!text) throw new Error(d?.error || "GLM returned no response");

        await react("✅");
        return reply(`🧠 *GLM AI*\n━━━━━━━━━━━━━━━━━━━━━\n${text.trim()}`);
      }

      // ════════════════════════════════════════════════════════════════════
      // 🔊 GEMINI TTS — ?text= → result = mp3 URL
      // ════════════════════════════════════════════════════════════════════
      if (["tts","speak","voice"].includes(cmd)) {
        if (!input) return reply(
          `🔊 *TEXT TO SPEECH*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .tts <text to speak>\n\nExample: .tts Hello everyone, welcome!`
        );
        if (input.length > 500) return reply("❌ Text too long. Max 500 characters.");

        const d = await get(`${OMEGA}/api/ai/Gemini-tts?text=${encodeURIComponent(input)}`);
        const audioUrl = d?.result || d?.url || d?.audio_url || d?.data?.url;
        if (!audioUrl || typeof audioUrl !== "string") throw new Error(d?.error || "TTS returned no audio URL");

        await react("✅");
        await sendAudio(audioUrl, `🔊 *TTS:* ${input.slice(0, 80)}${input.length > 80 ? "..." : ""}`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🎨 FLUX — direct binary image generation
      // ════════════════════════════════════════════════════════════════════
      if (cmd === "flux") {
        if (!input) return reply(
          `🎨 *FLUX IMAGE*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .flux <image description>\n\nExample: .flux a cyberpunk city at night`
        );

        await reply(`🎨 *Generating image...*\n\n_Prompt: ${input}_`);

        // Flux returns binary — download directly
        const out = `/tmp/flux_${Date.now()}.jpg`;
        const res = await axios.get(
          `${OMEGA}/api/ai/flux?prompt=${encodeURIComponent(input)}`,
          { responseType: "arraybuffer", timeout: 60000, headers: { "User-Agent": "Mozilla/5.0" } }
        );
        fs.writeFileSync(out, Buffer.from(res.data));
        const buf = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}

        await react("✅");
        await sock.sendMessage(from, {
          image: buf,
          caption: `🎨 *FLUX*\n\n_${input}_`
        }, { quoted: msg });
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🎨 FLUX PRO2 — async task_id polling
      // ════════════════════════════════════════════════════════════════════
      if (["fluxpro","fluxpro2"].includes(cmd)) {
        if (!input) return reply(
          `🎨 *FLUX PRO 2*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: .fluxpro <image description>\n\nExample: .fluxpro a beautiful sunset over the ocean`
        );

        await reply(`🎨 *Flux Pro 2 generating...*\n\n_${input}_\n\n⏳ This may take 30-60 seconds`);

        // Step 1: Start generation
        const d = await get(`${OMEGA}/api/ai/flux-pro2?action=generate&prompt=${encodeURIComponent(input)}`);
        const taskId = d?.task_id || d?.result?.task_id;
        if (!taskId) throw new Error(d?.error || "No task_id returned");

        // Step 2: Poll for result
        const imgUrl = await pollFluxPro2(taskId);
        if (!imgUrl) throw new Error("No image URL in result");

        await react("✅");
        await sendImg(typeof imgUrl === "string" ? imgUrl : imgUrl.url || imgUrl.image_url, `🎨 *FLUX PRO 2*\n\n_${input}_`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // ✏️ FLUX PRO2 EDIT — image + prompt
      // ════════════════════════════════════════════════════════════════════
      if (cmd === "fluxedit") {
        const imgUrl = getQuotedImgUrl();
        if (!imgUrl || !input) return reply(
          `✏️ *FLUX EDIT*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: Reply/quote an image + .fluxedit <what to change>\n\n` +
          `Example: Quote image + .fluxedit make the sky pink`
        );

        await reply(`✏️ *Flux editing image...*\n\n_${input}_\n\n⏳ Please wait...`);

        const d = await get(
          `${OMEGA}/api/ai/flux-pro2-edit?action=generate&prompt=${encodeURIComponent(input)}&image1=${encodeURIComponent(imgUrl)}`
        );
        const taskId = d?.task_id || d?.result?.task_id;
        if (!taskId) throw new Error(d?.error || "No task_id returned");

        const resultUrl = await pollFluxPro2(taskId);
        if (!resultUrl) throw new Error("No image in result");

        await react("✅");
        await sendImg(typeof resultUrl === "string" ? resultUrl : resultUrl.url || resultUrl.image_url, `✏️ *FLUX EDIT*\n\n_${input}_`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 🖼️ GPT IMAGE EDIT — imageUrl + text
      // ════════════════════════════════════════════════════════════════════
      if (["gptedit","gptimage"].includes(cmd)) {
        const imgUrl = getQuotedImgUrl();
        if (!imgUrl || !input) return reply(
          `🖼️ *GPT IMAGE EDIT*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Usage: Reply/quote an image + .gptedit <instruction>\n\n` +
          `Example: Quote image + .gptedit add sunglasses to the person`
        );

        await reply(`🖼️ *GPT editing image...*\n\n_${input}_`);

        const d = await get(
          `${OMEGA}/api/ai/Gpt-image-edit?text=${encodeURIComponent(input)}&imageUrl=${encodeURIComponent(imgUrl)}`
        );
        const resultUrl = d?.result?.url || d?.result?.image_url || d?.result
                        || d?.url || d?.image_url || d?.output;
        if (!resultUrl || typeof resultUrl !== "string") throw new Error(d?.error || "GPT image edit failed");

        await react("✅");
        await sendImg(resultUrl, `🖼️ *GPT EDIT*\n\n_${input}_`);
        return;
      }

      // ════════════════════════════════════════════════════════════════════
      // 👤 FACE SWAP — sourceUrl + targetUrl
      // ════════════════════════════════════════════════════════════════════
      if (["faceswap","swap"].includes(cmd)) {
        // Need 2 image URLs — source (face to use) and target (face to replace)
        // User quotes target image and provides source URL, or vice versa
        const quotedUrl = getQuotedImgUrl();
        const urlFromArgs = args.find(a => a.startsWith("http"));

        let sourceUrl = urlFromArgs || quotedUrl;
        let targetUrl = urlFromArgs && quotedUrl ? quotedUrl : null;

        if (!sourceUrl || !targetUrl) {
          return reply(
            `👤 *FACE SWAP*\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Usage: Reply/quote the *target* image (face to replace)\n` +
            `then type: .faceswap <source image URL>\n\n` +
            `*Source* = face you want to use\n` +
            `*Target* = face to replace in\n\n` +
            `Example:\n` +
            `Quote a photo + .faceswap https://example.com/myface.jpg`
          );
        }

        await reply(`👤 *Swapping faces...*\n\n⏳ Please wait...`);

        const d = await get(
          `${OMEGA}/api/tools/faceswap?sourceUrl=${encodeURIComponent(sourceUrl)}&targetUrl=${encodeURIComponent(targetUrl)}`
        );
        const resultUrl = d?.result?.url || d?.result?.image_url || d?.result
                        || d?.url || d?.output || d?.image;
        if (!resultUrl || typeof resultUrl !== "string") throw new Error(d?.error || "Face swap failed");

        await react("✅");
        await sendImg(resultUrl, `👤 *FACE SWAP RESULT*`);
        return;
      }

    } catch (err) {
      await react("❌");
      console.error(`[omega-ai.js] ${cmd}: ${err.message}`);
      return reply(
        `❌ *${cmd.toUpperCase()} FAILED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${err.message.split("\n")[0]}\n\n` +
        `Try again later.`
      );
    }
  }
};

// ════════════════════════════════════════════════════════════════════════════
// OMEGA AI EXTENDED — added to bottom of omega-ai.js
// ════════════════════════════════════════════════════════════════════════════
