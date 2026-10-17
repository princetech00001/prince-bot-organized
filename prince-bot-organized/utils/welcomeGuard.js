import { getGroup } from "./groupStore.js";
import { isSelf, numberOf } from "./groupAdmin.js";

export const DEFAULT_WELCOME =
  "👋 Welcome {user} to *{group}*!\nYou are member #{count}. Be kind and follow the rules.";
export const DEFAULT_GOODBYE =
  "👋 {user} left *{group}*. Goodbye!";

/** Fill {user} {name} {group} {count} {desc} — every occurrence. */
export function fillTemplate(template, { jid, group = "", count = 0, desc = "" }) {
  const mention = `@${numberOf(jid)}`;
  return String(template)
    .replace(/\{user\}/gi, mention)
    .replace(/\{name\}/gi, mention)
    .replace(/\{group\}/gi, group)
    .replace(/\{count\}/gi, String(count))
    .replace(/\{desc\}/gi, desc);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Called by the bot on every "group-participants.update" event. */
export async function handleParticipantsUpdate({ sock, gid, participants, action }) {
  if (action !== "add" && action !== "remove") return;

  const g = getGroup(gid);
  const cfg = action === "add" ? g.welcome : g.goodbye;
  if (!cfg.enabled) return;

  let meta = null;
  try { meta = await sock.groupMetadata(gid); } catch {}
  const group = meta?.subject || "this group";
  const count = meta?.participants?.length || 0;
  const desc = meta?.desc || "";

  // Baileys can send plain ids or objects { id, phoneNumber } — accept both.
  const people = (participants || []).slice(0, 10);
  for (const p of people) {
    const jid = typeof p === "string" ? p : p?.id;
    if (!jid) continue;
    if (isSelf(sock, jid, typeof p === "object" ? p.phoneNumber : null)) continue;

    const template = cfg.text || (action === "add" ? DEFAULT_WELCOME : DEFAULT_GOODBYE);
    const text = fillTemplate(template, { jid, group, count, desc });

    let sent = false;
    if (action === "add") {
      try {
        const url = await sock.profilePictureUrl(jid, "image");
        if (url) {
          await sock.sendMessage(gid, { image: { url }, caption: text, mentions: [jid] });
          sent = true;
        }
      } catch {}
    }
    if (!sent) await sock.sendMessage(gid, { text, mentions: [jid] }).catch(() => {});
    if (people.length > 1) await sleep(700);
  }
}
