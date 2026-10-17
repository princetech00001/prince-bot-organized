// ─────────────────────────────────────────────────────────────────────────────
//  GROUP PLUS — extra group tools (batch 1). Original code for this bot.
//
//  Scheduling : .closetime  .opentime  .settimezone
//  Notes      : .notes  .adminnotes
//  Moderation : .votekick
//  Activity   : .topchatters  .activity  .inactive  .streak
//  Messages   : .pin  .unpin  .invite  .report  .announce
//
//  Data is saved to ./group-plus.json. Activity counting uses the bot's new
//  onMessage hook (see whatsapp/sessionManager.js).
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import { findMember, isAdminMember, botJids, senderJids, memberIdSet, idSet } from "../../utils/groupAdmin.js";

const FILE = "./group-plus.json";
const DEFAULT_TZ = process.env.BOT_TIMEZONE || "Africa/Lagos";
const VOTE_WINDOW_MS = 30 * 60 * 1000;      // a vote round lasts 30 minutes
const DEFAULT_VOTES_NEEDED = 5;

// ── storage (in memory, flushed to disk every 15 s) ─────────────────────────
let DB = {};
let dirty = false;
try { if (fs.existsSync(FILE)) DB = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
const touch = () => { dirty = true; };
function flush() {
  if (!dirty) return;
  dirty = false;
  try { fs.writeFileSync(FILE, JSON.stringify(DB)); } catch (e) { console.log("[groupplus] save failed:", e.message); }
}
setInterval(flush, 15000).unref?.();
process.once("beforeExit", flush);

function G(gid) {
  if (!DB[gid]) DB[gid] = { tz: DEFAULT_TZ, notes: [], adminNotes: [], votes: {}, activity: {}, trackStart: Date.now() };
  const g = DB[gid];
  g.notes ||= []; g.adminNotes ||= []; g.votes ||= {}; g.activity ||= {};
  return g;
}

// ── small helpers ───────────────────────────────────────────────────────────
const userPart = (jid) => String(jid || "").split("@")[0].split(":")[0].trim();
const sockByGroup = {};                       // group id -> socket that sees it

/** "21:30", "9pm", "9:15 am" -> "21:30" (or null) */
function parseClock(input) {
  const m = String(input || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  const ap = m[3];
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Current day + clock in a time zone. */
function nowIn(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value;
  let hh = get("hour");
  if (hh === "24") hh = "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, clock: `${hh}:${get("minute")}` };
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
const dayNum = (day) => { const [y, m, d] = day.split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };

function ago(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function liveStreak(a, tz) {
  if (!a?.day) return 0;
  const today = nowIn(tz).day;
  const gap = dayNum(today) - dayNum(a.day);
  return gap <= 1 ? a.streak : 0;
}

function recordActivity(gid, jid) {
  const key = userPart(jid);
  if (!key) return;
  const g = G(gid);
  const a = (g.activity[key] ||= { n: 0, last: 0, day: "", streak: 0, best: 0, jid });
  const today = nowIn(g.tz || DEFAULT_TZ).day;
  a.n++;
  a.last = Date.now();
  a.jid = jid;

  // per-day counters, kept for 14 days (used by .grouprecap)
  const daily = (g.daily ||= {});
  const bucket = (daily[today] ||= { n: 0, users: {} });
  bucket.n++;
  bucket.users[key] = (bucket.users[key] || 0) + 1;
  const days = Object.keys(daily).sort();
  while (days.length > 14) delete daily[days.shift()];
  if (a.day !== today) {
    a.streak = a.day && dayNum(today) - dayNum(a.day) === 1 ? a.streak + 1 : 1;
    a.best = Math.max(a.best || 0, a.streak);
    a.day = today;
  }
  touch();
}

const activityFor = (g, member) => {
  for (const id of memberIdSet(member)) if (g.activity[id]) return g.activity[id];
  return null;
};

// ── scheduler: opens / closes groups at the saved time ──────────────────────
async function tick(date = new Date()) {
  for (const [gid, g] of Object.entries(DB)) {
    if (!g.closeTime && !g.openTime) continue;
    const sock = sockByGroup[gid];
    if (!sock) continue;
    const { day, clock } = nowIn(g.tz || DEFAULT_TZ, date);
    const jobs = [
      ["close", g.closeTime, "announcement",     "🔒 *Group closed.* Only admins can send messages now."],
      ["open",  g.openTime,  "not_announcement", "🔓 *Group opened.* Everyone can send messages again."],
    ];
    for (const [kind, time, setting, text] of jobs) {
      if (!time || time !== clock) continue;
      const stamp = `${day} ${time}`;
      if (g[`${kind}Ran`] === stamp) continue;
      g[`${kind}Ran`] = stamp;
      touch();
      try {
        await sock.groupSettingUpdate(gid, setting);
        await sock.sendMessage(gid, { text });
      } catch (e) {
        console.log(`[groupplus] scheduled ${kind} failed for ${gid}: ${e.message}`);
      }
    }
  }
}
setInterval(() => { tick().catch(() => {}); }, 30000).unref?.();

// ── plugin ──────────────────────────────────────────────────────────────────
export default {
  command: [
    "closetime", "opentime", "settimezone", "timezonegroup", "groupzone",
    "notes", "adminnotes",
    "votekick",
    "topchatters", "activity", "inactive", "listinactive", "streak",
    "pin", "unpin", "invite", "report", "announce",
  ],

  // Called for every message (see sessionManager). Counts group activity.
  async onMessage({ sock, msg, from, isGroup, senderJid }) {
    if (!isGroup || !from?.endsWith("@g.us")) return;
    sockByGroup[from] = sock;
    const who = msg.key.participant || senderJid || sock.user?.id;
    recordActivity(from, who);
  },

  async run({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber }) {
    const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
    if (!isGroup) return reply("⚠️ This command only works inside a group.");
    sockByGroup[from] = sock;

    const args = body.trim().split(/\s+/).slice(1);
    const text = args.join(" ").trim();
    const g = G(from);
    const tz = g.tz || DEFAULT_TZ;

    let meta;
    try { meta = await sock.groupMetadata(from); } catch { return reply("❌ Could not read this group's info. Try again."); }
    const parts = meta.participants || [];
    const botMember = findMember(parts, ...botJids(sock, botNumber));
    const senderMember = findMember(parts, ...senderJids(msg, senderJid));
    const botIsAdmin = isAdminMember(botMember);
    const senderIsAdmin = isAdminMember(senderMember) || isOwner;
    const needAdmin = () => reply("🚫 *Admins only.* Only group admins can use this command.");

    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo || {};
    const mentioned = ctxInfo.mentionedJid || [];
    const quotedId = ctxInfo.stanzaId;
    const quotedAuthor = ctxInfo.participant;
    const tag = (jid) => `@${userPart(jid)}`;

    // ── time zone ───────────────────────────────────────────────────────────
    if (["settimezone", "timezonegroup", "groupzone"].includes(cmd)) {
      if (!text) {
        const n = nowIn(tz);
        return reply(`🕒 *Group time zone:* ${tz}\nNow: ${n.clock} (${n.day})\n\nChange it (admins): .settimezone Africa/Lagos`);
      }
      if (!senderIsAdmin) return needAdmin();
      if (!validTz(text)) return reply("❌ Unknown time zone. Use a name like *Africa/Lagos*, *Europe/London* or *Asia/Dubai*.");
      g.tz = text; touch();
      const n = nowIn(text);
      return reply(`✅ Time zone set to *${text}*\nIt is now ${n.clock} there.`);
    }

    // ── scheduled close / open ──────────────────────────────────────────────
    if (cmd === "closetime" || cmd === "opentime") {
      const key = cmd === "closetime" ? "closeTime" : "openTime";
      const word = cmd === "closetime" ? "close" : "open";
      if (!text) {
        return reply(g[key]
          ? `⏰ The group ${word}s every day at *${g[key]}* (${tz}).\nTurn off: .${cmd} off`
          : `⏰ No automatic ${word} time is set.\nSet one (admins): .${cmd} 21:30   or   .${cmd} 9pm`);
      }
      if (!senderIsAdmin) return needAdmin();
      if (["off", "stop", "clear", "remove"].includes(text.toLowerCase())) {
        delete g[key]; touch();
        return reply(`✅ Automatic ${word} time removed.`);
      }
      const clock = parseClock(text);
      if (!clock) return reply("❌ I couldn't read that time. Try *21:30* or *9pm*.");
      g[key] = clock; touch();
      const warn = botIsAdmin ? "" : "\n\n⚠️ I am not an admin in this group yet. Make me admin or this will not work.";
      return reply(`✅ The group will *${word}* every day at *${clock}* (${tz}).${warn}`);
    }

    // ── notes / admin notes ─────────────────────────────────────────────────
    if (cmd === "notes" || cmd === "adminnotes") {
      const adminOnly = cmd === "adminnotes";
      const list = adminOnly ? g.adminNotes : g.notes;
      const title = adminOnly ? "🔐 *ADMIN NOTES*" : "📝 *GROUP NOTES*";
      if (adminOnly && !senderIsAdmin) return needAdmin();

      const sub = (args[0] || "").toLowerCase();
      if (sub === "add") {
        if (!senderIsAdmin) return needAdmin();
        const note = args.slice(1).join(" ").trim();
        if (!note) return reply(`Write the note after *add*:\n.${cmd} add Meeting is on Friday`);
        if (list.length >= 50) return reply("❌ You already have 50 notes. Delete one first.");
        list.push({ text: note, by: userPart(senderJid), at: Date.now() }); touch();
        return reply(`✅ Note *#${list.length}* saved.`);
      }
      if (sub === "del" || sub === "delete" || sub === "remove") {
        if (!senderIsAdmin) return needAdmin();
        const n = parseInt(args[1], 10);
        if (!n || n < 1 || n > list.length) return reply(`❌ Give a note number from 1 to ${list.length || 0}.`);
        list.splice(n - 1, 1); touch();
        return reply(`🗑️ Note *#${n}* deleted.`);
      }
      if (sub === "clear") {
        if (!senderIsAdmin) return needAdmin();
        list.length = 0; touch();
        return reply("🗑️ All notes cleared.");
      }
      if (!list.length) {
        return reply(`${title}\n\nNo notes yet.${senderIsAdmin ? `\nAdd one: .${cmd} add <text>` : ""}`);
      }
      const lines = list.map((n, i) => `*${i + 1}.* ${n.text}`);
      return reply(`${title}\n\n${lines.join("\n")}${senderIsAdmin ? `\n\n_.${cmd} add | del <no> | clear_` : ""}`);
    }

    // ── vote kick ───────────────────────────────────────────────────────────
    if (cmd === "votekick") {
      const sub = (args[0] || "").toLowerCase();
      const needed = g.votesNeeded || DEFAULT_VOTES_NEEDED;

      if (sub === "set") {
        if (!senderIsAdmin) return needAdmin();
        const n = parseInt(args[1], 10);
        if (!n || n < 2 || n > 50) return reply("❌ Pick a number of votes from 2 to 50.");
        g.votesNeeded = n; touch();
        return reply(`✅ A member is removed after *${n}* votes.`);
      }

      const targetJid = mentioned[0] || quotedAuthor;
      if (!targetJid) {
        return reply(`🗳️ *VOTE KICK*\n\nTag a member or reply to their message:\n.votekick @member\n\nVotes needed: *${needed}* (admins can change it: .votekick set 7)`);
      }
      const targetMember = findMember(parts, targetJid);
      if (!targetMember) return reply("❌ That person is not in this group.");
      if (isAdminMember(targetMember)) return reply("🚫 Admins can't be vote-kicked.");
      if (findMember([targetMember], ...botJids(sock, botNumber))) return reply("🙂 Nice try. I can't vote myself out.");

      const voterKey = userPart(senderMember?.id || senderJid);
      const targetKey = userPart(targetMember.id);
      if (voterKey === targetKey) return reply("🙂 You can't vote against yourself.");

      if (sub === "cancel") {
        if (!senderIsAdmin) return needAdmin();
        delete g.votes[targetKey]; touch();
        return reply("✅ Vote cancelled.", { mentions: [targetMember.id] });
      }

      let round = g.votes[targetKey];
      if (!round || Date.now() - round.started > VOTE_WINDOW_MS) round = g.votes[targetKey] = { started: Date.now(), voters: [] };
      if (round.voters.includes(voterKey)) {
        return reply(`You already voted. *${round.voters.length}/${needed}* votes so far.`);
      }
      round.voters.push(voterKey); touch();

      if (round.voters.length >= needed) {
        if (!botIsAdmin) return reply("⚠️ The vote passed, but I need to be a group admin to remove someone.");
        try {
          await sock.groupParticipantsUpdate(from, [targetMember.id], "remove");
          delete g.votes[targetKey]; touch();
          return reply(`🗳️ Vote passed (${needed}/${needed}). ${tag(targetMember.id)} was removed.`, { mentions: [targetMember.id] });
        } catch (e) {
          return reply(`❌ I couldn't remove them: ${e.message}`);
        }
      }
      return reply(
        `🗳️ Vote against ${tag(targetMember.id)}: *${round.voters.length}/${needed}*\nThe vote ends in 30 minutes. Use .votekick @member to add yours.`,
        { mentions: [targetMember.id] }
      );
    }

    // ── activity ────────────────────────────────────────────────────────────
    if (cmd === "topchatters") {
      const rows = Object.values(g.activity).sort((a, b) => b.n - a.n).slice(0, 10);
      if (!rows.length) return reply("📊 No messages counted yet. Chat for a while and try again.");
      const medals = ["🥇", "🥈", "🥉"];
      const lines = rows.map((a, i) => `${medals[i] || `*${i + 1}.*`} ${tag(a.jid)} — ${a.n} messages`);
      return reply(
        `📊 *TOP CHATTERS*\n_Counting since ${new Date(g.trackStart).toDateString()}_\n\n${lines.join("\n")}`,
        { mentions: rows.map(a => a.jid) }
      );
    }

    if (cmd === "activity") {
      const targetJid = mentioned[0] || quotedAuthor || senderJid;
      const member = findMember(parts, targetJid) || senderMember;
      const a = member ? activityFor(g, member) : null;
      const jid = member?.id || targetJid;
      if (!a) return reply(`📈 No activity recorded for ${tag(jid)} yet.`, { mentions: [jid] });
      const ranked = Object.values(g.activity).sort((x, y) => y.n - x.n);
      const rank = ranked.findIndex(x => x === a) + 1;
      return reply(
        `📈 *ACTIVITY — ${tag(jid)}*\n\n` +
        `Messages: *${a.n}*\nRank: *#${rank}* of ${ranked.length}\n` +
        `Last message: ${ago(a.last)}\nStreak: *${liveStreak(a, tz)}* day(s)  (best ${a.best || 0})`,
        { mentions: [jid] }
      );
    }

    if (cmd === "streak") {
      const a = senderMember ? activityFor(g, senderMember) : null;
      if (!a) return reply("🔥 No streak yet. Send a message every day to build one.");
      return reply(`🔥 Your streak: *${liveStreak(a, tz)}* day(s) in a row.\nBest ever: *${a.best || 0}* day(s).`);
    }

    if (cmd === "inactive" || cmd === "listinactive") {
      if (!senderIsAdmin) return needAdmin();
      const days = args[0] === undefined ? 7 : parseInt(args[0], 10);
      if (Number.isNaN(days) || days < 0 || days > 365) return reply("❌ Give a number of days from 0 to 365.\nExample: .inactive 14");
      const cutoff = Date.now() - days * 86400000;
      const quiet = parts.filter(p => {
        if (findMember([p], ...botJids(sock, botNumber))) return false;
        const a = activityFor(g, p);
        return !a || a.last < cutoff;
      });
      if (!quiet.length) return reply(`✅ Everyone has chatted in the last ${days} day(s).`);
      const shown = quiet.slice(0, 40);
      const lines = shown.map(p => `• ${tag(p.id)}`);
      const more = quiet.length > shown.length ? `\n…and ${quiet.length - shown.length} more.` : "";
      return reply(
        `😴 *INACTIVE — ${days} day(s)*\n_${quiet.length} of ${parts.length} members. I have been counting since ${new Date(g.trackStart).toDateString()}, so newer groups show more names._\n\n${lines.join("\n")}${more}`,
        { mentions: shown.map(p => p.id) }
      );
    }

    // ── pin / unpin ─────────────────────────────────────────────────────────
    if (cmd === "pin" || cmd === "unpin") {
      if (!senderIsAdmin) return needAdmin();
      if (!quotedId) return reply(`Reply to the message you want to ${cmd}.${cmd === "pin" ? "\nOptional length: .pin 24h | .pin 7d | .pin 30d" : ""}`);
      const lengths = { "24h": 86400, "7d": 604800, "30d": 2592000 };
      const time = lengths[(args[0] || "7d").toLowerCase()];
      if (cmd === "pin" && !time) return reply("❌ Choose 24h, 7d or 30d.");
      try {
        await sock.sendMessage(from, {
          pin: { remoteJid: from, fromMe: false, id: quotedId, participant: quotedAuthor },
          type: cmd === "pin" ? 1 : 2,
          ...(cmd === "pin" ? { time } : {}),
        });
        return reply(cmd === "pin" ? "📌 Message pinned." : "📍 Message unpinned.");
      } catch (e) {
        return reply(`❌ I couldn't ${cmd} that message: ${e.message}`);
      }
    }

    // ── invite someone by DM ────────────────────────────────────────────────
    if (cmd === "invite") {
      if (!senderIsAdmin) return needAdmin();
      const number = (text.match(/\d{7,15}/) || [""])[0];
      if (!number) return reply("Give the person's number with the country code:\n.invite 2348012345678");
      if (!botIsAdmin) return reply("⚠️ I need to be a group admin to create the invite link.");
      try {
        const code = await sock.groupInviteCode(from);
        await sock.sendMessage(`${number}@s.whatsapp.net`, {
          text: `👋 You have been invited to join *${meta.subject}*\n\nhttps://chat.whatsapp.com/${code}`,
        });
        return reply(`✅ Invite sent to +${number}.`);
      } catch (e) {
        return reply(`❌ I couldn't send the invite: ${e.message}`);
      }
    }

    // ── report to admins ────────────────────────────────────────────────────
    if (cmd === "report") {
      if (!text && !quotedId) return reply("Tell me what to report:\n.report spam in the group\nOr reply to a message with .report");
      const admins = parts.filter(isAdminMember).map(p => p.id);
      const target = quotedAuthor ? `\nAbout: ${tag(quotedAuthor)}` : "";
      await sock.sendMessage(from, {
        text: `🚨 *REPORT*\nFrom: ${tag(senderJid)}${target}\nReason: ${text || "(see the replied message)"}\n\n${admins.map(tag).join(" ")}`,
        mentions: [senderJid, ...(quotedAuthor ? [quotedAuthor] : []), ...admins],
      }, { quoted: quotedId ? { key: { remoteJid: from, id: quotedId, participant: quotedAuthor }, message: ctxInfo.quotedMessage || {} } : msg });
      return;
    }

    // ── announcement ────────────────────────────────────────────────────────
    if (cmd === "announce") {
      if (!senderIsAdmin) return needAdmin();
      if (!text) return reply("Write the announcement:\n.announce Class starts at 8pm tonight");
      return sock.sendMessage(from, {
        text: `📢 *ANNOUNCEMENT*\n━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━\n_— ${meta.subject} admins_`,
        mentions: parts.map(p => p.id),
      });
    }
  },
};

// exposed for tests
export const __internals = { tick, parseClock, nowIn, db: () => DB, recordActivity, sockByGroup, G, touch, userPart, validTz, dayNum, DEFAULT_TZ };
