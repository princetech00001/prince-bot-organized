export default {
  command: ["owner"],
  run: async ({ sock, msg, from }) => {
    from = from || msg.key.remoteJid;

    const card = `╔══════════════════════════════════════╗
║         👑 *Prince Dev™* 👑          ║
║   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    ║
║   [ 🔐 SECURE DEV TERMINAL 🔐 ]      ║
╠══════════════════════════════════════╣
║                                      ║
║  📡 *Contact Support:*               ║
║  wa.me/2349033168045                 ║
║                                      ║
║  🛠️  For bot issues,                 ║
║      advanced fixes,                 ║
║      and exclusive services.         ║
║                                      ║
╠══════════════════════════════════════╣
║  ⚡ *Powered by Prince Tech* ⚡      ║
║  🌍 Available 24/7                   ║
╚══════════════════════════════════════╝`;

    try {
      await sock.sendMessage(from, {
        image: { url: "https://files.catbox.moe/y8joob.jpg" },
        caption: card
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(from, { text: card }, { quoted: msg });
    }
  }
};
