// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN TOOLS — group lists, group picture, menu pictures, command browser
//  (original code for this bot).
//
//  Groups : .listadmins .membercount .listactive .getgpp .setgpp .device
//  Owner  : .confirmkick .deploy
//  Menu   : .setmenuimage .setmenuvideo .setmenugif and their .reset… twins
//  Browse : .categories .listmenu .games
// ─────────────────────────────────────────────────────────────────────────────
import { getGroupContext, isAdminMember, memberIdSet, numberOf } from "../../utils/groupAdmin.js";
import { getMenuMedia, saveMenuMedia, clearMenuMedia, hasMenuMedia } from "../../utils/menuMedia.js";
import { getCommandIndex } from "../../utils/commandIndex.js";

const TZ_DEFAULT = process.env.BOT_TIMEZONE || "Africa/Lagos";
const stamp = (t, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
const ago = (ms) => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const CATEGORY_NOTES = {
  admin: "⚙️ Bot settings & status", ai: "🤖 AI chat & tools", downloader: "⬇️ Downloaders", fun: "🎭 Fun & reactions",
  games: "🎮 Games", general: "🌷 Bot & general info", group: "👥 Group management", media: "🎬 Stickers & media",
  moderation: "🚨 Protection & filters", owner: "👑 Owner tools", search: "🔎 Search", textmaker: "🎨 Logos & text effects", utility: "🧰 Everyday tools",
};
const GAME_NOTES = {
  scramble: "unscramble the word", scrabble: "build words from 7 letters", sudoku: "shared sudoku board", snake: "snake on an 8x8 board",
  whot: "Naija Whot vs the bot", cyber: "3-lane road runner", dash: "ninja runner", matrix: "space shooter", doom: "corridor shooter", vampire: "survive until dawn",
  quiz: "group quiz", wyr: "would you rather",
};

// Guess where a message was sent from using its id. This is only a hint.
function guessDevice(id) {
  const s = String(id || "");
  if (!s) return null;
  if (/^BAE5/i.test(s)) return { who: "a bot library (older Baileys)", bot: true, rule: "id starts with BAE5" };
  if (/^3EB0/i.test(s) && s.length === 22) return { who: "a bot library (Baileys style id)", bot: true, rule: "22-character id starting 3EB0" };
  if (/^3EB0/i.test(s) && s.length >= 30) return { who: "WhatsApp Web or Desktop", bot: false, rule: "32-character id starting 3EB0" };
  if (/^[0-9A-F]{32}$/i.test(s)) return { who: "a phone (Android or iPhone — can't tell which)", bot: false, rule: "32-character hex id" };
  if (/^[0-9A-F]{20}$/i.test(s)) return { who: "an Android phone", bot: false, rule: "20-character hex id" };
  return { who: "unknown", bot: false, rule: "unfamiliar id format" };
}

export default {
  command: [
    "listadmins", "admins", "getadmins",
    "membercount", "members", "count",
    "listactive", "listmactive", "listonline", "active",
    "getgpp", "grouppic", "gpp", "grouppp",
    "setgpp", "setgrouppic", "setgpic",
    "device", "devicecheck", "botdevice", "detectbot",
    "confirmkick", "deploy", "pair", "pairing", "getpair",
    "setmenuimage", "setmenuvideo", "setmenuvid", "setmenugif",
    "resetmenuimage", "clearmenuimage", "unsetmenuimage",
    "resetmenuvideo", "clearmenuvideo", "unsetmenuvideo",
    "resetmenugif", "clearmenugif", "unsetmenugif",
    "categories", "cmenu", "categorymenu", "listmenu", "selectmenu", "games", "gamesmenu", "minigames",
  ],

  async run({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber }) {
    const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
    const args = body.trim().split(/\s+/).slice(1);
    const prefix = (body.trim().match(/^[^\w\s]/) || ["."])[0];
    const ownerOnly = () => reply("🚫 *Owner only.* Only the bot owner can use this command.");
    const tag = (jid) => `@${numberOf(jid)}`;

    // ══ COMMAND BROWSER (works anywhere) ═════════════════════════════════════
    if (["categories", "cmenu", "categorymenu"].includes(cmd)) {
      const idx = await getCommandIndex();
      const names = Object.keys(idx).sort();
      const total = names.reduce((n, k) => n + idx[k].length, 0);
      return reply(`📚 *COMMAND CATEGORIES*\n_${total} commands_\n\n${names.map((k, i) => `*${i + 1}.* ${CATEGORY_NOTES[k] || "📁 " + k} — ${idx[k].length}`).join("\n")}\n\nSee a category: *${prefix}listmenu <number or name>*\nExample: ${prefix}listmenu games`);
    }
    if (cmd === "listmenu" || cmd === "selectmenu") {
      const idx = await getCommandIndex();
      const names = Object.keys(idx).sort();
      const q = (args[0] || "").toLowerCase();
      if (!q) return reply(`📂 Pick a category:\n${names.map((k, i) => `*${i + 1}.* ${k}`).join("\n")}\n\nExample: *${prefix}listmenu 5* or *${prefix}listmenu group*`);
      const key = /^\d+$/.test(q) ? names[+q - 1] : names.find(k => k === q) || names.find(k => k.startsWith(q));
      if (!key) return reply(`❌ I don't have a category called "${q}". Send *${prefix}categories* to see them.`);
      return reply(`${CATEGORY_NOTES[key] || key} — *${idx[key].length} commands*\n\n${idx[key].map(c => prefix + c).join("  ")}`);
    }
    if (["games", "gamesmenu", "minigames"].includes(cmd)) {
      const idx = await getCommandIndex();
      const list = idx.games || [];
      const lines = Object.entries(GAME_NOTES).filter(([k]) => list.includes(k) || ["wyr"].includes(k)).map(([k, d]) => `🎮 *${prefix}${k}* — ${d}`);
      return reply(`🎮 *MINI-GAMES*\n\n${lines.join("\n")}\n\nMost games have *${prefix}<game> top* for the leaderboard.\nAll game commands: ${list.map(c => prefix + c).join("  ")}`);
    }

    // ══ OWNER: DEPLOY LINK, CONFIRMKICK, MENU MEDIA ══════════════════════════
    if (["deploy", "pair", "pairing", "getpair"].includes(cmd)) {
      if (!isOwner) return ownerOnly();
      const url = process.env.PAIR_URL || process.env.DEPLOY_URL || "";
      return reply(url ? `🔗 *Pairing / deploy link*\n${url}` : "🔗 No pairing link is set.\nAdd a line to your .env file:\n`PAIR_URL=https://your-pairing-site`\nthen restart the bot.");
    }
    if (cmd === "confirmkick") {
      if (!isOwner) return ownerOnly();
      if (!isGroup) return reply("⚠️ Use this inside the group.");
      const tools = (await import("../owner/ownertools.js")).default;
      return tools.run({ sock, msg, from, body: `${prefix}kickall confirm`, cmd: "kickall", isOwner, isGroup, senderJid, botNumber });
    }

    const mediaKinds = {
      setmenuimage: ["image", "set"], resetmenuimage: ["image", "reset"], clearmenuimage: ["image", "reset"], unsetmenuimage: ["image", "reset"],
      setmenuvideo: ["video", "set"], setmenuvid: ["video", "set"], resetmenuvideo: ["video", "reset"], clearmenuvideo: ["video", "reset"], unsetmenuvideo: ["video", "reset"],
      setmenugif: ["gif", "set"], resetmenugif: ["gif", "reset"], clearmenugif: ["gif", "reset"], unsetmenugif: ["gif", "reset"],
    };
    if (mediaKinds[cmd]) {
      if (!isOwner) return ownerOnly();
      const [kind, what] = mediaKinds[cmd];
      if (what === "reset") {
        const had = clearMenuMedia(kind);
        const now = getMenuMedia();
        return reply(had ? `✅ Custom menu ${kind} removed.${now ? `\nThe menu now uses the custom *${now.type}*.` : "\nThe menu is back to the default banner."}` : `There is no custom menu ${kind} to remove.`);
      }
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const direct = msg.message;
      const imageMsg = direct?.imageMessage || quoted?.imageMessage;
      const videoMsg = direct?.videoMessage || quoted?.videoMessage;
      if (kind === "image" && !imageMsg) return reply("📸 Reply to a picture (or send one with the caption) like this:\n*.setmenuimage*");
      if (kind !== "image" && !videoMsg) return reply(`🎞️ Reply to a ${kind === "gif" ? "GIF or short video" : "video"} with *.${cmd}*`);
      const seconds = Number(videoMsg?.seconds || 0);
      if (kind !== "image" && seconds > 30) return reply("⚠️ That clip is longer than 30 seconds. Please use a shorter one (menus load faster that way).");
      try {
        const buffer = await sock.downloadMediaMessage(
          { message: kind === "image" ? { imageMessage: imageMsg } : { videoMessage: videoMsg }, key: msg.key }, "buffer"
        );
        if (!buffer?.length) throw new Error("empty file");
        saveMenuMedia(kind, buffer);
        return reply(`✅ *Menu ${kind} saved.* Send *${prefix}menu* to see it.\nTo remove it later: *${prefix}resetmenu${kind}*`);
      } catch (e) {
        return reply(`❌ I couldn't save that: ${e.message}`);
      }
    }

    // ══ GROUP COMMANDS ═══════════════════════════════════════════════════════
    if (!isGroup) return reply("⚠️ This command only works inside a group.");
    let ctx;
    try { ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }); }
    catch { return reply("❌ I couldn't read this group's info. Try again in a moment."); }
    const { meta, participants, senderIsAdmin, botIsAdmin } = ctx;
    const needAdmin = () => reply("🚫 *Admins only.* Only group admins can use this command.");
    let gp = null, tz = TZ_DEFAULT;
    try { gp = (await import("../group/groupplus.js")).__internals.G(from); tz = gp.tz || TZ_DEFAULT; } catch {}

    if (["listadmins", "admins", "getadmins"].includes(cmd)) {
      const admins = participants.filter(isAdminMember).sort((a, b) => (b.admin === "superadmin") - (a.admin === "superadmin"));
      if (!admins.length) return reply("I couldn't see any admins in this group.");
      const lines = admins.map(p => `${p.admin === "superadmin" ? "👑" : "🛡️"} ${tag(p.id)}${p.phoneNumber ? ` · +${numberOf(p.phoneNumber)}` : ""}${p.admin === "superadmin" ? "  _(creator)_" : ""}`);
      return reply(`🛡️ *ADMINS — ${meta.subject}*\n_${admins.length} of ${participants.length} members_\n\n${lines.join("\n")}`, { mentions: admins.map(p => p.id) });
    }

    if (["membercount", "members", "count"].includes(cmd)) {
      const admins = participants.filter(isAdminMember).length;
      const dayAgo = Date.now() - 86400000;
      const activeToday = gp?.activity ? participants.filter(p => { for (const id of memberIdSet(p)) if (gp.activity[id]?.last > dayAgo) return true; return false; }).length : null;
      return reply(`👥 *${meta.subject}*\n\nMembers: *${participants.length}*\nAdmins: *${admins}*\nRegular members: *${participants.length - admins}*${activeToday !== null ? `\nChatted in the last 24 hours: *${activeToday}*` : ""}${meta.size && meta.size !== participants.length ? `\n(WhatsApp reports ${meta.size})` : ""}`);
    }

    if (["listactive", "listmactive", "listonline", "active"].includes(cmd)) {
      if (!gp?.activity || !Object.keys(gp.activity).length) return reply("📊 I haven't counted any messages yet. Chat for a while, then try again.");
      const hours = /^\d+$/.test(args[0] || "") ? Math.min(168, Math.max(1, +args[0])) : 24;
      const since = Date.now() - hours * 3600000;
      const rows = Object.values(gp.activity).filter(a => a.last >= since).sort((a, b) => b.last - a.last);
      if (!rows.length) return reply(`📊 Nobody has chatted in the last ${hours} hour(s).`);
      const shown = rows.slice(0, 40);
      return reply(`🟢 *ACTIVE MEMBERS — last ${hours} h*\n_${rows.length} people (counting since ${stamp(gp.trackStart || Date.now(), tz)})_\n\n${shown.map(a => `• ${tag(a.jid)} — ${ago(a.last)}`).join("\n")}${rows.length > shown.length ? `\n…and ${rows.length - shown.length} more.` : ""}\n\n_Tip: .listactive 6 shows the last 6 hours._`, { mentions: shown.map(a => a.jid) });
    }

    if (["getgpp", "grouppic", "gpp", "grouppp"].includes(cmd)) {
      try {
        const url = await sock.profilePictureUrl(from, "image");
        if (!url) throw new Error("none");
        return sock.sendMessage(from, { image: { url }, caption: `🖼️ *${meta.subject}*` }, { quoted: msg });
      } catch { return reply("🖼️ This group doesn't have a profile picture (or WhatsApp won't share it)."); }
    }

    if (["setgpp", "setgrouppic", "setgpic"].includes(cmd)) {
      if (!senderIsAdmin) return needAdmin();
      if (!botIsAdmin) return reply("⚠️ I need to be a group admin to change the group picture.");
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const imageMsg = msg.message?.imageMessage || quoted?.imageMessage;
      if (!imageMsg) return reply("📸 Reply to a picture (or send one with the caption) like this:\n*.setgpp*");
      try {
        const buffer = await sock.downloadMediaMessage({ message: { imageMessage: imageMsg }, key: msg.key }, "buffer");
        await sock.updateProfilePicture(from, buffer);
        return reply("✅ *Group picture updated.*");
      } catch (e) { return reply(`❌ I couldn't change the picture: ${e.message}`); }
    }

    if (["device", "devicecheck", "botdevice", "detectbot"].includes(cmd)) {
      const ci = msg.message?.extendedTextMessage?.contextInfo;
      if (!ci?.stanzaId) return reply("🔎 Reply to a message with *.device* and I'll guess what it was sent from.");
      const guess = guessDevice(ci.stanzaId);
      const who = ci.participant;
      const evidence = [
        `Message id: \`${ci.stanzaId}\` (${ci.stanzaId.length} characters)`,
        `Rule matched: ${guess.rule}`,
        ci.quotedMessage?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo ? "Forwarded from a WhatsApp Channel" : null,
      ].filter(Boolean);
      return reply(`🔎 *DEVICE CHECK*${who ? ` — ${tag(who)}` : ""}\n\nLikely sent from: *${guess.who}*\n${guess.bot ? "🤖 This looks like an automated bot.\n" : ""}\n${evidence.map(e => "• " + e).join("\n")}\n\n_This is a guess from the message id, not proof. WhatsApp can change these formats._`, who ? { mentions: [who] } : {});
    }
  },
};
