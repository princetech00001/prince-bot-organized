export default {
  command: [], // runs on EVERY message (important)

  async run(ctx) {
    const { sock, msg, from, botSettings } = ctx;

    // must be enabled in settings
    if (!botSettings.autoreactstatus) return;

    if (!msg?.message || msg.key.fromMe) return;

    try {
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      // pick reaction based on message type/content
      let emoji = "👍";

      if (msg.message.imageMessage) emoji = "📸";
      else if (msg.message.videoMessage) emoji = "🎥";
      else if (text.includes("😂")) emoji = "😂";
      else if (text.includes("love") || text.includes("❤️")) emoji = "❤️";
      else if (text.length > 100) emoji = "🔥";

      await sock.sendMessage(from, {
        react: {
          text: emoji,
          key: msg.key
        }
      });

    } catch (e) {
      console.log("Auto-react error:", e.message);
    }
  }
};