import { isSelf } from "../../utils/groupAdmin.js";
export default {
  // This runs on 'group-update' socket events
  onGroupUpdate: async ({ sock, update }) => {
    const { id, subject, desc, icon, author } = update[0];
    const botId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

    // If the change was made by the bot itself, ignore it
    if (isSelf(sock, author, botId)) return;

    try {
      const metadata = await sock.groupMetadata(id);
      const participants = metadata.participants;
      const isAdmin = participants.find(p => p.id === author)?.admin !== null;

      // 1. Check if the editor is an admin (Optional: you can even kick admins if you want total lock)
      if (isAdmin) return; 

      // 2. REVERT CHANGES & PUNISH
      if (subject) {
        await sock.groupUpdateSubject(id, metadata.subject); // Reset Name
        await sock.sendMessage(id, { text: `🛡️ **Security Alert:** Unauthorized Group Name change by @${author.split('@')[0]}. Reverting and removing...`, mentions: [author] });
      }

      if (desc) {
        await sock.groupUpdateDescription(id, metadata.desc); // Reset Description
      }

      // 3. REMOVE THE OFFENDER
      await sock.groupParticipantsUpdate(id, [author], "remove");

    } catch (e) {
      console.error("Anti-Edit Error:", e);
    }
  }
}
