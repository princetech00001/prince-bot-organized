// Search + download a song as playable audio — adapted from a similar
// command in SUKUNA MD. Uses a couple of free public download APIs with
// fallbacks so one dead endpoint doesn't take the whole command down.
import axios from "axios";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function safeFileName(value) {
  return String(value || "audio").replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 100) || "audio";
}

async function fetchAudioBuffer(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) throw new Error("Provider returned an invalid audio URL");
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: MAX_AUDIO_BYTES,
    maxRedirects: 6,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "audio/mpeg,audio/*,application/octet-stream;q=0.8,*/*;q=0.5" },
    validateStatus: () => true
  });
  const buffer = Buffer.from(response.data || "");
  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  if (response.status < 200 || response.status >= 300) throw new Error(`Audio download HTTP ${response.status}`);
  if (!buffer.length || contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error("Provider returned an invalid audio response");
  }
  return buffer;
}

export default {
  command: ["play", "song", "music"],

  async run({ sock, msg, from, body }) {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const query = body.trim().split(" ").slice(1).join(" ").trim();

    if (!query) return reply("🎵 *Usage:* .play <song name>\nExample: .play Essence Wizkid");

    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

    const strategies = [
      async () => {
        const { data } = await axios.get(`https://apis.davidcyril.name.ng/play?query=${encodeURIComponent(query)}`, { timeout: 30000 });
        if (data.status && data.result?.download_url) {
          return {
            url: data.result.download_url, title: data.result.title,
            thumbnail: data.result.thumbnail, duration: data.result.duration,
            author: data.result.author || data.result.artist || "YouTube"
          };
        }
        throw new Error("Primary API failed");
      },
      async () => {
        const searchRes = await axios.get(`https://apis.davidcyril.name.ng/youtube/search?query=${encodeURIComponent(query)}`, { timeout: 15000 });
        const video = searchRes.data?.results?.[0];
        if (!video?.url) throw new Error("Search failed");
        const dlRes = await axios.get(`https://apis.davidcyril.name.ng/download/ytmp3?url=${encodeURIComponent(video.url)}`, { timeout: 30000 });
        if (dlRes.data.success && dlRes.data.result?.download_url) {
          return {
            url: dlRes.data.result.download_url, title: video.title,
            thumbnail: video.thumbnail, duration: video.duration, author: video.author || "YouTube"
          };
        }
        throw new Error("Secondary API failed");
      }
    ];

    for (const strategy of strategies) {
      try {
        const res = await strategy();
        if (res?.url) {
          const title = res.title || query;
          const author = res.author || "YouTube";
          const duration = res.duration || "";

          // Show what was found BEFORE downloading/sending the audio, so the
          // person isn't left staring at a blank chat during the download.
          const infoCaption = `🎵 *${title}*\n👤 ${author}${duration ? `\n⏱️ ${duration}` : ""}`;
          if (res.thumbnail) {
            await sock.sendMessage(from, { image: { url: res.thumbnail }, caption: infoCaption }, { quoted: msg }).catch(() =>
              sock.sendMessage(from, { text: infoCaption }, { quoted: msg })
            );
          } else {
            await sock.sendMessage(from, { text: infoCaption }, { quoted: msg });
          }

          const audioBuffer = await fetchAudioBuffer(res.url);

          await sock.sendMessage(from, {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName: `${safeFileName(title)}.mp3`,
            ptt: false
          }, { quoted: msg });

          await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
          return;
        }
      } catch (e) {
        continue;
      }
    }

    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
    return reply(`❌ Could not find: *${query}*`);
  }
};
