import fs from 'fs';
import https from 'https';
import http from 'http';

// ─── OmegaTech API base ───────────────────────────────────────────────────────
const OMEGA = "https://omegatech-api.dixonomega.tech";

// ─── Core HTTP helpers ────────────────────────────────────────────────────────
async function fetchJson(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers },
    method: options.method || 'GET',
    body: options.body || undefined,
    timeout: 15000
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Download file from URL to local path ────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy();
        try { fs.unlinkSync(dest); } catch {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.destroy();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── Send file then delete ────────────────────────────────────────────────────
async function sendFile(sock, from, msg, filePath, type, mime, caption) {
  try {
    const buf = fs.readFileSync(filePath);
    await sock.sendMessage(from, { [type]: buf, mimetype: mime, caption }, { quoted: msg });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

function isUrl(str) {
  try { new URL(str); return true; } catch { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
// OmegaTech API helpers — each tries Omega first, falls back to free APIs
// ════════════════════════════════════════════════════════════════════════════

// ─── YouTube Audio ────────────────────────────────────────────────────────────
async function tryWithRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < attempts) await new Promise(r => setTimeout(r, i * 1000));
    }
  }
  throw lastErr;
}

async function getYtAudio(query) {
  let videoUrl = query;
  let title = query;
  let thumbnail = '';
  let duration = '0:00';

  // Search if not a URL
  if (!isUrl(query)) {
    const { default: yts } = await import('yt-search');
    const r = await yts(query);
    if (!r.videos.length) throw new Error('No results found for: ' + query);
    videoUrl = r.videos[0].url;
    title    = r.videos[0].title;
    thumbnail = r.videos[0].thumbnail;
    duration  = r.videos[0].timestamp;
  }

  const errors = [];

  // API 1 — apiskeith.top (Omega primary)
  try {
    const d = await tryWithRetry(() => fetchJson(`https://apiskeith.top/download/audio?url=${encodeURIComponent(videoUrl)}`));
    const dl = typeof d === 'string' ? d
      : d?.result?.url || d?.result?.download_url || (typeof d?.result === 'string' ? d.result : null)
      || d?.result?.download_url || d?.download_url || d?.url;
    if (dl) return { url: dl, title: d?.result?.title || title, thumbnail: d?.result?.thumbnail || thumbnail, duration };
  } catch (e) { errors.push('apiskeith.top: ' + e.message); }

  // API 2 — apiskeith.vercel (Omega backup)
  try {
    const d = await tryWithRetry(() => fetchJson(`https://apiskeith.vercel.app/download/audio?url=${encodeURIComponent(videoUrl)}`));
    const dl = typeof d === 'string' ? d
      : d?.result?.url || (typeof d?.result === 'string' ? d.result : null)
      || d?.download_url || d?.url;
    if (dl) return { url: dl, title: d?.result?.title || title, thumbnail: d?.result?.thumbnail || thumbnail, duration };
  } catch (e) { errors.push('apiskeith.vercel: ' + e.message); }

  // API 3 — GiftedTech
  try {
    const d = await tryWithRetry(() => fetchJson(`https://api.giftedtech.co.ke/api/download/dlmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`));
    if (d?.result?.download_url) return {
      url: d.result.download_url,
      title: d.result.title || title,
      thumbnail: d.result.thumbnail || thumbnail,
      duration: d.result.duration || duration
    };
  } catch (e) { errors.push('giftedtech: ' + e.message); }

  // API 4 — xwolf
  try {
    const d = await tryWithRetry(() => fetchJson(`https://apis.xwolf.space/download/audio?url=${encodeURIComponent(videoUrl)}`));
    const dl = typeof d === 'string' ? d
      : d?.result?.url || (typeof d?.result === 'string' ? d.result : null)
      || d?.download_url || d?.url;
    if (dl) return { url: dl, title: d?.result?.title || title, thumbnail: d?.result?.thumbnail || thumbnail, duration };
  } catch (e) { errors.push('xwolf: ' + e.message); }

  // API 5 — agatz fallback
  try {
    const d = await fetchJson(`https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(videoUrl)}`);
    if (d?.data?.downloadUrl || d?.data?.url) return { url: d.data.downloadUrl || d.data.url, title: d.data.title || title, thumbnail, duration };
  } catch (e) { errors.push('agatz: ' + e.message); }

  // API 6 — siputzx fallback
  try {
    const d = await fetchJson(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`);
    if (d?.data?.url || d?.data?.audio) return { url: d.data.url || d.data.audio, title: d.data.title || title, thumbnail, duration };
  } catch (e) { errors.push('siputzx: ' + e.message); }

  // API 7 — ryzendesu fallback
  try {
    const d = await fetchJson(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(videoUrl)}`);
    if (d?.data?.url) return { url: d.data.url, title: d.data.title || title, thumbnail, duration };
  } catch (e) { errors.push('ryzen: ' + e.message); }

  // API 8 — ytdl-core direct
  try {
    const { default: ytdl } = await import('@distube/ytdl-core');
    const info = await ytdl.getInfo(videoUrl);
    title = info.videoDetails.title;
    const formats = ytdl.filterFormats(info.formats, 'audioonly');
    if (formats.length) {
      const fmt = formats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
      return { url: fmt.url, title, thumbnail, duration };
    }
  } catch (e) { errors.push('ytdl-core: ' + e.message); }

  throw new Error('All audio APIs failed:\n' + errors.join('\n'));
}

// ─── YouTube Video ────────────────────────────────────────────────────────────
async function getYtVideo(videoUrl) {
  // NOTE: OmegaTech yt-dl returns HTML (broken) — using reliable fallbacks only
  const errors = [];

  // API 1 — siputzx
  try {
    const d = await fetchJson(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(videoUrl)}`);
    if (d?.data?.url || d?.data?.video) return { url: d.data.url || d.data.video, title: d.data.title || 'YouTube Video' };
  } catch (e) { errors.push('siputzx: ' + e.message); }

  // API 2 — ryzendesu
  try {
    const d = await fetchJson(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`);
    if (d?.data?.url) return { url: d.data.url, title: d.data.title || 'YouTube Video' };
  } catch (e) { errors.push('ryzen: ' + e.message); }

  // API 3 — agatz
  try {
    const d = await fetchJson(`https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(videoUrl)}`);
    if (d?.data?.downloadUrl || d?.data?.url) return { url: d.data.downloadUrl || d.data.url, title: d.data.title || 'YouTube Video' };
  } catch (e) { errors.push('agatz: ' + e.message); }

  // API 4 — ytdl-core direct stream
  try {
    const { default: ytdl } = await import('@distube/ytdl-core');
    const info = await ytdl.getInfo(videoUrl);
    const title = info.videoDetails.title;
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    if (formats.length) {
      const fmt = formats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      return { url: fmt.url, title };
    }
  } catch (e) { errors.push('ytdl-core: ' + e.message); }

  throw new Error('All YouTube video APIs failed:\n' + errors.join('\n'));
}

// ─── Spotify ──────────────────────────────────────────────────────────────────
async function getSpotify(query) {
  const errors = [];

  // ── PRIMARY: OmegaTech — requires ?id=<track_id> ──
  try {
    // Extract track ID from Spotify URL e.g. open.spotify.com/track/4cOdK2wG...
    let trackId = null;
    if (isUrl(query)) {
      const match = query.match(/track\/([a-zA-Z0-9]+)/);
      trackId = match?.[1] || null;
    }
    if (trackId) {
      const d = await fetchJson(`${OMEGA}/api/download/Spotify-dl?id=${trackId}`);
      if (d?.success && d?.result) {
        const r = d.result;
        const url = r.download_url || r.audio?.url || r.url;
        if (url) return {
          url,
          title: r.title || r.name || query,
          artist: r.artist || r.artists?.join(', ') || '',
          duration: r.duration || r.durationFormatted || '',
          cover: r.thumbnail || r.cover || r.image || ''
        };
      }
    }
  } catch (e) { errors.push('omega: ' + e.message); }

  // ── FALLBACK: search YouTube by song name / track ID ──
  try {
    let searchQ = query;
    if (isUrl(query)) {
      // Try to get track name from URL path or use track ID as search
      const trackId = query.match(/track\/([a-zA-Z0-9]+)/)?.[1] || '';
      searchQ = trackId || query;
    }
    return await getYtAudio(searchQ);
  } catch (e) { errors.push('yt-fallback: ' + e.message); }

  throw new Error('Spotify download failed:\n' + errors.join('\n'));
}

// ─── SoundCloud ───────────────────────────────────────────────────────────────
async function getSoundcloud(query) {
  const errors = [];
  // NOTE: OmegaTech soundcloudinfo returns metadata only (empty fields) — no download URL
  // Go straight to working fallbacks

  // ── Fallback 1: siputzx ──
  try {
    const d = await fetchJson(`https://api.siputzx.my.id/api/d/soundcloud?url=${encodeURIComponent(query)}`);
    if (d?.data?.url) return { url: d.data.url, title: d.data.title || query, artist: d.data.artist || '' };
  } catch (e) { errors.push('siputzx: ' + e.message); }

  // ── Fallback 2: ryzendesu ──
  try {
    const d = await fetchJson(`https://api.ryzendesu.vip/api/downloader/soundcloud?url=${encodeURIComponent(query)}`);
    if (d?.data?.url) return { url: d.data.url, title: d.data.title || query };
  } catch (e) { errors.push('ryzen: ' + e.message); }

  // ── Fallback 3: search on YouTube ──
  try {
    // Extract track name from SC URL path
    const pathMatch = query.match(/soundcloud\.com\/[^/]+\/([^/?]+)/);
    const searchQ = pathMatch ? pathMatch[1].replace(/-/g, ' ') : query;
    return await getYtAudio(searchQ);
  } catch (e) { errors.push('yt-fallback: ' + e.message); }

  throw new Error('SoundCloud download failed:\n' + errors.join('\n'));
}

// ─── APK ──────────────────────────────────────────────────────────────────────
async function getApk(query) {
  // OmegaTech apk4free-detail requires a full APK page URL (returns 404 for search terms)
  // If user passes a full APKCombo/APKPure URL, try Omega. Otherwise go to search links.
  const errors = [];

  if (isUrl(query) && (query.includes('apkcombo') || query.includes('apkpure') || query.includes('apk4free'))) {
    try {
      const d = await fetchJson(`${OMEGA}/api/download/apk4free-detail?url=${encodeURIComponent(query)}`);
      if (d?.success && d?.result) {
        const r = d.result;
        const url = r.download_url || r.url || r.apk_url;
        if (url) return {
          url,
          name: r.name || r.title || query,
          version: r.version || '',
          size: r.size || '',
          developer: r.developer || r.dev || ''
        };
      }
    } catch (e) { errors.push('omega: ' + e.message); }
  }

  // ── Always provide search links as result ──
  const q = encodeURIComponent(query);
  return {
    info: true,
    name: query,
    searchUrl: `https://apkpure.com/search?q=${q}`,
    mirrorUrl: `https://www.apkmirror.com/?s=${q}`,
    uptodownUrl: `https://en.uptodown.com/android/search/${q}`
  };
}

// ─── Nude/Movie/Adult download (owner only) ───────────────────────────────────
async function getNudesMovie(query) {
  const errors = [];

  try {
    const param = isUrl(query) ? `url=${encodeURIComponent(query)}` : `query=${encodeURIComponent(query)}`;
    const d = await fetchJson(`${OMEGA}/api/download/nudesmoviedl?${param}`);
    const url = d?.result?.download_url || d?.result?.url || d?.download_url || d?.url;
    if (url) return {
      url,
      title: d?.result?.title || d?.title || query,
      size: d?.result?.size || d?.size || ''
    };
  } catch (e) { errors.push('omega: ' + e.message); }

  throw new Error('Download failed:\n' + errors.join('\n'));
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
async function getTikTok(url) {
  const errors = [];

  try {
    const d = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
    if (d?.code === 0 && d?.data?.play) {
      return { url: d.data.play, title: d.data.title, author: d.data.author?.nickname };
    }
  } catch (e) { errors.push('tikwm: ' + e.message); }

  try {
    const d = await fetchJson(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`);
    if (d?.data?.video) return { url: d.data.video, title: d.data.title };
  } catch (e) { errors.push('siputzx: ' + e.message); }

  throw new Error('All TikTok APIs failed:\n' + errors.join('\n'));
}

// ─── Instagram ────────────────────────────────────────────────────────────────
async function getInstagram(url) {
  const errors = [];

  try {
    const d = await fetchJson(`https://api.siputzx.my.id/api/d/ig?url=${encodeURIComponent(url)}`);
    if (d?.data?.[0]?.url) return { url: d.data[0].url, type: d.data[0].type || 'video' };
  } catch (e) { errors.push('siputzx: ' + e.message); }

  try {
    const d = await fetchJson(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`);
    if (d?.data?.[0]?.url) return { url: d.data[0].url, type: 'video' };
  } catch (e) { errors.push('ryzen: ' + e.message); }

  throw new Error('All Instagram APIs failed:\n' + errors.join('\n'));
}

// ─── Facebook ─────────────────────────────────────────────────────────────────
async function getFacebook(url) {
  const errors = [];

  try {
    const d = await fetchJson(`https://api.siputzx.my.id/api/d/fb?url=${encodeURIComponent(url)}`);
    if (d?.data?.url) return { url: d.data.url };
  } catch (e) { errors.push('siputzx: ' + e.message); }

  throw new Error('All Facebook APIs failed:\n' + errors.join('\n'));
}

// ════════════════════════════════════════════════════════════════════════════
// PLUGIN
// ════════════════════════════════════════════════════════════════════════════
export default {
  command: [
    // YouTube
    'song2', 'mp3', 'audio',
    'ytv', 'mp4', 'ytvideo',
    'yts',
    // Spotify
    'spotify', 'spot',
    // SoundCloud
    'soundcloud', 'sc',
    // APK
    'apk',
    // Social
    'tiktok', 'tt',
    'instagram', 'ig',
    'facebook', 'fb',
    // Adult (owner only)
    'nudesdl', 'moviedl',
    // Utility
    'itunes',
    'mediafire', 'mf',
    'gdrive',
    'gitclone', 'git',
    'download', 'dl',
    'savestatus'
  ],

  async run({ sock, msg, from, cmd, body, isOwner }) {
    const args  = body.trim().split(' ').slice(1);
    const input = args.join(' ').trim();
    const send  = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const wait  = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    // ── YouTube Search ──────────────────────────────────────────────────────
    if (cmd === 'yts') {
      if (!input) return send(`🔍 *YT SEARCH*\nUsage: .yts <song name or keyword>`);
      await wait(`🔍 Searching: *${input}*...`);
      try {
        const { default: yts } = await import('yt-search');
        const r = await yts(input);
        const vids = r.videos.slice(0, 5);
        if (!vids.length) return send('❌ No results found.');
        const txt = vids.map((v, i) =>
          `*${i+1}. ${v.title}*\n   👤 ${v.author.name} | ⏱️ ${v.timestamp}\n   🔗 ${v.url}`
        ).join('\n\n');
        return send(
          `🎬 *YOUTUBE RESULTS*\n━━━━━━━━━━━━━━━━━━━━━\n${txt}\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `💡 .song2 <url> → audio | .ytv <url> → video`
        );
      } catch (e) {
        return send(`❌ Search failed: ${e.message}`);
      }
    }

    // ── YouTube Audio ───────────────────────────────────────────────────────
    if (['song2','mp3','audio'].includes(cmd)) {
      if (!input) return send(
        `🎵 *YOUTUBE AUDIO*\n` +
        `Usage: .song2 <song name or YouTube URL>\n\n` +
        `Example: .song2 Burna Boy last last\n` +
        `Example: .song2 https://youtu.be/xxx`
      );

      await send(`🎵 *Searching:* ${input}...`);
      try {
        const data = await getYtAudio(input);

        // Send info card first
        await sock.sendMessage(from, {
          text:
            `🎵 *Downloading Audio...*\n\n` +
            `*Title:* ${data.title}\n` +
            `*Duration:* ${data.duration || '?'}`
        }, { quoted: msg });

        // Stream audio directly by URL (no temp file needed if URL works)
        try {
          await sock.sendMessage(from, {
            audio: { url: data.url },
            mimetype: 'audio/mpeg',
            ptt: false,
            contextInfo: {
              externalAdReply: {
                title: data.title,
                body: 'YouTube Audio Download',
                mediaType: 2,
                thumbnailUrl: data.thumbnail || `https://img.youtube.com/vi/default/hqdefault.jpg`,
                showAdAttribution: true
              }
            }
          }, { quoted: msg });
        } catch {
          // Fallback: download to temp file then send
          const out = `/tmp/audio_${Date.now()}.mp3`;
          await downloadFile(data.url, out);
          const size = fs.statSync(out).size;
          if (size > 60 * 1024 * 1024) {
            fs.unlinkSync(out);
            return send('❌ File too large (>60MB).');
          }
          await sendFile(sock, from, msg, out, 'audio', 'audio/mpeg', `🎵 *${data.title}*`);
        }
      } catch (e) {
        return send(`❌ Audio download failed:\n${e.message}`);
      }
      return;
    }

    // ── YouTube Video ───────────────────────────────────────────────────────
    if (['ytv','mp4','ytvideo'].includes(cmd)) {
      if (!input || !isUrl(input)) return send(`🎬 *YOUTUBE VIDEO*\nUsage: .ytv <youtube url>`);
      await wait(`⏳ Downloading video...`);
      try {
        const { url, title } = await getYtVideo(input);
        const out = `/tmp/video_${Date.now()}.mp4`;
        await downloadFile(url, out);
        const size = fs.statSync(out).size;
        if (size > 60 * 1024 * 1024) {
          fs.unlinkSync(out);
          return send('❌ File too large (>60MB). Try a shorter video.');
        }
        await sendFile(sock, from, msg, out, 'video', 'video/mp4', `🎬 *${title || 'YouTube Video'}*`);
      } catch (e) {
        return send(`❌ Video download failed:\n${e.message}`);
      }
      return;
    }

    // ── Spotify ─────────────────────────────────────────────────────────────
    if (['spotify','spot'].includes(cmd)) {
      if (!input) return send(
        `🎧 *SPOTIFY DOWNLOAD*\n` +
        `Usage: .spotify <spotify url or song name>\n\n` +
        `Example: .spotify https://open.spotify.com/track/xxx\n` +
        `Example: .spotify Blinding Lights The Weeknd`
      );
      await wait(`⏳ Fetching from Spotify: *${input}*...`);
      try {
        const data = await getSpotify(input);
        if (data.cover) {
          await sock.sendMessage(from, {
            image: { url: data.cover },
            caption:
              `🎧 *${data.title}*\n` +
              `${data.artist ? '👤 ' + data.artist + '\n' : ''}` +
              `${data.duration ? '⏱️ ' + data.duration + '\n' : ''}` +
              `\n⬇️ Downloading audio...`
          }, { quoted: msg });
        } else {
          await wait(`✅ Found: *${data.title}*\n⬇️ Downloading...`);
        }
        const out = `/tmp/spotify_${Date.now()}.mp3`;
        await downloadFile(data.url, out);
        const size = fs.statSync(out).size;
        if (size > 60 * 1024 * 1024) {
          fs.unlinkSync(out);
          return send('❌ File too large (>60MB).');
        }
        await sendFile(sock, from, msg, out, 'audio', 'audio/mpeg',
          `🎧 *${data.title}*${data.artist ? '\n👤 ' + data.artist : ''}`
        );
      } catch (e) {
        return send(`❌ Spotify download failed:\n${e.message}`);
      }
      return;
    }

    // ── SoundCloud ──────────────────────────────────────────────────────────
    if (['soundcloud','sc'].includes(cmd)) {
      if (!input) return send(
        `🎵 *SOUNDCLOUD DOWNLOAD*\n` +
        `Usage: .soundcloud <url or track name>\n\n` +
        `Example: .soundcloud https://soundcloud.com/xxx\n` +
        `Example: .soundcloud Alan Walker Faded`
      );
      await wait(`⏳ Fetching SoundCloud: *${input}*...`);
      try {
        const data = await getSoundcloud(input);
        if (data.cover) {
          await sock.sendMessage(from, {
            image: { url: data.cover },
            caption: `🎵 *${data.title}*${data.artist ? '\n👤 ' + data.artist : ''}\n\n⬇️ Downloading...`
          }, { quoted: msg });
        } else {
          await wait(`✅ Found: *${data.title}*\n⬇️ Downloading...`);
        }
        const out = `/tmp/sc_${Date.now()}.mp3`;
        await downloadFile(data.url, out);
        const size = fs.statSync(out).size;
        if (size > 60 * 1024 * 1024) {
          fs.unlinkSync(out);
          return send('❌ File too large (>60MB).');
        }
        await sendFile(sock, from, msg, out, 'audio', 'audio/mpeg',
          `🎵 *${data.title}*${data.artist ? '\n👤 ' + data.artist : ''}`
        );
      } catch (e) {
        return send(`❌ SoundCloud failed:\n${e.message}`);
      }
      return;
    }

    // ── APK ─────────────────────────────────────────────────────────────────
    if (cmd === 'apk') {
      if (!input) return send(`📱 *APK DOWNLOAD*\nUsage: .apk <app name>\nExample: .apk WhatsApp`);
      await wait(`🔍 Searching APK: *${input}*...`);
      try {
        const data = await getApk(input);
        if (data.info) {
          // Info only — no direct download URL
          return send(
            `📱 *APK: ${data.name || input}*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `${data.version ? '📌 Version : ' + data.version + '\n' : ''}` +
            `${data.size ? '📦 Size    : ' + data.size + '\n' : ''}` +
            `${data.developer ? '👤 Dev     : ' + data.developer + '\n' : ''}` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔗 *APKPure:*\n${data.searchUrl}\n\n` +
            `🔗 *APKMirror:*\n${data.mirrorUrl}\n\n` +
            `🔗 *Uptodown:*\n${data.uptodownUrl}\n\n` +
            `_Tip: Copy a link above, download the APK page URL,\nthen use: .apk <that page url> for direct download_`
          );
        }
        // Direct download
        await wait(`✅ Found: *${data.name}*\n⬇️ Downloading APK...`);
        const out = `/tmp/apk_${Date.now()}.apk`;
        await downloadFile(data.url, out);
        const size = fs.statSync(out).size;
        if (size > 60 * 1024 * 1024) {
          fs.unlinkSync(out);
          return send('❌ APK too large (>60MB).');
        }
        await sendFile(sock, from, msg, out, 'document', 'application/vnd.android.package-archive',
          `📱 *${data.name}*\n` +
          `${data.version ? '📌 v' + data.version + '\n' : ''}` +
          `${data.size ? '📦 ' + data.size : ''}`
        );
      } catch (e) {
        return send(`❌ APK failed:\n${e.message}`);
      }
      return;
    }

    // ── Nudes/Movie Download (owner only) ───────────────────────────────────
    if (['nudesdl','moviedl'].includes(cmd)) {
      if (!isOwner) return send(`❌ *ACCESS DENIED*\nThis command is owner only.`);
      if (!input) return send(`🎬 Usage: .${cmd} <url or title>`);
      await wait(`⏳ Fetching: *${input}*...`);
      try {
        const data = await getNudesMovie(input);
        await wait(`✅ Found: *${data.title}*\n${data.size ? '📦 Size: ' + data.size + '\n' : ''}⬇️ Downloading...`);
        const ext  = data.url.split('?')[0].split('.').pop()?.substring(0,4) || 'mp4';
        const out  = `/tmp/movie_${Date.now()}.${ext}`;
        await downloadFile(data.url, out);
        const size = fs.statSync(out).size;
        if (size > 60 * 1024 * 1024) {
          fs.unlinkSync(out);
          return send('❌ File too large (>60MB).');
        }
        await sendFile(sock, from, msg, out, 'video', 'video/mp4',
          `🎬 *${data.title}*${data.size ? '\n📦 ' + data.size : ''}`
        );
      } catch (e) {
        return send(`❌ Download failed:\n${e.message}`);
      }
      return;
    }

    // ── TikTok ──────────────────────────────────────────────────────────────
    if (['tiktok','tt'].includes(cmd)) {
      if (!input || !isUrl(input)) return send(`🎵 *TIKTOK*\nUsage: .tiktok <tiktok url>`);
      await wait(`⏳ Downloading TikTok...`);
      try {
        const { url, title, author } = await getTikTok(input);
        const out = `/tmp/tt_${Date.now()}.mp4`;
        await downloadFile(url, out);
        await sendFile(sock, from, msg, out, 'video', 'video/mp4',
          `🎵 *${title || 'TikTok'}*${author ? '\n👤 ' + author : ''}`
        );
      } catch (e) {
        return send(`❌ TikTok failed:\n${e.message}`);
      }
      return;
    }

    // ── Instagram ───────────────────────────────────────────────────────────
    if (['instagram','ig'].includes(cmd)) {
      if (!input || !isUrl(input)) return send(`📸 *INSTAGRAM*\nUsage: .ig <instagram url>\n\n⚠️ Post must be public.`);
      await wait(`⏳ Downloading Instagram media...`);
      try {
        const { url, type } = await getInstagram(input);
        const out = `/tmp/ig_${Date.now()}.mp4`;
        await downloadFile(url, out);
        const isImage = type === 'image' || type === 'photo';
        await sendFile(sock, from, msg, out,
          isImage ? 'image' : 'video',
          isImage ? 'image/jpeg' : 'video/mp4',
          '📸 Instagram media'
        );
      } catch (e) {
        return send(`❌ Instagram failed:\n${e.message}`);
      }
      return;
    }

    // ── Facebook ────────────────────────────────────────────────────────────
    if (['facebook','fb'].includes(cmd)) {
      if (!input || !isUrl(input)) return send(`📘 *FACEBOOK*\nUsage: .fb <facebook video url>\n\n⚠️ Video must be public.`);
      await wait(`⏳ Downloading Facebook video...`);
      try {
        const { url } = await getFacebook(input);
        const out = `/tmp/fb_${Date.now()}.mp4`;
        await downloadFile(url, out);
        await sendFile(sock, from, msg, out, 'video', 'video/mp4', '📘 Facebook Video');
      } catch (e) {
        return send(`❌ Facebook failed:\n${e.message}`);
      }
      return;
    }

    // ── iTunes Search ────────────────────────────────────────────────────────
    if (cmd === 'itunes') {
      if (!input) return send(`🍎 *ITUNES SEARCH*\nUsage: .itunes <song name>`);
      try {
        const d = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(input)}&media=music&limit=5`);
        if (!d.results?.length) return send('❌ No results found.');
        const list = d.results.map((t, i) => {
          const dur = `${Math.floor(t.trackTimeMillis/60000)}:${String(Math.floor((t.trackTimeMillis%60000)/1000)).padStart(2,'0')}`;
          return `*${i+1}. ${t.trackName}*\n   👤 ${t.artistName}\n   💿 ${t.collectionName}\n   ⏱️ ${dur}\n   🔗 ${t.trackViewUrl}`;
        }).join('\n\n');
        return send(`🍎 *ITUNES RESULTS*\n━━━━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━━━━`);
      } catch (e) {
        return send(`❌ iTunes failed: ${e.message}`);
      }
    }

    // ── MediaFire ────────────────────────────────────────────────────────────
    if (['mediafire','mf'].includes(cmd)) {
      if (!input || !input.includes('mediafire.com')) return send(`📁 *MEDIAFIRE*\nUsage: .mediafire <mediafire url>`);
      try {
        const { default: fetch } = await import('node-fetch');
        const res  = await fetch(input, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await res.text();
        const match = html.match(/href="(https:\/\/download[^"]+mediafire[^"]+)"/);
        if (!match) return send('❌ Could not extract download link. Make sure the file is public.');
        return send(`✅ *MEDIAFIRE LINK*\n━━━━━━━━━━━━━━━━━━━━━\n${match[1]}\n━━━━━━━━━━━━━━━━━━━━━`);
      } catch (e) {
        return send(`❌ MediaFire failed: ${e.message}`);
      }
    }

    // ── Google Drive ─────────────────────────────────────────────────────────
    if (cmd === 'gdrive') {
      if (!input || !input.includes('drive.google.com')) return send(`📂 *GOOGLE DRIVE*\nUsage: .gdrive <drive url>\n\n⚠️ File must be publicly shared.`);
      const idMatch = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!idMatch) return send('❌ Invalid Google Drive URL.');
      const id = idMatch[1];
      return send(
        `📂 *GOOGLE DRIVE*\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `Direct link:\nhttps://drive.google.com/uc?export=download&id=${id}\n\n` +
        `⚠️ Only works if the file is set to public.\n━━━━━━━━━━━━━━━━━━━━━`
      );
    }

    // ── GitHub Clone ──────────────────────────────────────────────────────────
    if (['gitclone','git'].includes(cmd)) {
      if (!input || !input.includes('github.com')) return send(`🐙 *GITHUB*\nUsage: .gitclone <github repo url>`);
      const clean = input.replace(/\.git$/, '').replace(/\/$/, '');
      const parts = clean.replace('https://github.com/', '').split('/');
      if (parts.length < 2) return send('❌ Invalid GitHub URL.');
      const [user, repo] = parts;
      return send(
        `🐙 *${user}/${repo}*\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 ZIP (main):\nhttps://github.com/${user}/${repo}/archive/refs/heads/main.zip\n\n` +
        `📦 ZIP (master):\nhttps://github.com/${user}/${repo}/archive/refs/heads/master.zip\n\n` +
        `🔗 Repo:\nhttps://github.com/${user}/${repo}\n━━━━━━━━━━━━━━━━━━━━━`
      );
    }

    // ── Generic Download ──────────────────────────────────────────────────────
    if (['download','dl'].includes(cmd)) {
      if (!input || !isUrl(input)) return send(`📥 *DOWNLOAD*\nUsage: .download <direct url>`);
      await wait(`⏳ Downloading...`);
      try {
        const ext = (input.split('?')[0].split('.').pop() || 'bin').toLowerCase().substring(0, 4);
        const out  = `/tmp/dl_${Date.now()}.${ext}`;
        await downloadFile(input, out);
        const size = fs.statSync(out).size;
        if (size > 60 * 1024 * 1024) {
          fs.unlinkSync(out);
          return send('❌ File too large (>60MB).');
        }
        const imgs = ['jpg','jpeg','png','gif','webp'];
        const vids = ['mp4','mkv','avi','mov'];
        const auds = ['mp3','ogg','wav','m4a','opus','aac'];
        let type = 'document', mime = 'application/octet-stream';
        if (imgs.includes(ext)) { type = 'image'; mime = 'image/jpeg'; }
        else if (vids.includes(ext)) { type = 'video'; mime = 'video/mp4'; }
        else if (auds.includes(ext)) { type = 'audio'; mime = 'audio/mpeg'; }
        await sendFile(sock, from, msg, out, type, mime, `📥 Downloaded (${(size/1024).toFixed(0)} KB)`);
      } catch (e) {
        return send(`❌ Download failed: ${e.message}`);
      }
      return;
    }

    // ── Save Status ───────────────────────────────────────────────────────────
    if (cmd === 'savestatus') {
      return send(
        `💾 *SAVE STATUS*\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `Forward any status to the bot and\nit will send it back to you as a file.\n\n` +
        `Or use *.autoviewstatus* to auto-view\nall statuses automatically.\n━━━━━━━━━━━━━━━━━━━━━`
      );
    }
  }
};
