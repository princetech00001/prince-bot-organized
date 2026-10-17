import fs from "fs";
import path from "path";

// Plugins live in plugin/<category>/<name>.js. This helper is the single
// place that knows how to find them, so the loader, .listplugins,
// .getplugin and the .ai* tools all agree.
export const PLUGIN_DIR = "./plugin";

/**
 * Every plugin file under plugin/, any folder depth, sorted by file name
 * (the same order the old flat plugin folder was loaded in).
 * Files named disabled-*.js are skipped unless includeDisabled is true.
 */
export function listPluginFiles(dir = PLUGIN_DIR, { includeDisabled = false } = {}) {
  const out = [];
  const walk = (folder, category) => {
    let entries = [];
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !entry.name.startsWith("_")) walk(full, entry.name);
      } else if (entry.name.endsWith(".js")) {
        if (!includeDisabled && entry.name.startsWith("disabled-")) continue;
        out.push({
          name: entry.name,                                  // advanced.js
          base: entry.name.replace(/\.js$/, ""),             // advanced
          category: category || "uncategorized",             // utility
          rel: path.relative(dir, full).split(path.sep).join("/"), // utility/advanced.js
          full,                                              // ./plugin/utility/advanced.js
        });
      }
    }
  };
  walk(dir, "");
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Find one plugin by "name", "name.js" or "category/name".
 * Exact match first, then a partial match. Pass { disabled: true } to look
 * for a file that was disabled with .aidisable.
 */
export function findPluginFile(query, { disabled = false } = {}) {
  const q = String(query || "").trim().toLowerCase().replace(/\.js$/, "");
  if (!q) return null;
  const files = listPluginFiles(PLUGIN_DIR, { includeDisabled: disabled });
  const wanted = disabled ? `disabled-${q.split("/").pop()}` : q;
  const exact = files.find(f =>
    f.base.toLowerCase() === wanted.split("/").pop() &&
    (!wanted.includes("/") || `${f.category}/${f.base}`.toLowerCase() === wanted));
  if (exact) return exact;
  if (disabled) return null;
  return files.find(f => f.base.toLowerCase().includes(q)) || null;
}
