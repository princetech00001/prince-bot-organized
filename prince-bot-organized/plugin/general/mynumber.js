export default {
    command: ["mynumber"],
    async run({ sock, msg }) {
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderNumber = sender.split("@")[0];
        
        // Extract actual phone number (remove country code prefix if needed)
        let cleanNumber = senderNumber;
        if (cleanNumber.startsWith("62") && cleanNumber.length > 10) {
            // Already has country code
        } else if (cleanNumber.startsWith("0")) {
            cleanNumber = "62" + cleanNumber.substring(1);
        }
        
        await sock.sendMessage(msg.key.remoteJid, {
            text: `📱 *Your WhatsApp Number*\n━━━━━━━━━━━━━━━━━━━━━━━━\nJID: ${sender}\n\n*Add to config.js OWNER:*\nOWNER: ["${senderNumber}"]\n\n*Alternative format:*\nOWNER: ["${cleanNumber}"]\n━━━━━━━━━━━━━━━━━━━━━━━━`
        }, { quoted: msg });
    }
};