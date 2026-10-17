import fs from 'fs';
import { BOT_CONFIG } from "../../config.js";

function loadOwnerMapping() {
    try {
        if (fs.existsSync("./owner-mapping.json")) {
            return JSON.parse(fs.readFileSync("./owner-mapping.json"));
        }
    } catch (e) {}
    return {};
}

function checkOwnerStatus(senderNumber, botNumber) {
    if (BOT_CONFIG.OWNER.includes(senderNumber)) {
        return { isOwner: true, method: "Direct phone number match" };
    }
    if (botNumber && senderNumber === botNumber) {
        return { isOwner: true, method: "You paired this WhatsApp number yourself" };
    }
    const mapping = loadOwnerMapping();
    if (mapping[senderNumber] && BOT_CONFIG.OWNER.includes(mapping[senderNumber])) {
        return { isOwner: true, method: "LID linked via .linkowner", linkedTo: mapping[senderNumber] };
    }
    return { isOwner: false, method: null };
}

export default {
    command: ["ownercheck"],

    async run({ sock, msg, from, senderNumber, botNumber }) {
        // Use senderNumber passed from index.js (correctly detected)
        const sender = senderNumber || (msg.key.participant || msg.key.remoteJid).split("@")[0];

        const { isOwner, method, linkedTo } = checkOwnerStatus(sender, botNumber);
        const mapping = loadOwnerMapping();
        const isMapped = !!mapping[sender];

        if (isOwner) {
            await sock.sendMessage(from, {
                text:
                    `✅ *OWNER VERIFIED*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `👑 You ARE recognized as the bot owner.\n\n` +
                    `📋 *Details:*\n` +
                    `• Your ID   : ${sender}\n` +
                    `• Method    : ${method}\n` +
                    (linkedTo ? `• Linked to : ${linkedTo}\n` : "") +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `You have full access to all owner commands.`
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, {
                text:
                    `❌ *NOT RECOGNIZED AS OWNER*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Your ID : ${sender}\n` +
                    `Mapped  : ${isMapped ? "Yes (but wrong number)" : "No — not linked yet"}\n\n` +
                    `📌 *How to fix:*\n` +
                    `Send *.linkowner* to see your verification code,\n` +
                    `then follow the steps to link your ID.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Owner number in config: ${BOT_CONFIG.OWNER[0]}`
            }, { quoted: msg });
        }
    }
};
