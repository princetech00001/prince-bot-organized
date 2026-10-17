import fs from 'fs';
import { BOT_CONFIG } from "../../config.js";

// Load owner mapping
let ownerMapping = {};
function loadOwnerMapping() {
    try {
        if (fs.existsSync("./owner-mapping.json")) {
            ownerMapping = JSON.parse(fs.readFileSync("./owner-mapping.json"));
        }
    } catch(e) {}
}
loadOwnerMapping();

// Check if sender is owner — recognizes BOTH the hardcoded global owner
// AND whoever paired this specific session (so every Telegram-paired user
// is correctly treated as owner of their own bot instance, not just Prince).
function isUserOwner(senderNumber, botNumber) {
    if (BOT_CONFIG.OWNER.includes(senderNumber)) {
        console.log(`✅ Owner match direct: ${senderNumber}`);
        return true;
    }
    if (botNumber && senderNumber === botNumber) {
        console.log(`✅ Owner match (paired session number): ${senderNumber}`);
        return true;
    }
    // Check mapping (LID to phone number)
    if (ownerMapping[senderNumber] && BOT_CONFIG.OWNER.includes(ownerMapping[senderNumber])) {
        console.log(`✅ Owner match via mapping: ${senderNumber} -> ${ownerMapping[senderNumber]}`);
        return true;
    }
    
    console.log(`❌ Not owner: ${senderNumber}`);
    return false;
}

// Configuration
let config = {
    protectionEnabled: true,
    autoBlockEnabled: true,
    maxAttempts: 3,
    maxMessagesPerMinute: 20,
    maxMessageLength: 8000
};

// Storage
let blockedNumbers = new Set();
let suspiciousSenders = new Map();
let rateLimit = new Map();

// Load saved data
function loadData() {
    try {
        if (fs.existsSync("./blocked.json")) {
            const data = JSON.parse(fs.readFileSync("./blocked.json"));
            blockedNumbers = new Set(data);
        }
        if (fs.existsSync("./protection-config.json")) {
            config = JSON.parse(fs.readFileSync("./protection-config.json"));
        }
    } catch (e) {}
}

function saveBlocked() {
    fs.writeFileSync("./blocked.json", JSON.stringify([...blockedNumbers]));
}

function saveConfig() {
    fs.writeFileSync("./protection-config.json", JSON.stringify(config, null, 2));
}

// Crash patterns
const crashPatterns = [
    { pattern: /A{3000,}/, name: "Extremely long text" },
    { pattern: /[\u0300-\u036f]{100,}/, name: "Combining characters" },
    { pattern: /🇮🇳{50,}/, name: "Flag emoji flood" },
    { pattern: /̷{100,}/, name: "Overline spam" },
    { pattern: /.{8000,}/, name: "Very long message" },
    { pattern: /(\S)\1{500,}/, name: "Repeated character spam" },
    { pattern: /💀{100,}/, name: "Skull emoji flood" },
    { pattern: /BEGIN:VCARD[\s\S]{3000,}/, name: "Malformed contact" }
];

function containsCrashPattern(text) {
    if (!text) return false;
    for (const cp of crashPatterns) {
        if (cp.pattern.test(text)) return cp.name;
    }
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    if (emojiCount > 150) return "Excessive emojis";
    return false;
}

loadData();

export default {
    command: ["selfprotect", "protect", "protectstats", "blocklist", "crashcheck"],
    async run({ sock, msg, from, body, botNumber }) {
        const args = body.split(" ");
        const command = args[0].toLowerCase();
        
        let senderNumber = msg.key.participant || msg.key.remoteJid;
        senderNumber = senderNumber.split("@")[0];
        
        // Reload mapping every time to ensure it's fresh
        loadOwnerMapping();
        
        // Check if user is owner
        const userIsOwner = isUserOwner(senderNumber, botNumber);
        
        console.log(`🔍 Command: ${command} | Sender: ${senderNumber} | IsOwner: ${userIsOwner}`);
        
        // ========== SELF PROTECT COMMAND ==========
        if (command === ".selfprotect" || command === ".protect") {
            if (!userIsOwner) {
                await sock.sendMessage(from, {
                    text: `❌ *ACCESS DENIED*\n━━━━━━━━━━━━━━━━━━━━━━━━\nOnly the bot owner can control protection.\n\nOwner: ${BOT_CONFIG.OWNER[0]}\nYour ID: ${senderNumber}\n\nIf you are the owner, the mapping may not be loaded.\n\nCheck if owner-mapping.json exists with:\n{"${senderNumber}": "${BOT_CONFIG.OWNER[0]}"}\n━━━━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: msg });
                return;
            }
            
            const action = args[1]?.toLowerCase();
            
            if (action === "on") {
                config.protectionEnabled = true;
                saveConfig();
                await sock.sendMessage(from, {
                    text: `🛡️ *PROTECTION ACTIVATED*\n━━━━━━━━━━━━━━━━━━━━━━━━\n✅ WhatsApp protection is ON!\n\n*Features:*\n• Blocks crash patterns\n• Auto-blocks after ${config.maxAttempts} attempts\n• Rate limit: ${config.maxMessagesPerMinute}/min\n• Max message: ${config.maxMessageLength} chars\n━━━━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: msg });
                return;
            }
            
            if (action === "off") {
                config.protectionEnabled = false;
                saveConfig();
                await sock.sendMessage(from, {
                    text: `⚠️ *PROTECTION OFF*\n━━━━━━━━━━━━━━━━━━━━━━━━\nProtection is disabled.\n\nTo reactivate: .selfprotect on\n━━━━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: msg });
                return;
            }
            
            await sock.sendMessage(from, {
                text: `🛡️ *PROTECTION STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━━\nStatus: ${config.protectionEnabled ? "✅ ACTIVE" : "❌ INACTIVE"}\n\nCommands:\n.selfprotect on - Activate\n.selfprotect off - Deactivate\n.protectstats - Statistics\n.blocklist - Blocked numbers\n.unblock [number] - Unblock\n.crashcheck - Test\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
            return;
        }
        
        // ========== TEST COMMAND ==========
        if (command === ".crashcheck") {
            if (!userIsOwner) {
                await sock.sendMessage(from, { text: "❌ Owner only" }, { quoted: msg });
                return;
            }
            
            await sock.sendMessage(from, {
                text: `🧪 *TESTING PROTECTION*\n━━━━━━━━━━━━━━━━━━━━━━━━\nSending test crash pattern...\n\nIf protection works, you won't see the test message.\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
            
            const ownerJid = BOT_CONFIG.OWNER[0] + "@s.whatsapp.net";
            await sock.sendMessage(ownerJid, {
                text: "⚠️ TEST: " + "A".repeat(5000)
            });
            
            setTimeout(async () => {
                await sock.sendMessage(from, {
                    text: `✅ *TEST COMPLETE*\n━━━━━━━━━━━━━━━━━━━━━━━━\nIf you didn't receive the test message, protection is working!\n━━━━━━━━━━━━━━━━━━━━━━━━`
                });
            }, 3000);
            return;
        }
        
        // ========== STATS COMMAND ==========
        if (command === ".protectstats") {
            if (!userIsOwner) return;
            
            await sock.sendMessage(from, {
                text: `📊 *PROTECTION STATS*\n━━━━━━━━━━━━━━━━━━━━━━━━\nStatus: ${config.protectionEnabled ? "ACTIVE" : "INACTIVE"}\nBlocked: ${blockedNumbers.size}\nSuspicious: ${suspiciousSenders.size}\nRate limits: ${rateLimit.size}\n\nAuto-block: ${config.maxAttempts} attempts\nRate limit: ${config.maxMessagesPerMinute}/min\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
            return;
        }
        
        // ========== BLOCKLIST ==========
        if (command === ".blocklist") {
            if (!userIsOwner) return;
            
            const list = [...blockedNumbers].join("\n• ") || "None";
            await sock.sendMessage(from, {
                text: `🚫 *BLOCKED NUMBERS*\n━━━━━━━━━━━━━━━━━━━━━━━━\n• ${list}\n━━━━━━━━━━━━━━━━━━━━━━━━\nTotal: ${blockedNumbers.size}`
            }, { quoted: msg });
            return;
        }
        
        // ========== UNBLOCK ==========
        if (command === ".unblock" && args[1]) {
            if (!userIsOwner) return;
            
            let number = args[1].replace(/[^0-9]/g, '');
            
            if (blockedNumbers.has(number)) {
                blockedNumbers.delete(number);
                saveBlocked();
                await sock.sendMessage(from, {
                    text: `✅ Unblocked: ${number}`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(from, {
                    text: `❌ ${number} not blocked`
                }, { quoted: msg });
            }
            return;
        }
        
        // ========== PROTECTION LOGIC ==========
        if (!config.protectionEnabled) return;
        if (userIsOwner) return;
        if (blockedNumbers.has(senderNumber)) {
            try {
                await sock.sendMessage(from, { delete: msg.key });
            } catch(e) {}
            return;
        }
        
        if (body) {
            const crashType = containsCrashPattern(body);
            if (crashType) {
                const stats = suspiciousSenders.get(senderNumber) || { count: 0 };
                stats.count++;
                suspiciousSenders.set(senderNumber, stats);
                
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch(e) {}
                
                if (config.autoBlockEnabled && stats.count >= config.maxAttempts) {
                    blockedNumbers.add(senderNumber);
                    saveBlocked();
                    await sock.sendMessage(from, {
                        text: `🛡️ *AUTO-BLOCKED*\n${senderNumber} blocked after ${stats.count} crash attempts.\nReason: ${crashType}`
                    });
                } else {
                    await sock.sendMessage(from, {
                        text: `⚠️ *CRASH BLOCKED*\nFrom: ${senderNumber}\nType: ${crashType}\nAttempt: ${stats.count}/${config.maxAttempts}`
                    });
                }
                return;
            }
        }
        
        // Rate limiting
        const now = Date.now();
        const userRate = rateLimit.get(senderNumber);
        
        if (userRate) {
            if (now - userRate.lastMessage < 60000 && userRate.count >= config.maxMessagesPerMinute) {
                if (userRate.count >= config.maxMessagesPerMinute + 10) {
                    blockedNumbers.add(senderNumber);
                    saveBlocked();
                }
                return;
            }
            
            if (now - userRate.lastMessage < 60000) {
                rateLimit.set(senderNumber, {
                    count: userRate.count + 1,
                    lastMessage: now
                });
            } else {
                rateLimit.set(senderNumber, { count: 1, lastMessage: now });
            }
        } else {
            rateLimit.set(senderNumber, { count: 1, lastMessage: now });
        }
        
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of rateLimit) {
                if (now - value.lastMessage > 60000) rateLimit.delete(key);
            }
        }, 3600000);
    }
};