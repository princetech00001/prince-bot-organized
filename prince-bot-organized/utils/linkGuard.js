import { getGroup, addWarn, resetWarns } from "./groupStore.js";
import { getGroupContext, memberKey, numberOf, memberIdSet, senderJids } from "./groupAdmin.js";
import { getMod } from "./modStore.js";
import { isListed } from "./modEngine.js";

// Link detection: web links, chat/invite links, short links, and bare
// domains (example.com). The lookbehind skips e-mail addresses.
const URL_RE = new RegExp(
  [
    "(?:https?:\\/\\/|www\\.)[^\\s]+",
    "(?:chat\\.whatsapp\\.com|wa\\.me|whatsapp\\.com\\/channel|t\\.me|discord\\.gg|bit\\.ly|tinyurl\\.com|youtu\\.be)\\/[^\\s]*",
    "(?<![@\\w.-])[a-z0-9][a-z0-9-]*\\.(?:com|net|org|io|me|co|xyz|link|site|online|info|biz|app|dev|gg|ly|tk|ru|cc|ng)\\b(?:\\/[^\\s]*)?",
  ].join("|"),
  "gi"
);

export function findLinks(text) {
  return String(text || "").match(URL_RE) || [];
}

export function hostOf(link) {
  try {
    const u = new URL(/^https?:\/\//i.test(link) ? link : `http://${link}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(link).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

export function isAllowedLink(link, allow = []) {
  const host = hostOf(link);
  return allow.some(d => host === d || host.endsWith(`.${d}`));
}

// Don't repeat "I'm not admin" in a group more than once per 10 minutes.
const noticeAt = new Map();
function throttled(gid) {
  const now = Date.now();
  if (now - (noticeAt.get(gid) || 0) < 10 * 60 * 1000) return true;
  noticeAt.set(gid, now);
  return false;
}

/**
 * Runs on every group message. Returns true if it acted on a link.
 * Admins, the owner, the bot, whitelisted domains and real bot commands
 * are never touched.
 */
export async function handleAntiLink({ sock, msg, from, body, isOwner, senderJid, botNumber, isBotCommand = false }) {
  const settings = getGroup(from).antilink;
  if (!settings.enabled) return false;
  if (isOwner || msg.key.fromMe || isBotCommand) return false;

  const links = findLinks(body).filter(l => !isAllowedLink(l, settings.allow));
  if (!links.length) return false;

  const ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner });
  if (ctx.senderIsAdmin) return false;
  // members an admin allowed with .linkallow may post links
  const exempt = getMod(from).linkAllowed;
  if (exempt.length && isListed(exempt, ...senderJids(msg, senderJid), ...(ctx.senderMember ? [...memberIdSet(ctx.senderMember)] : []))) return false;

  if (!ctx.botIsAdmin) {
    if (!throttled(from)) {
      await sock.sendMessage(from, { text: "⚠️ *Anti-Link is ON*, but I can't remove links because I'm not a group admin. Please make me admin." }).catch(() => {});
    }
    return false;
  }

  const target = ctx.senderMember?.id || senderJid;
  const num = numberOf(target);
  const key = ctx.senderMember ? memberKey(ctx.senderMember) : num;
  const say = (text) => sock.sendMessage(from, { text, mentions: [target] }).catch(() => {});

  await sock.sendMessage(from, { delete: msg.key }).catch(() => {});

  if (settings.mode === "kick") {
    await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => {});
    await say(`🚫 @${num} was removed for sending a link.`);
    return true;
  }

  if (settings.mode === "warn") {
    const limit = getGroup(from).warnLimit;
    const count = addWarn(from, key, "Sent a link");
    if (count >= limit) {
      resetWarns(from, key);
      await sock.groupParticipantsUpdate(from, [target], "remove").catch(() => {});
      await say(`🚫 @${num} reached ${limit}/${limit} warnings for links and was removed.`);
    } else {
      await say(`🔗 @${num}, links are not allowed here.\n⚠️ Warning ${count}/${limit}`);
    }
    return true;
  }

  await say(`🔗 @${num}, links are not allowed here. Your message was deleted.`);
  return true;
}
