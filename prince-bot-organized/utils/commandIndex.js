// A list of every command, grouped by the plugin folder it lives in.
// Built from the plugin files (the modules are already loaded by the bot,
// so importing them again is instant).
import { listPluginFiles } from "./pluginFiles.js";

let cache = null;
let cacheAt = 0;

/** { category: [command names, sorted] } */
export async function getCommandIndex(maxAgeMs = 60000) {
  if (cache && Date.now() - cacheAt < maxAgeMs) return cache;
  const index = {};
  for (const f of listPluginFiles()) {
    try {
      const mod = (await import(`../plugin/${f.rel}`)).default;
      if (!mod || !Array.isArray(mod.command)) continue;
      (index[f.category] ||= new Set());
      for (const c of mod.command) index[f.category].add(String(c));
    } catch {}
  }
  cache = Object.fromEntries(Object.entries(index).map(([k, v]) => [k, [...v].sort()]));
  cacheAt = Date.now();
  return cache;
}
