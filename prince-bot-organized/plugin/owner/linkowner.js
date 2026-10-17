import fs from 'fs';
import { BOT_CONFIG } from "../../config.js";

export default {
    command: ["linkowner"],
    async run({ sock, msg, from, body }) {
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderLid = sender.split("@")[0];
        
        const args = body.split(" ");
        const code = args[1];
        
        // Generate verification code
        const verifyCode = "PRINCE" + BOT_CONFIG.OWNER[0].slice(-4);
        
        if (!code) {
            await sock.sendMessage(from, {
                text: `🔗 *LINK YOUR LID TO OWNER*\n━━━━━━━━━━━━━━━━━━━━━━━━\nYour LID: ${senderLid}\nOwner number: ${BOT_CONFIG.OWNER[0]}\n\nTo link, use:\n.linkowner ${verifyCode}\n\nThis will make the bot recognize you as owner.\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
            return;
        }
        
        if (code === verifyCode) {
            const mappingFile = "./owner-mapping.json";
            let mapping = {};
            
            if (fs.existsSync(mappingFile)) {
                mapping = JSON.parse(fs.readFileSync(mappingFile));
            }
            
            mapping[senderLid] = BOT_CONFIG.OWNER[0];
            fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 2));
            
            await sock.sendMessage(from, {
                text: `✅ *LINKED SUCCESSFULLY*\n━━━━━━━━━━━━━━━━━━━━━━━━\nYour LID (${senderLid}) is now linked to ${BOT_CONFIG.OWNER[0]}.\n\nYou are now recognized as the bot owner!\n\nUse .ownercheck to verify.\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, {
                text: `❌ *Invalid Code*\n━━━━━━━━━━━━━━━━━━━━━━━━\nCorrect code: ${verifyCode}\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
        }
    }
};