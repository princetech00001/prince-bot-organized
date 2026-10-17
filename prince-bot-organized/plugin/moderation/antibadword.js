import { findMember, isAdminMember, botJids, senderJids, isSelf } from "../../utils/groupAdmin.js";
// --- CONFIGURATION ---
const BAD_WORDS = [
  "fuck", "bitch", "nigger", "pussy", "dick", "asshole", "stfu", 
  "retard", "scam", "crypto", "investment" // Add any local slurs or spam words here
];

export default {
  command: ["addbadword", "delbadword", "wordlist"],

  run: async ({ sock, msg, body, args }) => {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = msg.key.participant || msg.key.remoteJid;
    const botId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

    if (!isGroup) return;

    const text = body.toLowerCase();

    // --- DETECTION LOGIC (Always Active) ---
    
    // This Regex allows it to find bad words even if they have dots or symbols in them
    // Example: "f.u.c.k" or "f*u*c*k" will still be caught.
    const hasBadWord = BAD_WORDS.some(word => {
      const pattern = word.split('').join('[^a-zA-Z0-9]*'); 
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      return regex.test(text);
    });

    if (hasBadWord) {
      try {
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;

        const isAdmin = isAdminMember(findMember(participants, ...senderJids(msg, sender)));
        const botMember = findMember(participants, ...botJids(sock));
        const isBotAdmin = isAdminMember(botMember);

        if (isAdmin) return; // Admins are exempt
        if (!isBotAdmin) return; // Bot must be admin to act

        // --- THE EXECUTION ---
        
        // 1. Delete the foul message
        await sock.sendMessage(from, { delete: msg.key });

        // 2. Remove the user
        await sock.groupParticipantsUpdate(from, [sender], "remove");

        // 3. Warning to the group
        await sock.sendMessage(from, { 
          text: `🚫 **Profanity Filter Active**\n\n*User:* @${sender.split('@')[0]}\n*Action:* Auto-Removed\n*Reason:* Used prohibited language.`,
          mentions: [sender]
        });

      } catch (e) {
        console.error("Anti-Badword Error:", e);
      }
    }

    // --- OPTIONAL COMMANDS ---
    if (text.startsWith(".wordlist")) {
      await sock.sendMessage(from, { text: `📋 **Banned Words:**\n${BAD_WORDS.join(", ")}` });
    }
  }
}
