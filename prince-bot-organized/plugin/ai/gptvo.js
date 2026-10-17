import axios from 'axios'

export default {
    command: ['gptvo', 'aivoice'],
    category: 'ai',
    description: 'GPT voice reply',
    usage: '.gptvo <text>',

    run: async ({ sock, msg, from, body, prefix = "." }) => {

        let text = body || msg.message?.conversation || msg.message?.extendedTextMessage?.text || ""
        text = text.trim()

        const input = text.replace(new RegExp(`^${prefix}(gptvo|aivoice)\\s*`, 'i'), "").trim()

        if (!input) {
            return sock.sendMessage(from, {
                text: `🎤 *GPT Voice*\n\nUsage: ${prefix}gptvo hello`
            }, { quoted: msg })
        }

        await sock.sendMessage(from, { react: { text: '🎤', key: msg.key } })

        try {
            // ===== STEP 1: GPT TEXT =====
            const aiRes = await axios.get(
                `https://api.zenzxz.my.id/ai/copilot?message=${encodeURIComponent(input)}&model=gpt-5`
            )

            let reply = aiRes.data?.result?.text
            if (!reply) throw new Error("No AI reply")

            reply = reply.slice(0, 200)

            // ===== STEP 2: YOUR WORKING TTS API =====
            const ttsRes = await axios.get(
                `https://api.nexray.web.id/ai/gemini-tts?text=${encodeURIComponent(reply)}`
            )

            const audioUrl = ttsRes.data?.result
            if (!audioUrl) throw new Error("No TTS audio")

            // ===== SEND AUDIO (same method that worked for you) =====
            await sock.sendMessage(from, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg'
            }, { quoted: msg })

            await sock.sendMessage(from, { react: { text: '✅', key: msg.key } })

        } catch (err) {
            console.error("GPT VOICE ERROR:", err)

            await sock.sendMessage(from, { react: { text: '❌', key: msg.key } })

            await sock.sendMessage(from, {
                text: `❌ Voice failed\n\nTry again later`
            }, { quoted: msg })
        }
    }
}