import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers
} from "baileys";
import P from "pino";
import fs from "fs";
import { BOT_CONFIG } from "../config.js";
import { listPluginFiles } from "../utils/pluginFiles.js";
import { findMember, isAdminMember } from "../utils/groupAdmin.js";
import { handleParticipantsUpdate } from "../utils/welcomeGuard.js";
import { handleAntiLink } from "../utils/linkGuard.js";
import { handleModMessage, handleModEvent } from "../utils/modEngine.js";

// ─── Shared plugin registry (stateless command handlers, loaded once) ────────
const plugins = [];
let pluginsLoaded = false;
async function loadPlugins() {
  if (pluginsLoaded) return plugins;
  pluginsLoaded = true;
  // Plugins are organised as plugin/<category>/<name>.js
  const files = listPluginFiles();
  for (const file of files) {
    try {
      const plugin = (await import(`../plugin/${file.rel}`)).default;
      if (plugin && Array.isArray(plugin.command)) {
        plugin.category = plugin.category || file.category;
        plugins.push(plugin);
        console.log(`✅ Loaded: ${file.category}/${file.name}`);
      }
    } catch (e) {
      console.log(`❌ Failed: ${file.category}/${file.name} — ${e.message}`);
    }
  }
  return plugins;
}

// ─── Active sessions registry (id -> session state) ──────────────────────────
// `id` is a stable key: the WhatsApp number for the owner session, or the
// Telegram user id for sessions paired through Telegram.
const sessions = new Map();

export async function ensurePluginsLoaded() {
  return loadPlugins();
}

export function listPluginCommands() {
  return plugins.map(p => p.command[0]).filter(Boolean).sort();
}

export function listSessions() {
  return [...sessions.values()].map(s => ({
    id: s.id,
    phoneNumber: s.botPhoneNumber || s.pairNumber,
    pushname: s.pushname || null,
    status: s.isConnected ? "online" : "offline",
    pairedAt: s.pairedAt,
    telegramUserId: s.telegramUserId || null,
    telegramUsername: s.telegramUsername || null
  }));
}

export function getSession(id) {
  return sessions.get(id);
}

function cleanNumber(jid) {
  if (!jid) return "";
  return jid.replace(/@.*/, "").replace(/:.*/, "").trim();
}

// Keeps the operator's own WhatsApp number from being echoed in plain text
// wherever a raw phone number would otherwise show up in the console.
function maskId(id) {
  if (!/^\d{6,}$/.test(id)) return id; // non-numeric ids (e.g. "tg-12345") pass through
  return "session";
}

/**
 * Start (or restart) a WhatsApp session.
 * opts:
 *   id               - stable session key (required)
 *   pairNumber       - phone number to pair (E.164 digits, no +) if not yet registered
 *   telegramUserId   - optional, links this session to a Telegram user
 *   telegramUsername - optional, for display in /sessions
 *   onPairingCode    - optional callback(code) fired when a pairing code is issued
 *   onOpen           - optional callback() fired when the session connects
 *   onClose          - optional callback(reason) fired on permanent disconnect (logged out)
 */
export async function startSession(opts) {
  const { id, pairNumber, telegramUserId, telegramUsername, onPairingCode, onOpen, onClose } = opts;
  await loadPlugins();

  const existing = sessions.get(id);
  const session = existing || {
    id,
    pairNumber,
    telegramUserId,
    telegramUsername,
    isConnected: false,
    reconnectAttempts: 0,
    botPhoneNumber: null,
    pushname: null,
    pairedAt: null,
    activeMode: "public",
    botSettings: {
      prefix: BOT_CONFIG.PREFIX || ".",
      anticall: false,
      autoread: false,
      autotype: false,
      autorecord: false,
      autoviewstatus: false,
      alwaysonline: false,
      autobio: false,
      autobioText: "",
      antidelete: false,
      autoblock: false,
      chatbot: false,
      autoreactstatus: false
    }
  };
  sessions.set(id, session);

  // ── Single-socket guard ────────────────────────────────────────────────
  // If a socket from a previous connect attempt is still alive when a
  // reconnect fires (e.g. the connection flaps quickly), both sockets end up
  // processing the same incoming messages — which is exactly what causes a
  // command like .menu to appear to answer twice. Tear down anything old
  // before creating the new socket, and make sure only one reconnect timer
  // is ever pending per session.
  if (session._reconnectTimer) {
    clearTimeout(session._reconnectTimer);
    session._reconnectTimer = null;
  }
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners();
      session.sock.end(new Error("superseded by new connection"));
    } catch {}
    session.sock = null;
  }

  const sessionDir = `sessions/${id}`;

  if (!existing) {
    try {
      const saved = JSON.parse(fs.readFileSync(`${sessionDir}/mode.json`, "utf8"));
      if (saved?.mode) session.activeMode = saved.mode;
    } catch {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: "silent" }))
    },
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    // macOS fingerprint avoids WhatsApp's current 405 rejection of some
    // WEB-browser fingerprints during new-device pairing.
    browser: Browsers.macOS("Chrome"),
    keepAliveIntervalMs: 15000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    maxMsgRetryCount: 5,
    getMessage: async () => ({ conversation: "" })
  });

  session.sock = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (session.sock !== sock) return; // stale socket, already superseded
    if (connection === "open") {
      session.isConnected = true;
      session.reconnectAttempts = 0;
      session.botPhoneNumber = cleanNumber(sock.user?.id || "");
      session.pushname = sock.user?.name || sock.user?.verifiedName || null;
      if (!session.pairedAt) session.pairedAt = Date.now();
      console.log(`✅ [${id}] Connected as: ${session.botPhoneNumber}`);
      if (session.botSettings.alwaysonline) sock.sendPresenceUpdate("available").catch(() => {});
      if (onOpen) onOpen(session);
    }

    if (connection === "close") {
      session.isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log(`🚫 [session ${maskId(id)}] Logged out.`);
        sessions.delete(id);
        if (onClose) onClose("logged_out");
        return;
      }
      // 440 means another WhatsApp Web connection replaced this one (e.g. the
      // same number was paired on two servers). Reconnecting immediately just
      // fights the other instance and can look abusive to WhatsApp — stop and
      // let the operator resolve the conflict deliberately.
      if (code === DisconnectReason.connectionReplaced || code === 440) {
        console.log(`⛔ [${id}] Replaced by another session (code 440). Stop the duplicate deployment, then restart this one.`);
        session.isConnected = false;
        session.status = "replaced";
        if (onClose) onClose("replaced");
        return;
      }
      session.reconnectAttempts++;
      const delay = Math.min(3000 * session.reconnectAttempts, 30000);
      console.log(`⚠️ [${id}] Disconnected (code: ${code}) — reconnecting in ${delay / 1000}s...`);
      session._reconnectTimer = setTimeout(() => startSession(opts), delay);
    }
  });

  // ── WS-level keepalive ping ──────────────────────────────────────────────
  // Baileys' own keepAliveIntervalMs covers the WhatsApp-protocol layer, but
  // on some hosts the underlying TCP/WebSocket connection can go idle behind
  // NAT/load balancers without either side noticing. A plain WS ping every
  // 20s keeps the pipe alive independently of that.
  if (session._wsPingTimer) clearInterval(session._wsPingTimer);
  session._wsPingTimer = setInterval(() => {
    try {
      if (sock?.ws?.readyState === 1 && typeof sock.ws.ping === "function") {
        sock.ws.ping();
      }
    } catch {}
  }, 20000);

  // ── Anti-call ─────────────────────────────────────────────────────────────
  sock.ev.on("call", async (calls) => {
    if (!session.botSettings.anticall) return;
    for (const call of calls) {
      if (call.status === "offer") {
        await sock.rejectCall(call.id, call.from).catch(() => {});
        await sock.sendMessage(call.from, { text: "❌ *CALL REJECTED*\nBot does not accept calls." }).catch(() => {});
      }
    }
  });

  // ── Group join / leave: welcome + goodbye messages ───────────────────────
  // (settings come from .welcome / .goodbye — see utils/welcomeGuard.js)
  sock.ev.on("group-participants.update", async ({ id: gid, participants, action, author }) => {
    try {
      await handleParticipantsUpdate({ sock, gid, participants, action });
    } catch (e) {
      console.error(`[${id}] Welcome/goodbye error:`, e.message);
    }
    try {
      await handleModEvent({ sock, gid, participants, action, author, botNumber: session.botPhoneNumber });
    } catch (e) {
      console.error(`[${id}] Group-protection error:`, e.message);
    }
  });

  // ── Auto-bio interval ─────────────────────────────────────────────────────
  if (!session._bioInterval) {
    session._bioInterval = setInterval(async () => {
      if (session.botSettings.autobio && session.botSettings.autobioText && session.isConnected) {
        const bio = session.botSettings.autobioText.replace("{time}", new Date().toLocaleString("en-GB"));
        await sock.updateProfileStatus(bio).catch(() => {});
      }
    }, 5 * 60 * 1000);
  }

  // ── Main message handler ──────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (session.sock !== sock) return; // stale socket, already superseded

    if (session.botSettings.autoviewstatus) {
      for (const m of messages) {
        if (m.key?.remoteJid === "status@broadcast") await sock.readMessages([m.key]).catch(() => {});
      }
    }

    const msg = messages[0];
    if (!msg?.message) return;
    const from = msg.key.remoteJid;
    if (!from) return;
    const isGroup = from.endsWith("@g.us");

    if (session.botSettings.autoread && !msg.key.fromMe) await sock.readMessages([msg.key]).catch(() => {});

    const senderJid = isGroup
      ? (msg.key.participant || msg.participant || from)
      : (msg.key.fromMe ? (session.botPhoneNumber + "@s.whatsapp.net") : from);
    const senderNumber = cleanNumber(senderJid);
    // WhatsApp can send a person as a hidden LID id; the "Alt" fields carry
    // their phone-number form, so owner checks work either way.
    const senderAltJid = (isGroup ? msg.key.participantAlt : msg.key.remoteJidAlt) || null;
    const senderAltNumber = cleanNumber(senderAltJid || "");
    const botLidNumber = cleanNumber(sock.user?.lid || "");
    const isOwner = !!msg.key.fromMe
      || BOT_CONFIG.OWNER.includes(senderNumber)
      || (senderAltNumber && BOT_CONFIG.OWNER.includes(senderAltNumber))
      || senderNumber === session.botPhoneNumber
      || (botLidNumber && senderNumber === botLidNumber);

    if (!msg.key.fromMe) {
      if (session.botSettings.autotype) {
        sock.sendPresenceUpdate("composing", from).catch(() => {});
        setTimeout(() => sock.sendPresenceUpdate("paused", from).catch(() => {}), 2000);
      }
      if (session.botSettings.autorecord) {
        sock.sendPresenceUpdate("recording", from).catch(() => {});
        setTimeout(() => sock.sendPresenceUpdate("paused", from).catch(() => {}), 2000);
      }
    }

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";
    if (!body) {
      // Pictures, videos, stickers etc. without a caption still need moderation filters.
      if (isGroup && !msg.key.fromMe) {
        try {
          await handleModMessage({ sock, msg, from, isOwner, senderJid, botNumber: session.botPhoneNumber, isBotCommand: false });
        } catch (e) {
          console.log(`[${id}] Mod filter error:`, e.message);
        }
      }
      return;
    }

    const prefix = session.botSettings.prefix || ".";
    let isCmd = false, cmd = "", usedPrefix = "";
    if (prefix && body.startsWith(prefix)) {
      isCmd = true; usedPrefix = prefix;
      cmd = body.substring(prefix.length).split(" ")[0].toLowerCase();
    }
    if (!isCmd && body.startsWith(".")) {
      isCmd = true; usedPrefix = ".";
      cmd = body.substring(1).split(" ")[0].toLowerCase();
    }

    // ── Moderation filters (see utils/modEngine.js): runs in every bot mode ──
    if (isGroup && !msg.key.fromMe) {
      try {
        const isBotCommand = isCmd && plugins.some(p => p.command.includes(cmd));
        if (await handleModMessage({
          sock, msg, from, isOwner, senderJid, botNumber: session.botPhoneNumber, isBotCommand
        })) return;
      } catch (e) {
        console.log(`[${id}] Mod filter error:`, e.message);
      }
    }

    if (session.activeMode === "private" && !isOwner) {
      const alwaysAllowed = ["ownercheck", "linkowner", "link", "myid"];
      if (!isCmd || !alwaysAllowed.includes(cmd)) return;
    }

    // ── Anti-link (settings come from .antilink — see utils/linkGuard.js) ──
    if (isGroup && !msg.key.fromMe && body) {
      try {
        const isBotCommand = isCmd && plugins.some(p => p.command.includes(cmd));
        await handleAntiLink({
          sock, msg, from, body, isOwner, senderJid,
          botNumber: session.botPhoneNumber, isBotCommand
        });
      } catch (e) {
        console.log(`[${id}] Anti-link error:`, e.message);
      }
    }

    // Opt-in hook: a plugin that defines onMessage() sees every text message
    // (used for activity counting). Plugins without it are not affected.
    for (const plugin of plugins) {
      if (typeof plugin.onMessage !== "function") continue;
      try {
        await plugin.onMessage({
          sock, msg, from, body, isGroup, isOwner,
          senderNumber, senderJid, botNumber: session.botPhoneNumber
        });
      } catch (e) {
        console.log(`[${id}] onMessage error: ${e.message}`);
      }
    }

    for (const plugin of plugins) {
      if (isCmd && plugin.command.includes(cmd)) {
        try {
          await plugin.run({
            sock, msg, from, body, cmd,
            isOwner, isGroup,
            senderNumber, senderJid,
            botNumber: session.botPhoneNumber,
            botMode: session.activeMode,
            setActiveMode: (mode) => {
              session.activeMode = mode;
              try { fs.writeFileSync(`${sessionDir}/mode.json`, JSON.stringify({ mode })); } catch {}
            },
            prefix: usedPrefix,
            botSettings: session.botSettings,
            deployedBy: session.telegramUsername ? `@${session.telegramUsername}` : null,
            saveSettings: () => {}
          });
        } catch (e) {
          console.log(`[${id}] Plugin error [${cmd}]: ${e.message}`);
        }
      }
    }
  });

  // ── Pairing ──────────────────────────────────────────────────────────────
  const numberToPair = pairNumber || session.pairNumber;
  if (!state.creds.registered && numberToPair) {
    const tryPair = async (attempt = 1) => {
      try {
        const code = await sock.requestPairingCode(numberToPair);
        console.log(`📲 [session ${maskId(id)}] PAIR CODE: ${code}`);
        if (onPairingCode) onPairingCode(code);
      } catch (e) {
        console.log(`[${id}] Pairing attempt ${attempt} failed: ${e.message}`);
        if (attempt < 5) setTimeout(() => tryPair(attempt + 1), 3000);
      }
    };
    setTimeout(() => tryPair(), 1500);
  }

  return session;
}

process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));
