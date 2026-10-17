// Moderation settings + log for each group. Lives inside the same file as the
// other group settings (data/group-guard.json, key "mod"), so it survives
// restarts and every command / event handler reads the same data.
import { getGroup, updateGroup } from "./groupStore.js";
import { idSet } from "./groupAdmin.js";

const LOG_CAP = 300;
const HISTORY_CAP = 600;

export const defaultMod = () => ({
  antichannel: { enabled: false, action: "delete" },
  antimention: { enabled: false, action: "delete", limit: 5 },
  antipicture: { enabled: false, action: "delete" },
  antivideo:   { enabled: false, action: "delete" },
  mediaonly:   { enabled: false },
  textonly:    { enabled: false },
  capslock:    { enabled: false, action: "delete", percent: 70, minLetters: 10 },
  flood:       { enabled: false, action: "warn", messages: 6, seconds: 8 },
  profanity:   { enabled: false, action: "delete", words: [] },
  restrict:    { enabled: false, allow: [] },       // allow: [{ key, ids[] }]
  jailed:      {},                                  // key -> { ids[], jid, by, reason, at }
  linkAllowed: [],                                  // [{ key, ids[] }] members exempt from anti-link
  antijoin:    { enabled: false },
  antiraid:    { enabled: false, joins: 5, seconds: 30, locked: false },
  antihijack:  { enabled: false },
  guard:       { enabled: false, seconds: 60 },
  introcard:   { enabled: false, prompt: null },
  history:     {},                                  // key -> { first, joins, leaves, lastJoin, lastLeave, jid }
  log:         [],                                  // newest last
});

function merge(d, s) {
  const out = {};
  for (const k of Object.keys(d)) {
    const dv = d[k], sv = s?.[k];
    if (Array.isArray(dv)) out[k] = Array.isArray(sv) ? [...sv] : [...dv];
    else if (k === "jailed" || k === "history") out[k] = { ...(sv || {}) };
    else if (dv && typeof dv === "object") {
      out[k] = { ...dv, ...(sv && typeof sv === "object" ? sv : {}) };
      for (const kk of Object.keys(dv)) {
        if (Array.isArray(dv[kk])) out[k][kk] = Array.isArray(sv?.[kk]) ? [...sv[kk]] : [...dv[kk]];
      }
    } else out[k] = sv ?? dv;
  }
  return out;
}

/** Moderation settings for one group, always with every field filled in. */
export function getMod(gid) {
  return merge(defaultMod(), getGroup(gid).mod);
}

/** Change moderation settings: updateMod(gid, m => { m.antichannel.enabled = true }) */
export function updateMod(gid, mutate) {
  let result;
  updateGroup(gid, g => {
    const m = merge(defaultMod(), g.mod);
    mutate(m);
    g.mod = m;
    result = m;
  });
  return result;
}

/**
 * Add a line to the moderation log.
 * type: "action" (a rule was enforced) | "admin" (promote / demote) | "join" | "leave"
 */
export function logEvent(gid, entry) {
  updateMod(gid, m => {
    m.log.push({ t: Date.now(), ...entry });
    if (m.log.length > LOG_CAP) m.log.splice(0, m.log.length - LOG_CAP);
  });
}

/** Remember joins / leaves per member (for .memberhistory). `jids` = every id the person is known by. */
export function recordHistory(gid, jids, kind) {
  const list = [].concat(jids).filter(Boolean);
  if (!list.length) return;
  const ids = [...idSet(...list)];
  updateMod(gid, m => {
    let key = Object.keys(m.history).find(k => (m.history[k].ids || []).some(i => ids.includes(i)));
    if (!key) key = ids[0];
    const h = (m.history[key] ||= { first: Date.now(), joins: 0, leaves: 0, ids: [] });
    h.ids = [...new Set([...(h.ids || []), ...ids])];
    h.jid = list[0];
    if (kind === "join") { h.joins++; h.lastJoin = Date.now(); }
    if (kind === "leave") { h.leaves++; h.lastLeave = Date.now(); }
    const keys = Object.keys(m.history);
    if (keys.length > HISTORY_CAP) {
      keys.sort((a, b) => (m.history[a].first || 0) - (m.history[b].first || 0));
      for (const k of keys.slice(0, keys.length - HISTORY_CAP)) delete m.history[k];
    }
  });
}

/** Find a member's history entry by any of their ids. */
export function findHistory(mod, ...jids) {
  const want = idSet(...jids);
  return Object.values(mod.history).find(h => (h.ids || []).some(i => want.has(i))) || null;
}
