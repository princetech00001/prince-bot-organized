export default {
  command: ["myid", "mylidid"],

  async run({ sock, msg, from, senderJid, senderNumber, isOwner }) {
    await sock.sendMessage(from, {
      text:
        `🔍 *YOUR ID INFO*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 Full JID : ${senderJid}\n` +
        `📌 Number   : ${senderNumber}\n` +
        `👑 Is Owner : ${isOwner ? "YES ✅" : "NO ❌"}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `If NOT owner, run *.linkowner* to link your ID.`
    }, { quoted: msg });
  }
};
