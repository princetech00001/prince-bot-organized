import { findMember, isAdminMember, botJids, senderJids, isSelf } from "../../utils/groupAdmin.js";
export default {
  // This command is just for the owner to check status, detection is automatic
  command: ["guardstatus"],

  run: async ({ sock, msg, body }) => {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = msg.key.participant || msg.key.remoteJid;
    const botId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

    if (!isGroup) return;

    // --- DETECTION LOGIC (Always Running) ---
    const text = body || "";
    const isBotSignature = (
      // 1. Common Bot Prefixes
      /^[.!/#]\w+/.test(text) || 
      // 2. Interactive Message Detection (Buttons/Lists/Polls)
      msg.message?.templateButtonReplyMessage || 
      msg.message?.buttonsResponseMessage || 
      msg.message?.listResponseMessage ||
      // 3. Known Bot Keywords
      ["menu", "help", "ping", "runtime", "speed"].includes(text.toLowerCase().trim())
    );

    // 4. Verification: Don't let the bot kick ITSELF or Group Admins
    if (isBotSignature && !isSelf(sock, sender)) {
      try {
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        
        const senderData = findMember(participants, ...senderJids(msg, sender));
        const isAdmin = isAdminMember(senderData);
        
        const botMember = findMember(participants, ...botJids(sock));
        const isBotAdmin = isAdminMember(botMember);

        // Immunity for Admins (Prevents accidental kicks of human admins using commands)
        if (isAdmin) return;

        // If bot isn't admin, it can't do anything
        if (!isBotAdmin) {
          return await sock.sendMessage(from, { text: "⚠️ *Anti-Bot Alert:* Another bot detected, but I am not an Admin! Please make me Admin to secure the group." });
        }

        // --- THE PURGE ---
        // 1. Delete the "Bot Trigger" message
        await sock.sendMessage(from, { delete: msg.key });

        // 2. Remove the offending bot/user
        await sock.groupParticipantsUpdate(from, [sender], "remove");

        // 3. Log the action
        await sock.sendMessage(from, { 
          text: `🛡️ **Anti-Bot Security Protocol**\n\n*Action:* Removed @${sender.split('@')[0]}\n*Reason:* Unauthorized Bot Usage Detected.\n*Status:* High Strictness (Always On)`,
          mentions: [sender]
        });

      } catch (e) {
        console.error("Anti-Bot Error:", e);
      }
    }

    // Response for the .guardstatus command
    if (text.startsWith(".guardstatus")) {
       await sock.sendMessage(from, { text: "🛡️ **Guard Status:** ACTIVE\n🔥 **Strictness:** MAX\n🤖 **Anti-Bot:** ENABLED" });
    }
  }
}
