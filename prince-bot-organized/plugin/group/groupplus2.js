// ─────────────────────────────────────────────────────────────────────────────
//  GROUP PLUS 2 — batch 2 of group tools. Original code for this bot.
//
//  Events    : .event  .eventlist  .eventremove  .groupcalendar
//  Info      : .groupfaq  .groupnotice  .grouprecap
//  Safety    : .groupbackup  .grouprestore  .grouptemplate
//  People    : .memberroles  .membertag
//  Messages  : .schedule
//  Game      : .quiz
//
//  Shares its storage, time zone and activity counters with groupplus.js.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { findMember, isAdminMember, botJids, senderJids, memberIdSet } from "../../utils/groupAdmin.js";
import { getGroup as getGuardGroup, updateGroup as updateGuardGroup } from "../../utils/groupStore.js";
import { __internals as GP } from "./groupplus.js";

const { G, touch, userPart, validTz, nowIn, parseClock, dayNum, DEFAULT_TZ, sockByGroup } = GP;

const GS_FILE = "./group-settings.json";                 // rules, greetings, etc. (group.js)
const BACKUP_DIR = "./data/group-backups";
const TEMPLATE_FILE = "./data/group-templates.json";
const MAX_BACKUPS = 10;
const QUIZ_SECONDS = 45;

// ── time helpers ────────────────────────────────────────────────────────────
/** local-minus-UTC offset (ms) of a time zone at a moment. */
function tzOffsetMs(ts, tz) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ts));
  const g = (t) => +p.find(x => x.type === t).value;
  const h = g("hour") === 24 ? 0 : g("hour");
  return Date.UTC(g("year"), g("month") - 1, g("day"), h, g("minute"), g("second")) - Math.floor(ts / 1000) * 1000;
}
/** wall-clock time in a zone -> UTC epoch ms. */
function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * "2026-10-20 19:00", "20/10 7pm", "tomorrow 8pm", "friday 7:30pm" -> UTC epoch ms (or null).
 * Everything is read in the group's time zone.
 */
function parseWhen(input, tz, now = Date.now()) {
  const str = String(input || "").trim().toLowerCase().replace(/\s+/g, " ");
  const tm = str.match(/(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)$/);
  if (!tm) return null;
  const clock = parseClock(tm[1]);
  if (!clock) return null;
  const [h, mi] = clock.split(":").map(Number);
  const datePart = str.slice(0, tm.index).trim();
  const today = nowIn(tz, new Date(now)).day;            // YYYY-MM-DD
  const [ty, tmo, td] = today.split("-").map(Number);

  let y, mo, d;
  let m;
  if (!datePart || datePart === "today") { [y, mo, d] = [ty, tmo, td]; }
  else if (datePart === "tomorrow") {
    const t = new Date(Date.UTC(ty, tmo - 1, td + 1)); [y, mo, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else if (WEEKDAYS.includes(datePart)) {
    const nowDow = new Date(Date.UTC(ty, tmo - 1, td)).getUTCDay();
    let add = (WEEKDAYS.indexOf(datePart) - nowDow + 7) % 7;
    if (add === 0 && zonedToUtc(ty, tmo, td, h, mi, tz) <= now) add = 7;
    const t = new Date(Date.UTC(ty, tmo - 1, td + add)); [y, mo, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else if ((m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { [y, mo, d] = [+m[1], +m[2], +m[3]]; }
  else if ((m = datePart.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/))) {
    d = +m[1]; mo = +m[2]; y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : ty;
    if (!m[3] && zonedToUtc(y, mo, d, h, mi, tz) < now) y += 1;   // "20/01" already passed -> next year
  } else return null;

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCMonth() !== mo - 1) return null;                 // e.g. 31/02
  return zonedToUtc(y, mo, d, h, mi, tz);
}

const fmtWhen = (at, tz) => new Intl.DateTimeFormat("en-GB", {
  timeZone: tz, weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
}).format(new Date(at));

function inText(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `in ${m} min`;
  if (m < 1440) return `in ${Math.floor(m / 60)} h ${m % 60} min`;
  return `in ${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

// ── backup / template data ──────────────────────────────────────────────────
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));

function snapshot(gid, { template = false } = {}) {
  const gp = G(gid);
  const guard = getGuardGroup(gid);
  const snap = {
    v: 1, kind: template ? "template" : "backup", savedAt: Date.now(),
    guard: { welcome: guard.welcome, goodbye: guard.goodbye, antilink: guard.antilink, warnLimit: guard.warnLimit },
    settings: readJson(GS_FILE, {})[gid] || {},
    gp: { tz: gp.tz ?? null, openTime: gp.openTime ?? null, closeTime: gp.closeTime ?? null, faq: gp.faq || [], notice: gp.notice ?? null, votesNeeded: gp.votesNeeded ?? null },
  };
  if (!template) {
    snap.guard.warns = guard.warns;
    Object.assign(snap.gp, {
      notes: gp.notes, adminNotes: gp.adminNotes, roles: gp.roles || {},
      events: gp.events || [], schedules: gp.schedules || [], quizScores: gp.quizScores || {},
    });
  }
  return clone(snap);
}

function applySnapshot(gid, snap) {
  updateGuardGroup(gid, g => {
    Object.assign(g.welcome, snap.guard?.welcome || {});
    Object.assign(g.goodbye, snap.guard?.goodbye || {});
    Object.assign(g.antilink, snap.guard?.antilink || {});
    if (snap.guard?.warnLimit) g.warnLimit = snap.guard.warnLimit;
    if (snap.guard?.warns) g.warns = clone(snap.guard.warns);
  });
  const all = readJson(GS_FILE, {});
  all[gid] = clone(snap.settings || {});
  fs.writeFileSync(GS_FILE, JSON.stringify(all, null, 2));
  const gp = G(gid);
  for (const [k, v] of Object.entries(snap.gp || {})) {
    if (v === undefined || v === null) delete gp[k]; else gp[k] = clone(v);
  }
  touch();
}

const describeSnap = (s) => [
  `Welcome ${s.guard?.welcome?.enabled ? "on" : "off"}, goodbye ${s.guard?.goodbye?.enabled ? "on" : "off"}`,
  `Anti-link ${s.guard?.antilink?.enabled ? "on (" + s.guard.antilink.mode + ")" : "off"}, warn limit ${s.guard?.warnLimit ?? 3}`,
  `Rules/greetings: ${Object.keys(s.settings || {}).length ? "included" : "none"}`,
  `FAQ ${s.gp?.faq?.length || 0} · notice ${s.gp?.notice ? "yes" : "no"} · open ${s.gp?.openTime || "-"} · close ${s.gp?.closeTime || "-"}`,
  ...(s.kind === "backup" ? [`Notes ${s.gp?.notes?.length || 0} · events ${s.gp?.events?.length || 0} · schedules ${s.gp?.schedules?.length || 0}`] : []),
].map(l => `• ${l}`).join("\n");

const backupDir = (gid) => path.join(BACKUP_DIR, gid.replace(/[^\w.-]/g, "_"));
function listBackups(gid) {
  try {
    return fs.readdirSync(backupDir(gid)).filter(f => f.endsWith(".json")).sort().reverse();
  } catch { return []; }
}

// ── quiz ────────────────────────────────────────────────────────────────────
const BANK = [
  ["What is the capital of Nigeria?", "Abuja", ["Lagos", "Kano", "Ibadan"]],
  ["Which is the largest planet in our solar system?", "Jupiter", ["Saturn", "Earth", "Neptune"]],
  ["How many continents are there?", "7", ["5", "6", "8"]],
  ["What is the chemical symbol for gold?", "Au", ["Ag", "Gd", "Go"]],
  ["Who wrote the novel Things Fall Apart?", "Chinua Achebe", ["Wole Soyinka", "Chimamanda Adichie", "Ben Okri"]],
  ["What is the currency of Japan?", "Yen", ["Won", "Yuan", "Ringgit"]],
  ["Which is the fastest land animal?", "Cheetah", ["Lion", "Horse", "Leopard"]],
  ["How many days are there in a leap year?", "366", ["365", "364", "367"]],
  ["Which is the largest ocean on Earth?", "Pacific Ocean", ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"]],
  ["Which is the hardest natural substance?", "Diamond", ["Gold", "Iron", "Quartz"]],
  ["Which planet is known as the Red Planet?", "Mars", ["Venus", "Mercury", "Jupiter"]],
  ["What is the capital of Ghana?", "Accra", ["Kumasi", "Tamale", "Takoradi"]],
  ["How many players of one team are on a football pitch at a time?", "11", ["9", "10", "12"]],
  ["Who painted the Mona Lisa?", "Leonardo da Vinci", ["Michelangelo", "Raphael", "Picasso"]],
  ["Which is the longest river in Africa?", "Nile", ["Niger", "Congo", "Zambezi"]],
  ["What is the smallest prime number?", "2", ["0", "1", "3"]],
  ["Which gas do plants take in from the air?", "Carbon dioxide", ["Oxygen", "Nitrogen", "Hydrogen"]],
  ["In which year did Nigeria become independent?", "1960", ["1957", "1963", "1966"]],
  ["What is 12 x 12?", "144", ["124", "132", "154"]],
  ["Which is the largest mammal?", "Blue whale", ["African elephant", "Giraffe", "Hippopotamus"]],
  ["In which country are the pyramids of Giza?", "Egypt", ["Sudan", "Libya", "Morocco"]],
  ["What is binary 101 in normal numbers?", "5", ["3", "4", "6"]],
  ["Which organ pumps blood around the body?", "Heart", ["Liver", "Lungs", "Kidney"]],
  ["What is the capital of France?", "Paris", ["Lyon", "Marseille", "Nice"]],
  ["Which is the highest mountain above sea level?", "Mount Everest", ["K2", "Kilimanjaro", "Mont Blanc"]],
  ["What does CPU stand for?", "Central Processing Unit", ["Computer Personal Unit", "Central Program Utility", "Core Power Unit"]],
  ["What is the square root of 81?", "9", ["8", "7", "11"]],
  ["How many sides does a hexagon have?", "6", ["5", "7", "8"]],
  ["Who developed the theory of relativity?", "Albert Einstein", ["Isaac Newton", "Nikola Tesla", "Galileo Galilei"]],
  ["Which gas do humans need to breathe to live?", "Oxygen", ["Helium", "Carbon dioxide", "Argon"]],
];
const activeQuiz = {};                                   // gid -> running question
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

function endQuiz(gid, why) {
  const q = activeQuiz[gid];
  if (!q) return;
  clearTimeout(q.timer);
  delete activeQuiz[gid];
  if (why === "timeout") {
    q.sock.sendMessage(gid, { text: `⏰ *Time is up!* Nobody got it.\nThe answer was *${"ABCD"[q.correct]}) ${q.options[q.correct]}*` }).catch(() => {});
  }
}

// ── scheduler: event reminders + scheduled messages ─────────────────────────
async function tick(date = new Date()) {
  const now = date.getTime();
  const db = GP.db();
  for (const [gid, g] of Object.entries(db)) {
    const sock = sockByGroup[gid];
    if (!sock) continue;
    const tz = g.tz || DEFAULT_TZ;
    const send = async (content) => { try { await sock.sendMessage(gid, content); } catch (e) { console.log(`[groupplus2] send failed ${gid}: ${e.message}`); } };

    for (const e of g.events || []) {
      if (!e.r1h && now >= e.at - 3600000 && now < e.at) {
        e.r1h = true; touch();
        await send({ text: `⏰ *Event in 1 hour*\n*${e.title}*\n${fmtWhen(e.at, tz)}${e.place ? "\n📍 " + e.place : ""}` });
      }
      if (!e.rNow && now >= e.at && now < e.at + 15 * 60000) {
        e.rNow = true; touch();
        let ids = [];
        try { ids = ((await sock.groupMetadata(gid)).participants || []).map(p => p.id); } catch {}
        await send({ text: `🎉 *It's time!*\n*${e.title}*${e.place ? "\n📍 " + e.place : ""}`, mentions: ids });
      }
    }
    if (g.events?.length) {
      const keep = g.events.filter(e => now < e.at + 86400000);
      if (keep.length !== g.events.length) { g.events = keep; touch(); }
    }

    for (const s of [...(g.schedules || [])]) {
      if (s.daily) {
        const { day, clock } = nowIn(tz, date);
        if (clock === s.time && s.ran !== `${day} ${clock}`) { s.ran = `${day} ${clock}`; touch(); await send({ text: s.text }); }
      } else if (now >= s.at) {
        g.schedules = g.schedules.filter(x => x !== s); touch();
        if (now - s.at < 3600000) await send({ text: s.text });        // skip if the bot was off for over an hour
      }
    }
  }
}
setInterval(() => { tick().catch(() => {}); }, 30000).unref?.();

// ── plugin ──────────────────────────────────────────────────────────────────
export default {
  command: [
    "event", "eventlist", "eventremove", "groupcalendar",
    "groupfaq", "groupnotice", "grouprecap",
    "groupbackup", "grouprestore", "grouptemplate",
    "memberroles", "membertag",
    "schedule", "quiz",
  ],

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
    const senderMember = findMember(parts, ...senderJids(msg, senderJid));
    const senderIsAdmin = isAdminMember(senderMember) || isOwner;
    const needAdmin = () => reply("🚫 *Admins only.* Only group admins can use this command.");

    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo || {};
    const mentioned = ctxInfo.mentionedJid || [];
    const quotedAuthor = ctxInfo.participant;
    const tag = (jid) => `@${userPart(jid)}`;
    const sub = (args[0] || "").toLowerCase();

    // ══ EVENTS ═══════════════════════════════════════════════════════════════
    const upcoming = () => (g.events ||= []).filter(e => e.at > Date.now() - 3600000).sort((a, b) => a.at - b.at);
    const showEvents = () => {
      const list = upcoming();
      if (!list.length) return reply(`📅 *No upcoming events.*${senderIsAdmin ? "\nAdd one: .event add Movie night | friday 7pm | Hall" : ""}`);
      const lines = list.map((e, i) => `*${i + 1}.* ${e.title}\n    🕒 ${fmtWhen(e.at, tz)} (${inText(e.at - Date.now())})${e.place ? "\n    📍 " + e.place : ""}`);
      return reply(`📅 *UPCOMING EVENTS*  _(${tz})_\n\n${lines.join("\n\n")}`);
    };
    const removeEvent = (n) => {
      const list = upcoming();
      const ev = list[n - 1];
      if (!ev) return reply(`❌ Give an event number from 1 to ${list.length}.`);
      g.events = g.events.filter(e => e !== ev); touch();
      return reply(`🗑️ Event removed: *${ev.title}*`);
    };

    if (cmd === "eventlist") return showEvents();
    if (cmd === "eventremove") {
      if (!senderIsAdmin) return needAdmin();
      return removeEvent(parseInt(args[0], 10));
    }
    if (cmd === "event") {
      if (!sub || sub === "list") return showEvents();
      if (sub === "remove" || sub === "del" || sub === "delete") {
        if (!senderIsAdmin) return needAdmin();
        return removeEvent(parseInt(args[1], 10));
      }
      if (sub === "add") {
        if (!senderIsAdmin) return needAdmin();
        const [title, when, place] = args.slice(1).join(" ").split("|").map(s => s.trim());
        if (!title || !when) return reply("Use three parts split by |\n.event add Movie night | friday 7pm | Hall\n\nWhen can be: *tomorrow 8pm*, *friday 7:30pm*, *2026-10-20 19:00* or *20/10 7pm*. The place is optional.");
        const at = parseWhen(when, tz);
        if (!at) return reply("❌ I couldn't read that date and time.\nTry *tomorrow 8pm*, *friday 7pm* or *2026-10-20 19:00*.");
        if (at <= Date.now()) return reply("❌ That time has already passed.");
        if ((g.events ||= []).length >= 30) return reply("❌ You already have 30 events. Remove one first.");
        g.events.push({ title: title.slice(0, 80), at, place: place?.slice(0, 80) || "", by: userPart(senderJid) }); touch();
        return reply(`✅ *Event added*\n${title}\n🕒 ${fmtWhen(at, tz)} (${inText(at - Date.now())})${place ? "\n📍 " + place : ""}\n\nI will remind the group 1 hour before and when it starts.`);
      }
      return reply("Use: .event add | list | remove <no>");
    }

    if (cmd === "groupcalendar") {
      const now = nowIn(tz);
      let [y, mo] = now.day.split("-").map(Number);
      if (/^\d{1,2}$/.test(sub) && +sub >= 1 && +sub <= 12) { if (+sub < mo) y += 1; mo = +sub; }   // .groupcalendar 12
      const first = new Date(Date.UTC(y, mo - 1, 1));
      const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const evDays = new Map();
      for (const e of upcoming()) {
        const d = nowIn(tz, new Date(e.at)).day.split("-").map(Number);
        if (d[0] === y && d[1] === mo) evDays.set(d[2], [...(evDays.get(d[2]) || []), e]);
      }
      const startDow = (first.getUTCDay() + 6) % 7;                       // Monday = 0
      let grid = "Mo Tu We Th Fr Sa Su\n" + "   ".repeat(startDow);
      for (let d = 1; d <= daysIn; d++) {
        const isToday = now.day === `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        grid += String(d).padStart(2, " ") + (evDays.has(d) ? "*" : isToday ? "<" : " ");
        if ((startDow + d) % 7 === 0) grid += "\n";
      }
      const title = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(first);
      const lines = [...evDays.entries()].sort((a, b) => a[0] - b[0]).flatMap(([d, evs]) => evs.map(e => `• ${d} ${title.split(" ")[0]} — ${e.title}`));
      return reply(`📅 *${title.toUpperCase()}*\n\`\`\`\n${grid.trimEnd()}\n\`\`\`\n* event   < today${lines.length ? "\n\n" + lines.join("\n") : "\n\nNo events this month."}`);
    }

    // ══ FAQ ══════════════════════════════════════════════════════════════════
    if (cmd === "groupfaq") {
      const faq = (g.faq ||= []);
      if (sub === "add") {
        if (!senderIsAdmin) return needAdmin();
        const [q, a] = args.slice(1).join(" ").split("|").map(s => s.trim());
        if (!q || !a) return reply("Use a question and answer split by |\n.groupfaq add Where is the class? | Hall B, 5pm");
        if (faq.length >= 30) return reply("❌ You already have 30 FAQs. Remove one first.");
        faq.push({ q: q.slice(0, 120), a: a.slice(0, 600) }); touch();
        return reply(`✅ FAQ *#${faq.length}* added.`);
      }
      if (sub === "del" || sub === "remove") {
        if (!senderIsAdmin) return needAdmin();
        const n = parseInt(args[1], 10);
        if (!n || n < 1 || n > faq.length) return reply(`❌ Give a number from 1 to ${faq.length}.`);
        faq.splice(n - 1, 1); touch();
        return reply(`🗑️ FAQ *#${n}* removed.`);
      }
      if (/^\d+$/.test(sub)) {
        const item = faq[+sub - 1];
        if (!item) return reply(`❌ There is no FAQ #${sub}.`);
        return reply(`❓ *${item.q}*\n\n${item.a}`);
      }
      if (!faq.length) return reply(`❓ *No FAQs yet.*${senderIsAdmin ? "\nAdd one: .groupfaq add Question | Answer" : ""}`);
      return reply(`❓ *FAQ — ${meta.subject}*\n\n${faq.map((f, i) => `*${i + 1}.* ${f.q}`).join("\n")}\n\n_Send .groupfaq <number> to see an answer._`);
    }

    // ══ NOTICE ═══════════════════════════════════════════════════════════════
    if (cmd === "groupnotice") {
      if (sub === "set") {
        if (!senderIsAdmin) return needAdmin();
        const note = args.slice(1).join(" ").trim();
        if (!note) return reply("Write the notice:\n.groupnotice set Exams start on Monday");
        g.notice = { text: note.slice(0, 1000), by: userPart(senderJid), at: Date.now() }; touch();
        return reply("✅ Group notice saved. Anyone can read it with .groupnotice");
      }
      if (sub === "clear") {
        if (!senderIsAdmin) return needAdmin();
        delete g.notice; touch();
        return reply("🗑️ Group notice cleared.");
      }
      if (!g.notice) return reply(`📌 *No group notice.*${senderIsAdmin ? "\nSet one: .groupnotice set <text>" : ""}`);
      return reply(`📌 *GROUP NOTICE*\n━━━━━━━━━━━━━━━\n${g.notice.text}\n━━━━━━━━━━━━━━━\n_Posted ${new Date(g.notice.at).toDateString()}_`);
    }

    // ══ RECAP ════════════════════════════════════════════════════════════════
    if (cmd === "grouprecap") {
      const daily = g.daily || {};
      const today = nowIn(tz).day;
      const span = sub === "today" ? 1 : 7;
      const days = Object.keys(daily).filter(d => dayNum(today) - dayNum(d) < span && dayNum(today) - dayNum(d) >= 0).sort();
      if (!days.length) return reply("📊 Nothing counted yet. Chat for a while, then try again.");
      let total = 0; const users = {}; let busiest = null;
      for (const d of days) {
        total += daily[d].n;
        if (!busiest || daily[d].n > daily[busiest].n) busiest = d;
        for (const [u, n] of Object.entries(daily[d].users)) users[u] = (users[u] || 0) + n;
      }
      const top = Object.entries(users).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const topLines = top.map(([u, n], i) => {
        const jid = g.activity?.[u]?.jid || `${u}@s.whatsapp.net`;
        return `${["🥇", "🥈", "🥉"][i]} ${tag(jid)} — ${n}`;
      });
      const next = upcoming().slice(0, 3).map(e => `• ${e.title} — ${fmtWhen(e.at, tz)}`);
      return reply(
        `📊 *GROUP RECAP — ${span === 1 ? "today" : "last 7 days"}*\n_${meta.subject}_\n\n` +
        `💬 Messages: *${total}*\n👥 Active members: *${Object.keys(users).length}* of ${parts.length}\n` +
        (span > 1 && busiest ? `🔥 Busiest day: *${busiest}* (${daily[busiest].n})\n` : "") +
        `\n*Top chatters*\n${topLines.join("\n")}` +
        (next.length ? `\n\n*Coming up*\n${next.join("\n")}` : ""),
        { mentions: top.map(([u]) => g.activity?.[u]?.jid || `${u}@s.whatsapp.net`) }
      );
    }

    // ══ BACKUP / RESTORE / TEMPLATES ═════════════════════════════════════════
    if (cmd === "groupbackup") {
      if (!senderIsAdmin) return needAdmin();
      const snap = snapshot(from);
      const dir = backupDir(from);
      fs.mkdirSync(dir, { recursive: true });
      const name = `${new Date(snap.savedAt).toISOString().replace(/[:.]/g, "-")}.json`;
      fs.writeFileSync(path.join(dir, name), JSON.stringify(snap, null, 2));
      for (const old of listBackups(from).slice(MAX_BACKUPS)) fs.rmSync(path.join(dir, old), { force: true });
      let dm = "";
      try {
        const dmJid = senderMember?.phoneNumber || senderJid;
        await sock.sendMessage(dmJid, {
          document: Buffer.from(JSON.stringify(snap, null, 2)), mimetype: "application/json",
          fileName: `${meta.subject.replace(/[^\w]+/g, "_")}-backup.json`,
          caption: `Backup of *${meta.subject}*`,
        });
        dm = "\nA copy was sent to your private chat.";
      } catch { dm = "\n(I couldn't send the file to your private chat, but the backup is saved on the bot.)"; }
      return reply(`✅ *Backup saved.*\n${describeSnap(snap)}${dm}\n\nRestore with .grouprestore`);
    }

    if (cmd === "grouprestore") {
      if (!senderIsAdmin) return needAdmin();
      const files = listBackups(from);
      if (!files.length) return reply("📦 No backups for this group yet. Make one with .groupbackup");
      const n = /^\d+$/.test(sub) ? +sub : 0;
      if (!n) {
        const lines = files.slice(0, 5).map((f, i) => `*${i + 1}.* ${new Date(readJson(path.join(backupDir(from), f), {}).savedAt || 0).toLocaleString("en-GB", { timeZone: tz })}`);
        return reply(`📦 *BACKUPS*\n\n${lines.join("\n")}\n\nRestore one: .grouprestore <number> yes`);
      }
      const file = files[n - 1];
      if (!file) return reply(`❌ Pick a backup from 1 to ${files.length}.`);
      const snap = readJson(path.join(backupDir(from), file), null);
      if (!snap) return reply("❌ That backup file is damaged.");
      if ((args[1] || "").toLowerCase() !== "yes") {
        return reply(`⚠️ *Restore backup #${n}?*\nThis replaces the current settings with:\n${describeSnap(snap)}\n\nTo go ahead: .grouprestore ${n} yes`);
      }
      applySnapshot(from, snap);
      return reply(`✅ *Backup #${n} restored.*`);
    }

    if (cmd === "grouptemplate") {
      if (!senderIsAdmin) return needAdmin();
      const owner = userPart(senderMember?.phoneNumber || senderJid);
      const all = readJson(TEMPLATE_FILE, {});
      const mine = (all[owner] ||= {});
      const name = (args[1] || "").toLowerCase();
      const okName = /^[a-z0-9_-]{1,20}$/.test(name);
      const saveAll = () => { fs.mkdirSync(path.dirname(TEMPLATE_FILE), { recursive: true }); fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(all, null, 2)); };

      if (sub === "save") {
        if (!okName) return reply("Give a short name using letters, numbers, - or _\n.grouptemplate save school");
        if (!mine[name] && Object.keys(mine).length >= 10) return reply("❌ You already have 10 templates. Delete one first.");
        mine[name] = snapshot(from, { template: true }); saveAll();
        return reply(`✅ Template *${name}* saved from this group.\nUse it in another group with .grouptemplate apply ${name} yes`);
      }
      if (sub === "apply") {
        if (!okName || !mine[name]) return reply("❌ I don't have a template with that name. See .grouptemplate list");
        if ((args[2] || "").toLowerCase() !== "yes") return reply(`⚠️ *Apply template ${name}?*\n${describeSnap(mine[name])}\n\nTo go ahead: .grouptemplate apply ${name} yes`);
        applySnapshot(from, mine[name]);
        return reply(`✅ Template *${name}* applied to this group.`);
      }
      if (sub === "delete" || sub === "del" || sub === "remove") {
        if (!okName || !mine[name]) return reply("❌ I don't have a template with that name.");
        delete mine[name]; saveAll();
        return reply(`🗑️ Template *${name}* deleted.`);
      }
      const names = Object.keys(mine);
      return reply(names.length
        ? `🧩 *YOUR TEMPLATES*\n\n${names.map(n => `• ${n}`).join("\n")}\n\n.grouptemplate save | apply | delete <name>`
        : "🧩 *No templates yet.*\nSet this group up the way you like, then run:\n.grouptemplate save school\nTemplates copy settings (welcome, rules, anti-link, FAQ, times), not notes or events.");
    }

    // ══ ROLES ════════════════════════════════════════════════════════════════
    if (cmd === "memberroles" || cmd === "membertag") {
      const roles = (g.roles ||= {});
      const byRole = {};
      for (const [k, r] of Object.entries(roles)) (byRole[r.role.toLowerCase()] ||= { label: r.role, members: [] }).members.push(r.jid);

      if (cmd === "memberroles") {
        if (sub === "add" || sub === "remove") {
          if (!senderIsAdmin) return needAdmin();
          const target = mentioned[0] || quotedAuthor;
          const member = target ? findMember(parts, target) : null;
          if (!member) return reply(`Tag the member (or reply to them):\n.memberroles ${sub} @member ${sub === "add" ? "Treasurer" : ""}`.trim());
          const key = userPart(member.id);
          if (sub === "remove") { delete roles[key]; touch(); return reply(`✅ Role removed from ${tag(member.id)}.`, { mentions: [member.id] }); }
          const role = args.slice(1).filter(a => !a.startsWith("@")).join(" ").trim().slice(0, 24);
          if (!role) return reply("Give the role name:\n.memberroles add @member Treasurer");
          roles[key] = { role, jid: member.id }; touch();
          return reply(`✅ ${tag(member.id)} is now *${role}*.`, { mentions: [member.id] });
        }
        if (sub === "clear") { if (!senderIsAdmin) return needAdmin(); g.roles = {}; touch(); return reply("🗑️ All roles cleared."); }
        const groups = Object.values(byRole);
        if (!groups.length) return reply(`🏷️ *No roles yet.*${senderIsAdmin ? "\nGive one: .memberroles add @member Treasurer" : ""}`);
        return reply(`🏷️ *MEMBER ROLES*\n\n${groups.map(r => `*${r.label}*\n${r.members.map(tag).join(" ")}`).join("\n\n")}`, { mentions: groups.flatMap(r => r.members) });
      }

      // .membertag <role> — tag everyone who has that role
      if (!senderIsAdmin) return needAdmin();
      const wanted = text.toLowerCase();
      if (!wanted) {
        const names = Object.values(byRole);
        return reply(names.length ? `🏷️ Roles you can tag:\n${names.map(r => `• ${r.label} (${r.members.length})`).join("\n")}\n\n.membertag <role> [message]` : "🏷️ No roles yet. Add one with .memberroles add @member <role>");
      }
      const hit = Object.entries(byRole).find(([k]) => wanted === k || wanted.startsWith(k + " "));
      if (!hit) return reply("❌ I don't have that role. Send .membertag to see the roles.");
      const [k, info] = hit;
      const extra = wanted.slice(k.length).trim() ? text.slice(k.length).trim() : "";
      return sock.sendMessage(from, {
        text: `🏷️ *${info.label}*${extra ? `\n${extra}` : ""}\n\n${info.members.map(tag).join(" ")}`,
        mentions: info.members,
      });
    }

    // ══ SCHEDULED MESSAGES ═══════════════════════════════════════════════════
    if (cmd === "schedule") {
      if (!senderIsAdmin) return needAdmin();
      const list = (g.schedules ||= []);
      if (!sub || sub === "list") {
        if (!list.length) return reply("🗓️ *No scheduled messages.*\nOnce: .schedule 21:30 Good night everyone\nEvery day: .schedule daily 06:00 Good morning");
        return reply(`🗓️ *SCHEDULED MESSAGES* _(${tz})_\n\n${list.map((s, i) => `*${i + 1}.* ${s.daily ? "every day " + s.time : fmtWhen(s.at, tz)}\n    ${s.text.slice(0, 80)}`).join("\n\n")}\n\nRemove: .schedule del <number>`);
      }
      if (sub === "del" || sub === "remove") {
        const n = parseInt(args[1], 10);
        if (!n || n < 1 || n > list.length) return reply(`❌ Give a number from 1 to ${list.length}.`);
        list.splice(n - 1, 1); touch();
        return reply(`🗑️ Scheduled message *#${n}* removed.`);
      }
      const daily = sub === "daily";
      const rest = daily ? args.slice(1) : args;
      // time may be "21:30", "9pm" or "9:30 pm" (two words)
      let timeStr = rest[0], used = 1;
      if (/^(am|pm)$/i.test(rest[1] || "")) { timeStr = `${rest[0]} ${rest[1]}`; used = 2; }
      const clock = parseClock(timeStr);
      const message = rest.slice(used).join(" ").trim();
      if (!clock || !message) return reply("Use: .schedule <time> <message>\n.schedule 21:30 Good night everyone\n.schedule daily 6am Good morning everyone");
      if (list.length >= 20) return reply("❌ You already have 20 scheduled messages. Remove one first.");
      if (daily) list.push({ daily: true, time: clock, text: message.slice(0, 1000) });
      else {
        let at = parseWhen(clock, tz);
        if (at <= Date.now()) at = parseWhen(`tomorrow ${clock}`, tz);
        list.push({ at, text: message.slice(0, 1000) });
      }
      touch();
      const last = list.at(-1);
      return reply(`✅ Scheduled ${daily ? `*every day at ${clock}*` : `for *${fmtWhen(last.at, tz)}*`} (${tz}):\n${message}`);
    }

    // ══ QUIZ ═════════════════════════════════════════════════════════════════
    if (cmd === "quiz") {
      const scores = (g.quizScores ||= {});
      if (sub === "top") {
        const rows = Object.entries(scores).sort((a, b) => b[1].points - a[1].points).slice(0, 10);
        if (!rows.length) return reply("🏆 Nobody has scored yet. Start with .quiz");
        return reply(`🏆 *QUIZ LEADERBOARD*\n\n${rows.map(([, s], i) => `${["🥇", "🥈", "🥉"][i] || `*${i + 1}.*`} ${tag(s.jid)} — ${s.points}`).join("\n")}`, { mentions: rows.map(([, s]) => s.jid) });
      }
      if (sub === "stop") {
        if (!senderIsAdmin) return needAdmin();
        if (!activeQuiz[from]) return reply("There is no quiz running.");
        endQuiz(from, "stop");
        return reply("🛑 Quiz stopped.");
      }
      const live = activeQuiz[from];
      if (/^[a-d]$/.test(sub)) {
        if (!live) return reply("No quiz is running. Start one with .quiz");
        const who = userPart(senderMember?.id || senderJid);
        if (live.tried.includes(who)) return reply("You already used your try on this question.");
        live.tried.push(who);
        if ("abcd".indexOf(sub) !== live.correct) return reply("❌ Not that one.");
        const entry = (scores[who] ||= { points: 0, jid: senderMember?.id || senderJid });
        entry.points++; touch();
        const answer = `${"ABCD"[live.correct]}) ${live.options[live.correct]}`;
        endQuiz(from, "won");
        return reply(`✅ ${tag(senderMember?.id || senderJid)} got it! The answer is *${answer}*\n+1 point (total ${entry.points})`, { mentions: [senderMember?.id || senderJid] });
      }
      if (live) return reply(`🧠 A question is already running:\n\n${live.text}`);
      const [question, right, wrong] = BANK[Math.floor(Math.random() * BANK.length)];
      const options = shuffle([right, ...wrong]);
      const correct = options.indexOf(right);
      const textQ = `*${question}*\n\n${options.map((o, i) => `${"ABCD"[i]}) ${o}`).join("\n")}`;
      activeQuiz[from] = {
        sock, options, correct, tried: [], text: textQ,
        timer: setTimeout(() => endQuiz(from, "timeout"), QUIZ_SECONDS * 1000),
      };
      activeQuiz[from].timer.unref?.();
      return reply(`🧠 *QUIZ TIME* (${QUIZ_SECONDS} seconds)\n\n${textQ}\n\nAnswer with *.quiz a*, *.quiz b*, *.quiz c* or *.quiz d*\nOne try each. Scores: .quiz top`);
    }
  },
};

// exposed for tests
export const __internals2 = { tick, parseWhen, zonedToUtc, tzOffsetMs, snapshot, applySnapshot, activeQuiz, endQuiz, BANK };
