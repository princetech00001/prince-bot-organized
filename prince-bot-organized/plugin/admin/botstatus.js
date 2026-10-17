import os from 'os';
import { BOT_CONFIG } from "../../config.js";
import { fancy } from "../../utils/fancyFont.js";

function getUptime() {
  const u = process.uptime();
  const d = Math.floor(u / 86400);
  const h = Math.floor((u % 86400) / 3600);
  const m = Math.floor((u % 3600) / 60);
  const s = Math.floor(u % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

export default {
  // This is now the ONLY plugin registering these — several other files used
  // to each claim a subset of these same names, so every one of them replied
  // at once. See ping.js/keepalive.js/utility.js for what was removed.
  command: ["ping", "uptime", "runtime", "alive", "speed", "botstatus", "system", "status"],

  async run({ sock, msg, from, botMode, deployedBy }) {
    const start = Date.now();
    const cpu = os.loadavg()[0].toFixed(2);

    // Real, correctly-scoped process memory — os.totalmem()/freemem() report
    // the HOST's memory in most containers, not what this process is
    // actually allowed to use, which made the old readout show ~99% full
    // even on a mostly-idle bot.
    const mem = process.memoryUsage();
    const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const rss = (mem.rss / 1024 / 1024).toFixed(1);
    const memPct = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(0);

    const uptime = getUptime();
    const platform = os.platform();
    const node = process.version;
    const ping = Date.now() - start;

    const bars = (pct, len = 10) => {
      const fill = Math.round((pct / 100) * len);
      return "█".repeat(Math.min(fill, len)) + "░".repeat(Math.max(len - fill, 0));
    };

    await sock.sendMessage(from, {
      text:
        `╭━━━〔 ⚡ ${fancy("BOT STATUS")} 〕━━━╮\n` +
        `┃\n` +
        `┃ 🤖 *${fancy("PRINCE X UNKNOWN BOT")}*\n` +
        `┃ ⭐👑 ${fancy("Owner")}      : ${fancy(BOT_CONFIG.OWNER_NAME || "Prince")}\n` +
        `┃ ⭐👑 ${fancy("Deployed By")} : ${fancy(deployedBy || BOT_CONFIG.OWNER_NAME || "Prince")}\n` +
        `┃ 🛡️ ${fancy("Mode")}  : ${fancy((botMode || "public").toUpperCase())}\n` +
        `┃\n` +
        `┃ 📡 *${fancy("PERFORMANCE")}*\n` +
        `┃ 🏓 ${fancy("Ping")}    : ${ping}ms ${ping < 500 ? "🟢 Fast" : ping < 1500 ? "🟡 Normal" : "🔴 Slow"}\n` +
        `┃ ⏳ ${fancy("Uptime")}  : ${uptime}\n` +
        `┃ 🖥️ ${fancy("CPU")}     : ${cpu} load\n` +
        `┃ 💾 ${fancy("Memory")}  : [${bars(memPct)}] ${memPct}%\n` +
        `┃    ${fancy("Heap")} ${heapUsed}MB / ${heapTotal}MB  •  RSS ${rss}MB\n` +
        `┃ 🔧 ${fancy("Node.js")} : ${node}\n` +
        `┃ 📡 ${fancy("Platform")}: ${platform}\n` +
        `┃\n` +
        `┃ 🌐 ${fancy("Keep-alive")}     : ${fancy("Active")} ✅\n` +
        `┃ 🔄 ${fancy("Auto-reconnect")} : ${fancy("Enabled")} ✅\n` +
        `┃\n` +
        `╰━━━〔 🚀 ${fancy("PRINCE TECH")} 〕━━━╯`
    }, { quoted: msg });
  }
};
