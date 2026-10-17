import http from "http";
import { BOT_CONFIG } from "../config.js";

// ─── Self-ping HTTP server ────────────────────────────────────────────────────
// Keeps bot alive on hosting platforms that kill idle processes (Pterodactyl etc)
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const uptime  = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = `${d}d ${h}h ${m}m ${s}s`;

  const mem  = process.memoryUsage();
  const heap = (mem.heapUsed / 1024 / 1024).toFixed(1);

  if (req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("pong");
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    status:   "online",
    bot:      BOT_CONFIG.BOT_NAME || "PRINCE X UNKNOWN BOT",
    uptime:   uptimeStr,
    memory:   `${heap} MB`,
    version:  "v13",
    timestamp: new Date().toISOString()
  }, null, 2));
});

server.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});

server.on("error", (err) => {
  if (err.code !== "EADDRINUSE") console.log("Keep-alive server error:", err.message);
});

// ─── Self-ping every 4 minutes ────────────────────────────────────────────────
// Prevents hosting platforms from sleeping the process
setInterval(() => {
  http.get(`http://localhost:${PORT}/ping`, (res) => {
    // Silent self-ping
  }).on("error", () => {});
}, 4 * 60 * 1000);

// Bot-status text command lives in plugin/botstatus.js now — this file used
// to also register uptime/runtime/botstatus/status, which meant two plugins
// answered the same command at once.

