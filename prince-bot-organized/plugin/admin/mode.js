// Public/private mode — now correctly wired to the dispatcher's per-session
// gate (whatsapp/sessionManager.js checks session.activeMode). Previously
// this wrote to a global ./mode.json that nothing else read, so switching
// to .private looked like it worked but never actually restricted anyone —
// and it would have applied globally to every paired session at once, not
// just the one that set it.

export default {
    command: ["mode", "public", "private"],

    async run({ sock, msg, from, cmd, isOwner, botMode, setActiveMode }) {
        const currentMode = botMode || "public";

        // ── .mode → show current status ──────────────────────────────────────
        if (cmd === "mode") {
            const emoji = currentMode === "public" ? "🌐" : "🔒";
            const status = currentMode === "private"
                ? "PRIVATE — Only owner can use commands"
                : "PUBLIC — Everyone can use commands";

            await sock.sendMessage(from, {
                text:
                    `${emoji} *BOT MODE STATUS*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Current Mode : *${currentMode.toUpperCase()}*\n` +
                    `Status       : ${status}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📌 *.public*  → Allow everyone\n` +
                    `📌 *.private* → Owner only\n` +
                    `━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
            return;
        }

        // ── Owner-only commands ───────────────────────────────────────────────
        if (!isOwner) {
            await sock.sendMessage(from, {
                text:
                    `❌ *ACCESS DENIED*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Only the bot owner can change the mode.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━`
            }, { quoted: msg });
            return;
        }

        // ── .public ───────────────────────────────────────────────────────────
        if (cmd === "public") {
            if (currentMode === "public") {
                await sock.sendMessage(from, {
                    text:
                        `ℹ️ *NO CHANGE NEEDED*\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Bot is already in *PUBLIC* mode.\n` +
                        `━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: msg });
                return;
            }

            setActiveMode("public");

            await sock.sendMessage(from, {
                text:
                    `🌐 *PUBLIC MODE ACTIVATED*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ Everyone can now use bot commands.\n` +
                    `✅ No restrictions applied.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Switch back: *.private*`
            }, { quoted: msg });
            return;
        }

        // ── .private ──────────────────────────────────────────────────────────
        if (cmd === "private") {
            if (currentMode === "private") {
                await sock.sendMessage(from, {
                    text:
                        `ℹ️ *NO CHANGE NEEDED*\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Bot is already in *PRIVATE* mode.\n` +
                        `━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: msg });
                return;
            }

            setActiveMode("private");

            await sock.sendMessage(from, {
                text:
                    `🔒 *PRIVATE MODE ACTIVATED*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ Only you (owner) can use bot commands.\n` +
                    `✅ All other users are silently blocked.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Switch back: *.public*`
            }, { quoted: msg });
            return;
        }
    }
};
