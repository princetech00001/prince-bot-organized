import axios from 'axios';

const GEMINI_API_KEY = "AIzaSyD4NoPsMxllfWoMsYG61XUtCCYJEacdOxY";

export default {
  command: ['gemini'],
  category: 'ai',

  run: async ({ sock, msg, from, body }) => {

    let text =
      body ||
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    text = text.trim();

    const input = text.replace(/^\.gemini\s*/i, "").trim();

    if (!input) {
      return sock.sendMessage(from, {
        text: "🤖 Gemini AI\n\nExample:\n.gemini hello"
      }, { quoted: msg });
    }

    // 🧠 React processing
    await sock.sendMessage(from, {
      react: { text: '🧠', key: msg.key }
    });

    try {
      const res = await axios.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY,
        {
          contents: [
            {
              parts: [{ text: input }]
            }
          ]
        }
      );

      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!reply) throw new Error("Empty response from Gemini");

      // ✅ success reaction
      await sock.sendMessage(from, {
        react: { text: '✅', key: msg.key }
      });

      return sock.sendMessage(from, {
        text: "🤖 GEMINI\n\n" + reply
      }, { quoted: msg });

    } catch (err) {
      console.error("Gemini Error:", err?.response?.data || err.message);

      // ❌ fail reaction
      await sock.sendMessage(from, {
        react: { text: '❌', key: msg.key }
      });

      return sock.sendMessage(from, {
        text:
          "❌ Gemini failed\n\n" +
          (err?.response?.data?.error?.message || err.message)
      }, { quoted: msg });
    }
  }
};