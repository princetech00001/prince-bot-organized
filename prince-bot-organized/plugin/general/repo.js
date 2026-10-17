export default {
  command: ["repo", "getrepo", "sourcecode", "botrepo"],

  run: async ({ sock, msg, from }) => {
    from = from || msg.key.remoteJid;

    const card =
      "╔══════════════════════════════════════╗\n" +
      "║      🤖 *PRINCE BOT* — Source 👑     ║\n" +
      "║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ║\n" +
      "║     [ 🐙 GITHUB REPOSITORY 🐙 ]      ║\n" +
      "╠══════════════════════════════════════╣\n" +
      "║                                      ║\n" +
      "║  📦 *Repo:*                          ║\n" +
      "║  github.com/P446-S/prince-bot        ║\n" +
      "║                                      ║\n" +
      "║  ⬇️  *Download ZIP:*                  ║\n" +
      "║  github.com/P446-S/prince-bot/       ║\n" +
      "║  archive/refs/heads/main.zip         ║\n" +
      "║                                      ║\n" +
      "╠══════════════════════════════════════╣\n" +
      "║  👑 *Developer:* Prince Dev™         ║\n" +
      "║  📡 *Support:* wa.me/2349033168045   ║\n" +
      "║  ⭐ Star the repo if you enjoy it!   ║\n" +
      "╚══════════════════════════════════════╝";

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
