// Group identity + admin helpers.
//
// WhatsApp (Baileys 7) can describe the same person in two ways:
//   - a phone id   : 2349012345678@s.whatsapp.net
//   - a hidden LID : 123456789012345@lid
// A group member entry may carry both (p.id, p.lid, p.phoneNumber), and the
// bot's own id (sock.user) can be either too. Comparing only phone numbers
// makes the bot fail to find itself in the member list and wrongly report
// "bot must be admin". These helpers compare EVERY id a person has.

const userPart = (jid) => String(jid || "").split("@")[0].split(":")[0].trim();

// 2340xxxxxxxxx (extra 0 after the country code) -> 234xxxxxxxxx
const variants = (u) => (/^2340/.test(u) ? [u, u.replace(/^2340/, "234")] : [u]);

/** Set of normalised id numbers for any mix of jids / numbers. */
export function idSet(...jids) {
  const out = new Set();
  for (const j of jids.flat()) {
    const u = userPart(j);
    if (u) variants(u).forEach(v => out.add(v));
  }
  return out;
}

/** All ids one group member is known by. */
export function memberIdSet(p) {
  return idSet(p?.id, p?.lid, p?.phoneNumber, p?.jid);
}

/** Find a group member by any of the given jids / numbers. */
export function findMember(participants, ...jids) {
  const want = idSet(...jids);
  if (!want.size) return undefined;
  return (participants || []).find(p => {
    for (const v of memberIdSet(p)) if (want.has(v)) return true;
    return false;
  });
}

/** True only for a real admin / super admin (a missing member is NOT admin). */
export function isAdminMember(p) {
  return !!p && (p.admin === "admin" || p.admin === "superadmin" || p.isAdmin === true || p.isSuperAdmin === true);
}

/** Every id the bot itself is known by. */
export function botJids(sock, botNumber) {
  return [sock?.user?.id, sock?.user?.lid, botNumber];
}

/** Every id the message sender is known by (phone form + LID form). */
export function senderJids(msg, senderJid) {
  return [senderJid, msg?.key?.participant, msg?.key?.participantAlt, msg?.participant];
}

/** Is this jid the bot itself? */
export function isSelf(sock, ...jids) {
  const me = idSet(sock?.user?.id, sock?.user?.lid);
  for (const v of idSet(...jids)) if (me.has(v)) return true;
  return false;
}

/** Stable key for a group member (phone number when known, else their id). */
export function memberKey(p) {
  return userPart(p?.phoneNumber) || userPart(p?.id);
}

/** Display digits for a jid (what goes after the @ in a mention). */
export function numberOf(jid) {
  return userPart(jid);
}

/** Who a command points at: the tagged person, the replied-to person, or a typed number. */
export function targetFromMessage(msg, args = []) {
  const c = msg?.message?.extendedTextMessage?.contextInfo || {};
  const tagged = c.mentionedJid?.[0] || c.participant;
  if (tagged) return tagged;
  const typed = args.find(a => /^\+?\d{7,15}$/.test(a));
  return typed ? `${typed.replace(/^\+/, "")}@s.whatsapp.net` : null;
}

/** Everything a group command needs to know about who is admin. */
export async function getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }) {
  const meta = await sock.groupMetadata(from);
  const participants = meta.participants || [];
  const botMember = findMember(participants, ...botJids(sock, botNumber));
  const senderMember = findMember(participants, ...senderJids(msg, senderJid));
  return {
    meta, participants, botMember, senderMember,
    botIsAdmin: isAdminMember(botMember),
    senderIsAdmin: isAdminMember(senderMember) || !!isOwner,
  };
}
