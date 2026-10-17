import axios from 'axios';

export default {
    command: ['play2'],
    category: 'downloader',
    description: 'Search and download songs from Spotify',

    run: async ({ sock, msg, from, body, prefix = "." }) => {
        
        // Get message text
        let text = "";
        if (msg.message?.conversation) {
            text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else if (body) {
            text = body;
        }
        text = text.trim();

        // Remove prefix to get search query
        const searchQuery = text.replace(new RegExp(`^${prefix}play2\\s*`, 'i'), "").trim();
        
        if (!searchQuery || searchQuery === text) {
            return sock.sendMessage(from, { 
                text: `❌ Usage: ${prefix}play2 <song name>\nExample: ${prefix}play2 sol vibra` 
            }, { quoted: msg });
        }

        await sock.sendMessage(from, { text: "🔍 Searching..." }, { quoted: msg });

        try {
            const { data } = await axios.get(`https://omegatech-api.dixonomega.tech/api/Search/Spotify?q=${encodeURIComponent(searchQuery)}`);
            const results = data.results || [];

            if (!results.length) {
                return sock.sendMessage(from, { text: "❌ No results found!" }, { quoted: msg });
            }

            // Get the first result
            const song = results[0];
            
            await sock.sendMessage(from, { 
                text: `🎵 Found: *${song.title}* - ${song.artist}\n⏳ Downloading...` 
            }, { quoted: msg });

            // Download the first song
            const { data: dl } = await axios.get(`https://omegatech-api.dixonomega.tech/api/download/Spotify-dl?id=${song.id}`);
            const url = dl.downloadUrl || dl.url;

            if (!url) throw new Error("No download link");

            const { data: audio } = await axios.get(url, { 
                responseType: 'arraybuffer', 
                timeout: 120000 
            });

            const fileName = `${song.title.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`;

            await sock.sendMessage(from, {
                audio: Buffer.from(audio),
                mimetype: 'audio/mpeg',
                fileName: fileName,
                contextInfo: {
                    externalAdReply: {
                        title: song.title,
                        body: song.artist || "Spotify",
                        thumbnailUrl: song.cover,
                        sourceUrl: url,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: msg });

        } catch (e) {
            console.error("Error:", e);
            await sock.sendMessage(from, { text: "❌ Failed to search or download!" }, { quoted: msg });
        }
    }
};
