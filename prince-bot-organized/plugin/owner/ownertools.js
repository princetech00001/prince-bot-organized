import fs from "fs";
import { BOT_CONFIG } from "../../config.js";
import { findMember, botJids } from "../../utils/groupAdmin.js";

export default {
  command: [
    "broadcast", "bc",
    "clearchat",
    "getgroups", "listgroups",
    "setbio", "changebio",
    "setppbot", "setbotpic",
    "joingroup", "join",
    "leavegroup", "leave",
    "sendas", "fakesend",
    "restartbot", "restart",
    "block2", "unblock2",
    "clearwarns",
    "banuser", "globalban",
    "unbanuser", "globalunban",
    "banlist",
    "addowner", "removeowner",
    "ownerlist",
    "shutdown",
    "getgroupinfo",
    "promote2", "demote2",
    "botstats",
    "kickall",
    "grouplist2",
    "massdm",
    "copygroup",
    "tagadmins",
    "warn2", "warnlist", "resetwarn2",
  ],

  async run({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber }) {
    from = from || msg.key.remoteJid;
    const args  = body.trim().split(/\s+/).slice(1);
    const text  = args.join(" ").trim();
    const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });
    const react = (e) => sock.sendMessage(from, { react: { text: e, key: msg.key } }).catch(() => {});

    if (!isOwner) {
      return reply(
        "╔══════════════════════════════════════╗\n" +
        "║  🚫  OWNER ONLY                      ║\n" +
        "╠══════════════════════════════════════╣\n" +
        "║  This command is restricted to       ║\n" +
        "║  Prince Dev™ only.                   ║\n" +
        "╚══════════════════════════════════════╝"
      );
    }

    const box = (title, lines) =>
      ["╔══════════════════════════════════════╗",
       `║  ${title}`,
       "╠══════════════════════════════════════╣",
       ...lines.map(l => `║  ${l}`),
       "╚══════════════════════════════════════╝"].join("\n");

    const GBAN_FILE   = "./globalban.json";
    const OWNERS_FILE = "./extra-owners.json";
    const WARN2_FILE  = "./warn2.json";

    const loadGban    = () => { try { return JSON.parse(fs.readFileSync(GBAN_FILE));   } catch { return []; } };
    const saveGban    = (d) => fs.writeFileSync(GBAN_FILE,   JSON.stringify(d, null, 2));
    const loadOwners  = () => { try { return JSON.parse(fs.readFileSync(OWNERS_FILE)); } catch { return []; } };
    const saveOwners  = (d) => fs.writeFileSync(OWNERS_FILE, JSON.stringify(d, null, 2));
    const loadWarn2   = () => { try { return JSON.parse(fs.readFileSync(WARN2_FILE));  } catch { return {}; } };
    const saveWarn2   = (d) => fs.writeFileSync(WARN2_FILE,  JSON.stringify(d, null, 2));
    const getMention  = () => msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || null;
    const numToJid    = (n) => n.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    try {

      // ── BROADCAST ──────────────────────────────────────────────────────────
      if (cmd === "broadcast" || cmd === "bc") {
        if (!text) return reply("❌ Provide a message!\nExample: *.bc Hello everyone!*");
        const groups = await sock.groupFetchAllParticipating();
        const ids    = Object.keys(groups);
        if (!ids.length) return reply("❌ Bot is not in any groups.");
        await reply(box("📢  BROADCAST STARTED", [`Sending to ${ids.length} groups...`]));
        let sent = 0, failed = 0;
        for (const gid of ids) {
          try {
            await sock.sendMessage(gid, { text: `📢 *BROADCAST from Prince Dev™*\n\n${text}` });
            sent++;
            await new Promise(r => setTimeout(r, 1200));
          } catch { failed++; }
        }
        return reply(box("📢  BROADCAST COMPLETE", [`✅ Sent: ${sent}`, `❌ Failed: ${failed}`, `📊 Total: ${ids.length}`]));
      }

      // ── CLEAR CHAT ─────────────────────────────────────────────────────────
      if (cmd === "clearchat") {
        try { await sock.chatModify({ clear: { messages: [] } }, from); } catch {}
        return reply("✅ *Chat cleared.*");
      }

      // ── LIST GROUPS ────────────────────────────────────────────────────────
      if (cmd === "getgroups" || cmd === "listgroups") {
        const groups = await sock.groupFetchAllParticipating();
        const list   = Object.values(groups);
        if (!list.length) return reply("❌ Bot is not in any groups.");
        let out = box("📋  GROUP LIST", [`Total: ${list.length} groups`]) + "\n\n";
        list.slice(0, 25).forEach((g, i) => {
          out += `${i + 1}. *${g.subject}*\n   👥 ${g.participants?.length || "?"} members\n\n`;
        });
        if (list.length > 25) out += `_...and ${list.length - 25} more._`;
        return reply(out.trim());
      }

      // ── SET BIO ────────────────────────────────────────────────────────────
      if (cmd === "setbio" || cmd === "changebio") {
        if (!text) return reply("❌ Provide status!\nExample: *.setbio Prince Bot 👑*");
        await sock.updateProfileStatus(text);
        return reply(box("✅  BIO UPDATED", [`Bio: ${text.slice(0, 60)}`]));
      }

      // ── SET BOT PIC (FIXED) ────────────────────────────────────────────────
      if (cmd === "setppbot" || cmd === "setbotpic") {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const imageMsg = msg.message?.imageMessage || ctx?.quotedMessage?.imageMessage;
        if (!imageMsg) return reply("❌ Reply to an image!");
        try {
          const buffer = await sock.downloadMediaMessage(
            { message: { imageMessage: imageMsg }, key: msg.key }, "buffer"
          );
          await sock.updateProfilePicture(sock.user.id, buffer);
          return reply("✅ *Bot profile picture updated!*");
        } catch (e) {
          return reply(`❌ Failed: ${e.message}`);
        }
      }

      // ── JOIN GROUP ─────────────────────────────────────────────────────────
      if (cmd === "joingroup" || cmd === "join") {
        if (!text) return reply("❌ Provide invite link!");
        const code = text.split("chat.whatsapp.com/")[1]?.split(/[^a-zA-Z0-9]/)[0];
        if (!code) return reply("❌ Invalid group link.");
        await sock.groupAcceptInvite(code);
        return reply(box("✅  JOINED GROUP", ["Joined via invite code."]));
      }

      // ── LEAVE GROUP ────────────────────────────────────────────────────────
      if (cmd === "leavegroup" || cmd === "leave") {
        if (!isGroup) return reply("❌ Use inside the group you want to leave.");
        const meta = await sock.groupMetadata(from);
        await reply(`🚪 *Leaving: ${meta.subject}...*`);
        await sock.groupLeave(from);
        return;
      }

      // ── SEND AS BOT (FIXED) ────────────────────────────────────────────────
      if (cmd === "sendas" || cmd === "fakesend") {
        if (args.length < 2) return reply("❌ Usage: *.sendas <number> <message>*");
        const num = args[0].replace(/[^0-9]/g, "");
        if (!num || num.length < 7) return reply("❌ Invalid number.");
        const message = args.slice(1).join(" ");
        await sock.sendMessage(num + "@s.whatsapp.net", { text: message });
        return reply(box("✅  MESSAGE SENT", [`To: +${num}`, `Msg: ${message.slice(0, 50)}`]));
      }

      // ── RESTART ────────────────────────────────────────────────────────────
      if (cmd === "restartbot" || cmd === "restart") {
        await reply(box("🔄  RESTARTING", ["Bot restarting...", "Back in ~5 seconds."]));
        setTimeout(() => process.exit(0), 2000);
        return;
      }

      // ── BLOCK2 / UNBLOCK2 ──────────────────────────────────────────────────
      if (cmd === "block2") {
        const target = getMention() || (text ? numToJid(text) : null);
        if (!target) return reply("❌ Tag or give a number!");
        await sock.updateBlockStatus(target, "block");
        await react("🚫");
        return reply(box("🚫  BLOCKED", [`@${target.split("@")[0]}`]));
      }

      if (cmd === "unblock2") {
        const target = getMention() || (text ? numToJid(text) : null);
        if (!target) return reply("❌ Tag or give a number!");
        await sock.updateBlockStatus(target, "unblock");
        await react("✅");
        return reply(box("✅  UNBLOCKED", [`@${target.split("@")[0]}`]));
      }

      // ── CLEAR WARNS ────────────────────────────────────────────────────────
      if (cmd === "clearwarns") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const GS = "./group-settings.json";
        let gs = {};
        try { gs = JSON.parse(fs.readFileSync(GS)); } catch {}
        if (gs[from]) {
          Object.keys(gs[from]).forEach(k => { if (k.startsWith("warn_")) delete gs[from][k]; });
          fs.writeFileSync(GS, JSON.stringify(gs, null, 2));
        }
        return reply(box("✅  WARNINGS CLEARED", ["All member warnings reset."]));
      }

      // ── GLOBAL BAN / UNBAN / LIST ──────────────────────────────────────────
      if (cmd === "banuser" || cmd === "globalban") {
        const target = getMention() || (args[0] ? numToJid(args[0]) : null);
        if (!target) return reply("❌ Tag or give a number!");
        const num = target.split("@")[0];
        const bl  = loadGban();
        if (bl.includes(num)) return reply(`⚠️ +${num} already banned.`);
        bl.push(num);
        saveGban(bl);
        await sock.updateBlockStatus(target, "block").catch(() => {});
        return reply(box("🌍  GLOBAL BAN", [`+${num} banned & blocked.`]));
      }

      if (cmd === "unbanuser" || cmd === "globalunban") {
        const target = getMention() || (args[0] ? numToJid(args[0]) : null);
        if (!target) return reply("❌ Tag or give a number!");
        const num = target.split("@")[0];
        saveGban(loadGban().filter(x => x !== num));
        await sock.updateBlockStatus(target, "unblock").catch(() => {});
        return reply(box("✅  GLOBAL UNBAN", [`+${num} unbanned.`]));
      }

      if (cmd === "banlist") {
        const bl = loadGban();
        if (!bl.length) return reply("✅ No globally banned users.");
        return reply(box("📋  BAN LIST", [`Total: ${bl.length}`]) + "\n\n" +
          bl.map((n, i) => `${i + 1}. +${n}`).join("\n"));
      }

      // ── ADD/REMOVE/LIST OWNERS ─────────────────────────────────────────────
      if (cmd === "addowner") {
        const num = text.replace(/[^0-9]/g, "");
        if (!num) return reply("❌ Provide number!");
        const owners = loadOwners();
        if (owners.includes(num)) return reply(`⚠️ +${num} already a co-owner.`);
        owners.push(num);
        saveOwners(owners);
        return reply(box("👑  CO-OWNER ADDED", [`+${num} can now use owner commands.`]));
      }

      if (cmd === "removeowner") {
        const num = text.replace(/[^0-9]/g, "");
        if (!num) return reply("❌ Provide number!");
        saveOwners(loadOwners().filter(o => o !== num));
        return reply(box("❌  CO-OWNER REMOVED", [`+${num} removed.`]));
      }

      if (cmd === "ownerlist") {
        const extra = loadOwners();
        const all   = [...BOT_CONFIG.OWNER, ...extra];
        return reply(box("👑  OWNER LIST", [`Total: ${all.length}`]) + "\n\n" +
          all.map((n, i) => `${i + 1}. +${n} ${BOT_CONFIG.OWNER.includes(n) ? "👑 Main" : "⭐ Co"}`).join("\n"));
      }

      // ── SHUTDOWN ───────────────────────────────────────────────────────────
      if (cmd === "shutdown") {
        await reply(box("⛔  SHUTDOWN", ["Bot shutting down.", "Restart from panel."]));
        setTimeout(() => process.exit(1), 2000);
        return;
      }

      // ── GET GROUP INFO ─────────────────────────────────────────────────────
      if (cmd === "getgroupinfo") {
        if (!text) return reply("❌ Provide group link!");
        const code = text.split("chat.whatsapp.com/")[1]?.split(/[^a-zA-Z0-9]/)[0];
        if (!code) return reply("❌ Invalid group link.");
        const info = await sock.groupGetInviteInfo(code);
        return reply(box("📊  GROUP INFO", [
          `Name    : ${info.subject}`,
          `Members : ${info.size}`,
          `Creator : +${info.creator?.split("@")[0] || "Unknown"}`,
          `Created : ${info.creation ? new Date(info.creation * 1000).toLocaleDateString("en-GB") : "Unknown"}`
        ]));
      }

      // ── PROMOTE2 / DEMOTE2 ─────────────────────────────────────────────────
      if (cmd === "promote2") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const target = getMention();
        if (!target) return reply("❌ Tag someone!");
        await sock.groupParticipantsUpdate(from, [target], "promote");
        return reply(box("⬆️  PROMOTED", [`@${target.split("@")[0]} is now admin.`]));
      }

      if (cmd === "demote2") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const target = getMention();
        if (!target) return reply("❌ Tag someone!");
        await sock.groupParticipantsUpdate(from, [target], "demote");
        return reply(box("⬇️  DEMOTED", [`@${target.split("@")[0]} is no longer admin.`]));
      }

      // ══════════════════════════════════════════════════
      // ── 10 NEW COMMANDS ───────────────────────────────
      // ══════════════════════════════════════════════════

      // 📊 BOT STATS
      if (cmd === "botstats") {
        const groups = await sock.groupFetchAllParticipating().catch(() => ({}));
        const u = process.uptime();
        const mem = process.memoryUsage();
        return reply(box("📊  BOT STATISTICS", [
          `⏳ Uptime  : ${Math.floor(u/86400)}d ${Math.floor((u%86400)/3600)}h ${Math.floor((u%3600)/60)}m`,
          `💾 RAM     : ${(mem.heapUsed/1024/1024).toFixed(1)}MB / ${(mem.rss/1024/1024).toFixed(1)}MB`,
          `👥 Groups  : ${Object.keys(groups).length}`,
          `👑 Owners  : ${[...BOT_CONFIG.OWNER, ...loadOwners()].length}`,
          `🚫 GBanned : ${loadGban().length}`,
          `📦 Node.js : ${process.version}`,
          `🖥️ OS      : ${process.platform}`
        ]));
      }

      // 💣 KICK ALL
      if (cmd === "kickall") {
        if (!isGroup) return reply("❌ Use inside a group.");
        if (args[0]?.toLowerCase() !== "confirm")
          return reply("⚠️ *DANGER: Kicks ALL non-admin members!*\n\nType *.kickall confirm* to proceed.");
        const meta    = await sock.groupMetadata(from);
        const botP    = findMember(meta.participants, ...botJids(sock, botNumber));
        const members = meta.participants.filter(p => p !== botP && !p.admin).map(p => p.id);
        if (!members.length) return reply("❌ No members to kick.");
        await reply(`💣 *Kicking ${members.length} members...*`);
        let kicked = 0;
        for (const m of members) {
          try { await sock.groupParticipantsUpdate(from, [m], "remove"); kicked++; } catch {}
          await new Promise(r => setTimeout(r, 500));
        }
        return reply(box("💣  KICKALL DONE", [`✅ Kicked: ${kicked}/${members.length}`]));
      }

      // 📋 GROUPS WITH LINKS
      if (cmd === "grouplist2") {
        const groups = await sock.groupFetchAllParticipating();
        const list   = Object.entries(groups);
        if (!list.length) return reply("❌ No groups.");
        let out = `📋 *GROUPS + LINKS*\nTotal: ${list.length}\n\n`;
        for (let i = 0; i < Math.min(list.length, 15); i++) {
          const [gid, g] = list[i];
          try {
            const code = await sock.groupInviteCode(gid);
            out += `*${i+1}. ${g.subject}*\n👥 ${g.participants?.length} members\n🔗 https://chat.whatsapp.com/${code}\n\n`;
          } catch {
            out += `*${i+1}. ${g.subject}*\n👥 ${g.participants?.length} members\n\n`;
          }
        }
        if (list.length > 15) out += `_...and ${list.length - 15} more._`;
        return reply(out.trim());
      }

      // 📨 MASS DM
      if (cmd === "massdm") {
        if (!isGroup) return reply("❌ Use inside a group.");
        if (!text) return reply("❌ Provide message!\nExample: *.massdm Hello!*");
        const meta    = await sock.groupMetadata(from);
        const botP    = findMember(meta.participants, ...botJids(sock, botNumber));
        const members = meta.participants.filter(p => p !== botP);
        await reply(`📨 *Sending DM to ${members.length} members...*`);
        let sent = 0, failed = 0;
        for (const m of members) {
          try {
            await sock.sendMessage(m.phoneNumber || m.id, { text: `📨 *Message from ${meta.subject}*\n\n${text}` });
            sent++;
          } catch { failed++; }
          await new Promise(r => setTimeout(r, 1500));
        }
        return reply(box("📨  MASS DM DONE", [`✅ Sent: ${sent}`, `❌ Failed: ${failed}`]));
      }

      // 📄 COPY GROUP INFO
      if (cmd === "copygroup") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const meta   = await sock.groupMetadata(from);
        const admins = meta.participants.filter(p => p.admin);
        return reply(
          `📄 *GROUP INFO*\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `📛 Name    : ${meta.subject}\n` +
          `📝 Desc    : ${(meta.desc || "None").slice(0, 100)}\n` +
          `👥 Members : ${meta.participants.length}\n` +
          `👑 Admins  : ${admins.length}\n` +
          `🔒 Locked  : ${meta.restrict ? "Yes" : "No"}\n` +
          `📅 Created : ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString("en-GB") : "Unknown"}\n` +
          `━━━━━━━━━━━━━━━━━━━━━`
        );
      }

      // 📣 TAG ADMINS
      if (cmd === "tagadmins") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const meta    = await sock.groupMetadata(from);
        const admins  = meta.participants.filter(p => p.admin);
        if (!admins.length) return reply("❌ No admins found.");
        const mentions = admins.map(a => a.id);
        const tagText  = `📣 *ADMIN ALERT*\n${text || "Admins have been tagged."}\n\n` +
          admins.map(a => `@${a.id.split("@")[0]}`).join(" ");
        return sock.sendMessage(from, { text: tagText, mentions }, { quoted: msg });
      }

      // ⚠️ WARN2
      if (cmd === "warn2") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const target = getMention();
        if (!target) return reply("❌ Tag someone to warn!\nExample: *.warn2 @user spamming*");
        const w   = loadWarn2();
        const key = `${from}_${target}`;
        w[key]    = (w[key] || 0) + 1;
        const count = w[key];
        const limit = 3;
        if (count >= limit) {
          await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => {});
          delete w[key];
          saveWarn2(w);
          return sock.sendMessage(from, {
            text: `🚨 *@${target.split("@")[0]} reached ${limit} warnings — KICKED!*\n\nReason: ${text || "Repeated violations."}`,
            mentions: [target]
          }, { quoted: msg });
        }
        saveWarn2(w);
        return sock.sendMessage(from, {
          text: `⚠️ *WARNING ${count}/${limit}*\n\n@${target.split("@")[0]}: ${text || "Please follow group rules."}`,
          mentions: [target]
        }, { quoted: msg });
      }

      // 📋 WARN LIST
      if (cmd === "warnlist") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const w     = loadWarn2();
        const warns = Object.entries(w)
          .filter(([k]) => k.startsWith(from + "_"))
          .map(([k, v]) => `+${k.split("_")[1]?.split("@")[0]}: ${v} warn(s)`);
        if (!warns.length) return reply("✅ No active warnings in this group.");
        return reply(box("📋  WARN LIST", warns));
      }

      // 🔄 RESET WARN
      if (cmd === "resetwarn2") {
        if (!isGroup) return reply("❌ Use inside a group.");
        const target = getMention();
        if (!target) return reply("❌ Tag someone!");
        const w   = loadWarn2();
        delete w[`${from}_${target}`];
        saveWarn2(w);
        return reply(box("✅  WARN RESET", [`@${target.split("@")[0]} warnings cleared.`]));
      }

    } catch (e) {
      console.error("[ownertools]", e.message);
      return reply(`❌ Error: ${e.message}`);
    }
  }
};
