// Moderation engine — runs on every group message and every group event.
//
// Message filters (each can delete / warn / kick):
//   antichannel, antimention, antipicture, antivideo, mediaonly, textonly,
//   capslock, flood, profanity, plus jail and restricted mode.
// Group events:
//   join / leave history, antijoin, antiraid, join verification (guard),
//   intro prompt, antihijack, admin log.
//
// Admins, the bot owner and the bot itself are never touched by message filters.
import { BOT_CONFIG } from "../config.js";
import { addWarn, getGroup, resetWarns } from "./groupStore.js";
import { getMod, updateMod, logEvent, recordHistory } from "./modStore.js";
import {
  findMember, isAdminMember, botJids, senderJids, memberIdSet, idSet, memberKey, numberOf, isSelf,
} from "./groupAdmin.js";
import { fillTemplate } from "./welcomeGuard.js";

// ── group info cache (WhatsApp rate-limits metadata requests) ───────────────
const metaCache = new Map();
export async function getMeta(sock, gid, maxAgeMs = 20000) {
  const hit = metaCache.get(gid);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.meta;
  const meta = await sock.groupMetadata(gid);
  metaCache.set(gid, { at: Date.now(), meta });
  return meta;
}
export const forgetMeta = (gid) => metaCache.delete(gid);

async function rolesFor({ sock, msg, from, senderJid, botNumber, isOwner }) {
  const meta = await getMeta(sock, from);
  const parts = meta.participants || [];
  const botMember = findMember(parts, ...botJids(sock, botNumber));
  const senderMember = findMember(parts, ...senderJids(msg, senderJid));
  return {
    meta, parts, botMember, senderMember,
    botIsAdmin: isAdminMember(botMember),
    senderIsAdmin: isAdminMember(senderMember) || !!isOwner,
  };
}

// ── reading a message ───────────────────────────────────────────────────────
function unwrap(message) {
  let m = message || {};
  for (let i = 0; i < 4; i++) {
    const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message
      || m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}
const KINDS = {
  conversation: "text", extendedTextMessage: "text", imageMessage: "image", videoMessage: "video",
  stickerMessage: "sticker", audioMessage: "audio", documentMessage: "document", contactMessage: "contact",
  contactsArrayMessage: "contact", locationMessage: "location", liveLocationMessage: "location",
  pollCreationMessage: "poll", pollCreationMessageV2: "poll", pollCreationMessageV3: "poll",
  reactionMessage: "reaction", protocolMessage: "protocol", pollUpdateMessage: "protocol",
};
/** { kind, body, ci } — what the message is, its text/caption, and its contextInfo. */
export function describe(msg) {
  const m = unwrap(msg.message);
  const type = Object.keys(m).find(k => k !== "messageContextInfo" && k !== "senderKeyDistributionMessage") || "";
  const content = m[type];
  const body = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption
    || m.videoMessage?.caption || m.documentMessage?.caption || "";
  return { type, kind: KINDS[type] || "other", body, ci: content && typeof content === "object" ? content.contextInfo || null : null };
}

// ── individual checks ───────────────────────────────────────────────────────
const CHANNEL_RE = /whatsapp\.com\/channel\/|wa\.me\/channel\//i;
export const hasChannel = (d) => CHANNEL_RE.test(d.body) || !!d.ci?.forwardedNewsletterMessageInfo || d.type === "newsletterAdminInviteMessage";

export function massMention(d, limit) {
  const tagged = d.ci?.mentionedJid?.length || 0;
  const typed = (d.body.match(/@\d{6,}/g) || []).length;
  return !!d.ci?.groupMentions?.length || /@(everyone|all)\b/i.test(d.body) || Math.max(tagged, typed) >= limit;
}

export function isShouting(text, { percent, minLetters }) {
  const letters = String(text || "").replace(/[^A-Za-z]/g, "");
  if (letters.length < minLetters) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length >= percent / 100;
}

const LEET = { "@": "a", "4": "a", "0": "o", "1": "i", "3": "e", "$": "s", "5": "s", "7": "t", "!": "i" };
const normalise = (t) => String(t).toLowerCase().replace(/[@40135$7!]/g, c => LEET[c] || c);
export function findBadWord(text, words) {
  if (!words?.length) return null;
  const plain = String(text).toLowerCase();
  const leet = normalise(text);
  for (const w of words) {
    const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(plain) || re.test(leet)) return w;
  }
  return null;
}

const floodLog = new Map();
export function recordFlood(gid, key, { messages, seconds }, now = Date.now()) {
  const id = `${gid}|${key}`;
  const list = (floodLog.get(id) || []).filter(t => now - t < seconds * 1000);
  list.push(now);
  if (list.length >= messages) { floodLog.delete(id); return true; }
  floodLog.set(id, list);
  return false;
}

const listed = (entries, ...jids) => {
  const want = idSet(...jids);
  return entries.some(e => (e.ids || []).some(i => want.has(i)));
};
export const isListed = listed;

// ── notices (don't spam the group) ──────────────────────────────────────────
const noticeAt = new Map();
function throttled(id, ms) {
  const now = Date.now();
  if (now - (noticeAt.get(id) || 0) < ms) return true;
  noticeAt.set(id, now);
  return false;
}

async function enforce({ sock, msg, from, ctx, senderJid, filter, action, reason, silent = false }) {
  const target = ctx.senderMember?.id || senderJid;
  const key = ctx.senderMember ? memberKey(ctx.senderMember) : numberOf(target);
  const num = numberOf(target);
  const say = (text) => sock.sendMessage(from, { text, mentions: [target] }).catch(() => {});

  if (!ctx.botIsAdmin) {
    if (!throttled(`${from}|admin|${filter}`, 10 * 60 * 1000)) {
      await sock.sendMessage(from, { text: `⚠️ *${filter}* is ON, but I can't enforce it because I'm not a group admin. Please make me admin.` }).catch(() => {});
    }
    return true;
  }
  await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
  logEvent(from, { type: "action", filter, key, jid: target, reason, action: silent ? "delete" : action });
  if (silent) return true;

  if (action === "kick") {
    await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => {});
    await say(`🚫 @${num} was removed. Reason: ${reason}.`);
  } else if (action === "warn") {
    const limit = getGroup(from).warnLimit;
    const count = addWarn(from, key, reason);
    if (count >= limit) {
      resetWarns(from, key);
      await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => {});
      await say(`🚫 @${num} reached ${limit}/${limit} warnings (${reason}) and was removed.`);
    } else if (!throttled(`${from}|${key}|${filter}`, 15000)) {
      await say(`⚠️ @${num}, ${reason}.\nWarning ${count}/${limit}`);
    }
  } else if (!throttled(`${from}|${key}|${filter}`, 15000)) {
    await say(`⚠️ @${num}, ${reason}. Your message was deleted.`);
  }
  return true;
}

// ── join verification (guard) ───────────────────────────────────────────────
const pending = new Map();                       // gid -> Map(id -> { ids:Set, code, jid, timer })
const pendingFor = (gid) => pending.get(gid) || new Map();
export const pendingGuardCount = (gid) => pendingFor(gid).size;

async function verifyReply({ sock, from, body, msg, senderJid }) {
  const group = pending.get(from);
  if (!group?.size) return false;
  const mine = idSet(...senderJids(msg, senderJid));
  for (const [id, p] of group) {
    if (![...p.ids].some(i => mine.has(i))) continue;
    if (body.replace(/\s/g, "").includes(p.code)) {
      clearTimeout(p.timer);
      group.delete(id);
      await sock.sendMessage(from, { text: `✅ @${numberOf(p.jid)} is verified. Welcome!`, mentions: [p.jid] }).catch(() => {});
      logEvent(from, { type: "join", detail: "verified", key: numberOf(p.jid), jid: p.jid });
      return true;
    }
    return false;                                  // they spoke, but not with the code
  }
  return false;
}

function startVerification(sock, gid, jid, ids, seconds) {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const group = pending.get(gid) || new Map();
  pending.set(gid, group);
  const id = numberOf(jid);
  if (group.has(id)) clearTimeout(group.get(id).timer);
  const timer = setTimeout(async () => {
    const entry = group.get(id);
    if (!entry) return;
    group.delete(id);
    try {
      forgetMeta(gid);
      const meta = await getMeta(sock, gid, 0);
      const member = findMember(meta.participants || [], jid);
      if (!member || isAdminMember(member)) return;
      await sock.groupParticipantsUpdate(gid, [member.id], "remove");
      logEvent(gid, { type: "action", filter: "guard", key: id, jid, reason: "did not verify in time", action: "kick" });
      await sock.sendMessage(gid, { text: `⏱️ @${numberOf(jid)} did not verify in time and was removed.`, mentions: [jid] }).catch(() => {});
    } catch (e) { console.log("[guard] expiry failed:", e.message); }
  }, seconds * 1000);
  timer.unref?.();
  group.set(id, { ids, code, jid, timer });
  return code;
}

// ── message hook ────────────────────────────────────────────────────────────
/** Returns true if it acted on the message. Call for every group message. */
export async function handleModMessage({ sock, msg, from, isOwner, senderJid, botNumber, isBotCommand = false }) {
  if (msg.key.fromMe) return false;
  const d = describe(msg);
  if (d.kind === "reaction" || d.kind === "protocol") return false;

  // join verification replies come first (even from people who are about to be removed)
  if (pending.get(from)?.size && d.body) {
    if (await verifyReply({ sock, from, body: d.body, msg, senderJid })) return true;
  }
  if (isOwner) return false;

  const mod = getMod(from);
  const jailCount = Object.keys(mod.jailed).length;
  const anyOn = mod.antichannel.enabled || mod.antimention.enabled || mod.antipicture.enabled || mod.antivideo.enabled
    || mod.mediaonly.enabled || mod.textonly.enabled || mod.capslock.enabled || mod.flood.enabled
    || mod.profanity.enabled || mod.restrict.enabled || jailCount > 0;
  if (!anyOn) return false;

  let ctx;
  try { ctx = await rolesFor({ sock, msg, from, senderJid, botNumber, isOwner }); } catch { return false; }
  if (ctx.senderIsAdmin) return false;
  const ids = senderJids(msg, senderJid);
  const base = { sock, msg, from, ctx, senderJid };

  // jailed members: every message is deleted, silently
  if (jailCount && listed(Object.values(mod.jailed), ...ids, ...(ctx.senderMember ? [...memberIdSet(ctx.senderMember)] : []))) {
    return enforce({ ...base, filter: "jail", action: "delete", reason: "jailed", silent: true });
  }
  // restricted mode: only admins and allowed members may speak
  if (mod.restrict.enabled && !isBotCommand) {
    const ok = listed(mod.restrict.allow, ...ids, ...(ctx.senderMember ? [...memberIdSet(ctx.senderMember)] : []));
    if (!ok) {
      if (ctx.botIsAdmin && !throttled(`${from}|restrict-note`, 60000)) {
        await sock.sendMessage(from, { text: "🔒 *Restricted mode is on.* Only admins and approved members can chat right now." }).catch(() => {});
      }
      return enforce({ ...base, filter: "restrict", action: "delete", reason: "restricted mode", silent: true });
    }
  }
  if (isBotCommand) return false;                  // real bot commands are never filtered below

  if (mod.antichannel.enabled && hasChannel(d)) return enforce({ ...base, filter: "antichannel", action: mod.antichannel.action, reason: "channel links and forwards are not allowed" });
  if (mod.antimention.enabled && massMention(d, mod.antimention.limit)) return enforce({ ...base, filter: "antimention", action: mod.antimention.action, reason: "mass mentions are not allowed" });
  if (mod.antipicture.enabled && d.kind === "image") return enforce({ ...base, filter: "antipicture", action: mod.antipicture.action, reason: "pictures are not allowed" });
  if (mod.antivideo.enabled && d.kind === "video") return enforce({ ...base, filter: "antivideo", action: mod.antivideo.action, reason: "videos are not allowed" });
  if (mod.textonly.enabled && !["text", "poll"].includes(d.kind)) return enforce({ ...base, filter: "textonly", action: "delete", reason: "this group is text-only" });
  if (mod.mediaonly.enabled && d.kind === "text") return enforce({ ...base, filter: "mediaonly", action: "delete", reason: "this group is media-only (no plain text)" });
  if (mod.capslock.enabled && isShouting(d.body, mod.capslock)) return enforce({ ...base, filter: "capslock", action: mod.capslock.action, reason: "please don't use ALL CAPS" });
  if (mod.profanity.enabled) {
    const hit = findBadWord(d.body, mod.profanity.words);
    if (hit) return enforce({ ...base, filter: "profanity", action: mod.profanity.action, reason: "watch your language" });
  }
  if (mod.flood.enabled) {
    const key = ctx.senderMember ? memberKey(ctx.senderMember) : numberOf(senderJid);
    if (recordFlood(from, key, mod.flood)) return enforce({ ...base, filter: "flood", action: mod.flood.action, reason: "you are sending messages too fast" });
  }
  return false;
}

// ── group events ────────────────────────────────────────────────────────────
const joinTimes = new Map();                     // gid -> [{ t, jid }]

/** Lock the group when a raid is detected, or by hand. */
export async function lockdown(sock, gid) {
  updateMod(gid, m => { m.antiraid.locked = true; });
  await sock.groupSettingUpdate(gid, "announcement").catch(() => {});
  await sock.groupJoinApprovalMode?.(gid, "on")?.catch?.(() => {});
}
export async function unlock(sock, gid) {
  updateMod(gid, m => { m.antiraid.locked = false; });
  await sock.groupSettingUpdate(gid, "not_announcement").catch(() => {});
  await sock.groupJoinApprovalMode?.(gid, "off")?.catch?.(() => {});
}

const ownerNumbers = () => (BOT_CONFIG?.OWNER || []).map(String);

/** Call for every "group-participants.update" event. */
export async function handleModEvent({ sock, gid, participants, action, author, botNumber }) {
  const people = (participants || []).map(p => (typeof p === "string" ? { id: p } : p)).filter(p => p?.id);
  if (!people.length) return;
  forgetMeta(gid);
  const mod = getMod(gid);
  const authorIds = author ? [author] : [];
  const byBot = author && isSelf(sock, author);

  if (action === "add" || action === "remove") {
    for (const p of people) {
      if (isSelf(sock, p.id, p.phoneNumber)) continue;
      recordHistory(gid, [p.id, p.phoneNumber, p.lid].filter(Boolean), action === "add" ? "join" : "leave");
      logEvent(gid, { type: action === "add" ? "join" : "leave", key: numberOf(p.id), jid: p.id, by: author ? numberOf(author) : null });
    }
  }

  if (action === "add" && !byBot) {
    const joiners = people.filter(p => !isSelf(sock, p.id, p.phoneNumber));
    if (!joiners.length) return;
    let meta = null;
    try { meta = await getMeta(sock, gid, 0); } catch {}
    const botMember = meta ? findMember(meta.participants || [], ...botJids(sock, botNumber)) : null;
    const botIsAdmin = isAdminMember(botMember);
    const authorMember = meta && author ? findMember(meta.participants || [], ...authorIds) : null;
    const addedByAdmin = isAdminMember(authorMember) || (author && idSet(author).size && ownerNumbers().some(n => idSet(author).has(n)));

    // antijoin: remove anyone who joins on their own or is added by a non-admin
    if (mod.antijoin.enabled && botIsAdmin && !addedByAdmin && author) {
      for (const p of joiners) await sock.groupParticipantsUpdate(gid, [p.id], "remove").catch(() => {});
      logEvent(gid, { type: "action", filter: "antijoin", reason: "joins are paused", action: "kick", count: joiners.length });
      await sock.sendMessage(gid, { text: "⏸️ *New joins are paused.* Admins are reviewing the group, so new members were removed. Ask an admin to add you." }).catch(() => {});
      return;
    }

    // antiraid: too many joins in a short time -> lock the group
    if (mod.antiraid.enabled) {
      const now = Date.now();
      const list = (joinTimes.get(gid) || []).filter(x => now - x.t < mod.antiraid.seconds * 1000);
      for (const p of joiners) list.push({ t: now, jid: p.id });
      joinTimes.set(gid, list);
      if (list.length >= mod.antiraid.joins && !mod.antiraid.locked) {
        await lockdown(sock, gid);
        logEvent(gid, { type: "action", filter: "antiraid", reason: `${list.length} joins in ${mod.antiraid.seconds}s`, action: "lockdown" });
        const admins = meta ? (meta.participants || []).filter(isAdminMember).map(a => a.id) : [];
        await sock.sendMessage(gid, {
          text: `🚨 *POSSIBLE RAID*\n${list.length} people joined in ${mod.antiraid.seconds} seconds.\nThe group is now *locked* (only admins can send, new members need approval).\n\nAdmins: *.antiraid unlock* to reopen, or *.antiraid purge* to remove the newest joiners.\n${admins.map(a => "@" + numberOf(a)).join(" ")}`,
          mentions: admins,
        }).catch(() => {});
        return;
      }
    }

    // join verification
    if (mod.guard.enabled && botIsAdmin) {
      for (const p of joiners) {
        const ids = memberIdSet(p);
        const code = startVerification(sock, gid, p.id, ids, mod.guard.seconds);
        await sock.sendMessage(gid, {
          text: `🛡️ Welcome @${numberOf(p.id)}!\nTo prove you're real, send the code *${code}* in this group within *${mod.guard.seconds} seconds*, or you will be removed.`,
          mentions: [p.id],
        }).catch(() => {});
      }
    }

    // intro prompt
    if (mod.introcard.enabled) {
      const group = meta?.subject || "this group";
      for (const p of joiners.slice(0, 5)) {
        const template = mod.introcard.prompt || "👋 Hi {user}! Tell us about yourself in *{group}*:\n*.intro Name | Age | From | About you*";
        await sock.sendMessage(gid, { text: fillTemplate(template, { jid: p.id, group, count: meta?.participants?.length || 0 }), mentions: [p.id] }).catch(() => {});
      }
    }
    return;
  }

  // admin changes: log them, and undo unauthorised ones when antihijack is on
  if (action === "promote" || action === "demote") {
    logEvent(gid, { type: "admin", action, by: author ? numberOf(author) : null, targets: people.map(p => numberOf(p.id)) });
    if (!mod.antihijack.enabled || !author || byBot) return;
    let meta = null;
    try { meta = await getMeta(sock, gid, 0); } catch { return; }
    const parts = meta.participants || [];
    const botMember = findMember(parts, ...botJids(sock, botNumber));
    if (!isAdminMember(botMember)) return;
    const authorIdSet = idSet(author);
    const isCreator = parts.some(p => p.admin === "superadmin" && [...memberIdSet(p)].some(i => authorIdSet.has(i)));
    const isBotOwner = ownerNumbers().some(n => authorIdSet.has(n));
    if (isCreator || isBotOwner) return;
    const targets = people.map(p => p.id).filter(id => {
      const m = findMember(parts, id);
      return !(m && m.admin === "superadmin");
    });
    if (!targets.length) return;
    await sock.groupParticipantsUpdate(gid, targets, action === "promote" ? "demote" : "promote").catch(() => {});
    logEvent(gid, { type: "action", filter: "antihijack", reason: `unauthorised ${action} by @${numberOf(author)} undone`, action: "revert" });
    await sock.sendMessage(gid, {
      text: `🛡️ *Admin protection*\n@${numberOf(author)} tried to ${action} ${targets.map(t => "@" + numberOf(t)).join(" ")}. Only the group creator and the bot owner can change admins, so I undid it.`,
      mentions: [author, ...targets],
    }).catch(() => {});
    forgetMeta(gid);
  }
}

// exposed for tests
export const __engine = { pending, joinTimes, floodLog, noticeAt, startVerification };
