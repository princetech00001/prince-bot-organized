import fs from "fs";
import path from "path";

// One persistent store for the group tools (welcome, goodbye, anti-link,
// warnings). Everything is saved in data/group-guard.json, so settings
// survive restarts and every command and event handler reads the same file.
const FILE = "./data/group-guard.json";
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { cache = {}; }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, FILE);       // atomic: never leaves a half-written file
  } catch (e) {
    console.log("[groupStore] could not save:", e.message);
  }
}

const defaults = () => ({
  welcome:   { enabled: false, text: null },
  goodbye:   { enabled: false, text: null },
  antilink:  { enabled: false, mode: "warn", allow: [] },   // mode: delete | warn | kick
  warnLimit: 3,
  warns:     {},                                            // memberKey -> { count, reasons[], last }
});

/** Settings for one group, always with every field filled in. */
export function getGroup(gid) {
  const g = load()[gid] || {};
  const d = defaults();
  return {
    ...d, ...g,
    welcome:  { ...d.welcome,  ...g.welcome },
    goodbye:  { ...d.goodbye,  ...g.goodbye },
    antilink: { ...d.antilink, ...g.antilink, allow: [...(g.antilink?.allow || [])] },
    warns:    { ...(g.warns || {}) },
  };
}

/** Change a group's settings: updateGroup(gid, g => { g.welcome.enabled = true }) */
export function updateGroup(gid, mutate) {
  const all = load();
  const g = getGroup(gid);
  mutate(g);
  all[gid] = g;
  save();
  return g;
}

export function getWarnCount(gid, key) {
  return getGroup(gid).warns[key]?.count || 0;
}

/** Add one warning and return the new total. */
export function addWarn(gid, key, reason) {
  let total = 0;
  updateGroup(gid, g => {
    const w = g.warns[key] || { count: 0, reasons: [] };
    w.count += 1;
    w.reasons = [...(w.reasons || []), String(reason || "No reason").slice(0, 80)].slice(-5);
    w.last = Date.now();
    g.warns[key] = w;
    total = w.count;
  });
  return total;
}

export function resetWarns(gid, key) {
  updateGroup(gid, g => { delete g.warns[key]; });
}
