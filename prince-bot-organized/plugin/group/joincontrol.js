// ─────────────────────────────────────────────────────────────────────────────
//  JOIN CONTROL — who gets in and who can change admins (original code).
//
//  .antijoin      pause new joins (new members are removed)
//  .antiraid      lock the group when many people join at once
//  .guard         new members must send a code within N seconds
//  .joinapproval  turn WhatsApp's own "approve new members" on / off
//  .approve       approve or reject pending join requests
//  .antihijack    undo promotions / demotions made by the wrong people
//  .introcard     intro prompt for new members + .intro to post a card
//  .setwelcomemsg / .setgoodbyemsg   custom welcome / goodbye texts
//
//  The automatic parts run in utils/modEngine.js on group events.
// ─────────────────────────────────────────────────────────────────────────────
import { getGroup, updateGroup } from "../../utils/groupStore.js";
import { getMod, updateMod, findHistory } from "../../utils/modStore.js";
import { lockdown, unlock, getMeta, forgetMeta, pendingGuardCount } from "../../utils/modEngine.js";
import { fillTemplate, DEFAULT_WELCOME, DEFAULT_GOODBYE } from "../../utils/welcomeGuard.js";
import { isAdminMember, numberOf, getGroupContext, memberIdSet } from "../../utils/groupAdmin.js";

const OFF = ["off", "disable", "stop", "no"];
const DEFAULT_PROMPT = "👋 Hi {user}! Tell us about yourself in *{group}*:\n*.intro Name | Age | From | About you*";

export default {
  command: [
    "antijoin", "antiraid", "guard", "joinapproval", "approve", "antihijack", "adminguard",
    "introcard", "intro", "introset",
    "setwelcomemsg", "customwelcome", "setgoodbyemsg", "customgoodbye",
  ],

  async run({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber }) {
    const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
    if (!isGroup) return reply("⚠️ This command only works inside a group.");

    const args = body.trim().split(/\s+/).slice(1);
    const a0 = (args[0] || "").toLowerCase();
    const rest = body.trim().split(/\s+/).slice(1).join(" ").trim();
    let ctx;
    try { ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }); }
    catch { return reply("❌ I couldn't read this group's info. Try again in a moment."); }
    const { senderIsAdmin, botIsAdmin } = ctx;
    const needAdmin = () => reply("🚫 *Admins only.* Only group admins can use this command.");
    const needBot = () => reply("⚠️ I need to be a group admin for that. Please make me admin first.");
    const mod = getMod(from);
    const onOff = (b) => (b ? "ON ✅" : "OFF ❌");

    // ══ ANTI-JOIN ════════════════════════════════════════════════════════════
    if (cmd === "antijoin") {
      if (!a0 || a0 === "status") return reply(`⏸️ *Anti-Join* — ${onOff(mod.antijoin.enabled)}\nWhile it's ON, new members who join on their own (or are added by non-admins) are removed. Admins can still add people.\n\n.antijoin on | off\n\n_It works when WhatsApp tells me who added the member._`);
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "on") { updateMod(from, m => { m.antijoin.enabled = true; }); return reply(`⏸️ *Anti-Join is ON.* New joins will be removed.${botIsAdmin ? "" : "\n\n⚠️ I'm not an admin yet, so I can't remove anyone."}`); }
      if (OFF.includes(a0)) { updateMod(from, m => { m.antijoin.enabled = false; }); return reply("▶️ *Anti-Join is OFF.* People can join again."); }
      return reply("Use: .antijoin on | off");
    }

    // ══ ANTI-RAID ════════════════════════════════════════════════════════════
    if (cmd === "antiraid") {
      const r = mod.antiraid;
      if (!a0 || a0 === "status") return reply(`🚨 *Anti-Raid* — ${onOff(r.enabled)}${r.locked ? "  🔒 LOCKED" : ""}\nLocks the group when *${r.joins}* people join within *${r.seconds}* seconds.\n\n.antiraid on | off\n.antiraid 5 30   (joins seconds)\n.antiraid unlock\n.antiraid purge`);
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "on") { updateMod(from, m => { m.antiraid.enabled = true; }); return reply(`🚨 *Anti-Raid is ON.* I'll lock the group if ${r.joins}+ people join within ${r.seconds}s.${botIsAdmin ? "" : "\n\n⚠️ I'm not an admin yet, so I can't lock the group."}`); }
      if (OFF.includes(a0)) { updateMod(from, m => { m.antiraid.enabled = false; }); return reply("🚨 *Anti-Raid is OFF.*"); }
      if (a0 === "unlock") {
        if (!botIsAdmin) return needBot();
        await unlock(sock, from);
        return reply("🔓 *Group unlocked.* Everyone can send messages again and join approval is off.");
      }
      if (a0 === "lock") {
        if (!botIsAdmin) return needBot();
        await lockdown(sock, from);
        return reply("🔒 *Group locked.* Only admins can send; new members need approval. Reopen with .antiraid unlock");
      }
      if (a0 === "purge") {
        if (!botIsAdmin) return needBot();
        const cutoff = Date.now() - 10 * 60 * 1000;
        const recent = ctx.participants.filter(p => {
          if (isAdminMember(p)) return false;
          const h = findHistory(mod, ...memberIdSet(p));
          return !!h?.lastJoin && h.lastJoin >= cutoff;
        });
        if (!recent.length) return reply("🧹 Nobody joined in the last 10 minutes (that I saw).");
        if ((args[1] || "").toLowerCase() !== "yes") return reply(`🧹 This removes *${recent.length}* member(s) who joined in the last 10 minutes:\n${recent.slice(0, 15).map(p => "• @" + numberOf(p.id)).join("\n")}\n\nTo go ahead: *.antiraid purge yes*`, { mentions: recent.slice(0, 15).map(p => p.id) });
        let n = 0;
        for (const p of recent) { try { await sock.groupParticipantsUpdate(from, [p.id], "remove"); n++; } catch {} await new Promise(r2 => setTimeout(r2, 400)); }
        return reply(`🧹 Removed *${n}* of ${recent.length} new joiners.`);
      }
      const joins = parseInt(args[0], 10), seconds = parseInt(args[1], 10);
      if (!joins || !seconds || joins < 3 || joins > 100 || seconds < 5 || seconds > 600) return reply("❌ Use: .antiraid <joins 3-100> <seconds 5-600>\nExample: .antiraid 5 30");
      updateMod(from, m => { m.antiraid.enabled = true; m.antiraid.joins = joins; m.antiraid.seconds = seconds; });
      return reply(`🚨 *Anti-Raid is ON:* lock the group if ${joins} people join within ${seconds} seconds.`);
    }

    // ══ GUARD (join verification) ════════════════════════════════════════════
    if (cmd === "guard") {
      const g = mod.guard;
      if (!a0 || a0 === "status") return reply(`🛡️ *Join Guard* — ${onOff(g.enabled)}\nNew members get a 4-digit code and must send it within *${g.seconds}* seconds, or they're removed.\nWaiting for verification now: ${pendingGuardCount(from)}\n\n.guard on | off\n.guard 90   (seconds, 20-300)`);
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "on") { updateMod(from, m => { m.guard.enabled = true; }); return reply(`🛡️ *Join Guard is ON* (${g.seconds}s).${botIsAdmin ? "" : "\n\n⚠️ I'm not an admin yet, so I can't remove anyone who fails."}`); }
      if (OFF.includes(a0)) { updateMod(from, m => { m.guard.enabled = false; }); return reply("🛡️ *Join Guard is OFF.*"); }
      const s = parseInt(a0, 10);
      if (!s || s < 20 || s > 300) return reply("❌ Pick seconds from 20 to 300, or use .guard on / off.");
      updateMod(from, m => { m.guard.enabled = true; m.guard.seconds = s; });
      return reply(`🛡️ *Join Guard is ON:* new members have *${s}* seconds to send their code.`);
    }

    // ══ JOIN APPROVAL (WhatsApp's own setting) + APPROVE ═════════════════════
    if (cmd === "joinapproval") {
      forgetMeta(from);
      const meta = await getMeta(sock, from, 0);
      const now = !!meta.joinApprovalMode;
      if (!a0 || a0 === "status") return reply(`📝 *Join approval* — ${onOff(now)}\nWhen ON, people who use the invite link must wait for an admin to approve them.\n\n.joinapproval on | off\nSee requests: .approve`);
      if (!senderIsAdmin) return needAdmin();
      if (!botIsAdmin) return needBot();
      const want = a0 === "on" ? "on" : OFF.includes(a0) ? "off" : null;
      if (!want) return reply("Use: .joinapproval on | off");
      try { await sock.groupJoinApprovalMode(from, want); forgetMeta(from); }
      catch (e) { return reply(`❌ WhatsApp refused: ${e.message}`); }
      return reply(`📝 Join approval is now *${want === "on" ? "ON ✅" : "OFF ❌"}*.`);
    }

    if (cmd === "approve") {
      if (!senderIsAdmin) return needAdmin();
      if (!botIsAdmin) return needBot();
      let list;
      try { list = await sock.groupRequestParticipantsList(from); }
      catch (e) { return reply(`❌ I couldn't read the join requests: ${e.message}`); }
      if (!list?.length) return reply("📝 No pending join requests.");
      const reject = a0 === "reject";
      const picks = (reject ? args.slice(1) : args).map(a => a.toLowerCase());
      if (!picks.length) {
        return reply(`📝 *JOIN REQUESTS (${list.length})*\n\n${list.slice(0, 25).map((r, i) => `*${i + 1}.* +${numberOf(r.phone_number || r.jid)}`).join("\n")}\n\nApprove: *.approve all* · *.approve 1 3*\nReject: *.approve reject all* · *.approve reject 2*`);
      }
      let chosen;
      if (picks[0] === "all") chosen = list;
      else {
        chosen = picks.map(p => (/^\d{1,3}$/.test(p) ? list[+p - 1] : list.find(r => numberOf(r.phone_number || r.jid) === p.replace(/^\+/, "")))).filter(Boolean);
      }
      if (!chosen.length) return reply("❌ I couldn't match that. Use the numbers from the list: .approve 1 3");
      try { await sock.groupRequestParticipantsUpdate(from, chosen.map(r => r.jid), reject ? "reject" : "approve"); }
      catch (e) { return reply(`❌ WhatsApp refused: ${e.message}`); }
      return reply(`${reject ? "🚫 Rejected" : "✅ Approved"} *${chosen.length}* request(s).`);
    }

    // ══ ANTI-HIJACK ══════════════════════════════════════════════════════════
    if (cmd === "antihijack" || cmd === "adminguard") {
      if (!a0 || a0 === "status") return reply(`🛡️ *Admin protection* — ${onOff(mod.antihijack.enabled)}\nOnly the group creator and the bot owner may promote or demote admins. If anyone else does, I undo it.\n\n.antihijack on | off\n\n_Needs me to be an admin, and WhatsApp must tell me who made the change._`);
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "on") { updateMod(from, m => { m.antihijack.enabled = true; }); return reply(`🛡️ *Admin protection is ON.*${botIsAdmin ? "" : "\n\n⚠️ I'm not an admin yet, so I can't undo anything."}`); }
      if (OFF.includes(a0)) { updateMod(from, m => { m.antihijack.enabled = false; }); return reply("🛡️ *Admin protection is OFF.*"); }
      return reply("Use: .antihijack on | off");
    }

    // ══ INTRO CARD ═══════════════════════════════════════════════════════════
    if (cmd === "introset" || (cmd === "introcard" && a0 === "prompt")) {
      if (!senderIsAdmin) return needAdmin();
      const text = cmd === "introset" ? rest : args.slice(1).join(" ").trim();
      if (!text) return reply(`📝 Current prompt:\n${mod.introcard.prompt || DEFAULT_PROMPT}\n\nChange it: .introset <text>   (use {user} and {group})\nReset: .introset reset`);
      if (text.toLowerCase() === "reset") { updateMod(from, m => { m.introcard.prompt = null; }); return reply("✅ Intro prompt reset to the default."); }
      updateMod(from, m => { m.introcard.prompt = text.slice(0, 500); });
      return reply(`✅ Intro prompt saved.${mod.introcard.enabled ? "" : "\nTurn it on: .introcard on"}`);
    }
    if (cmd === "introcard") {
      if (!a0 || a0 === "status") return reply(`🪪 *Intro card* — ${onOff(mod.introcard.enabled)}\nNew members get a prompt asking them to introduce themselves.\nThey reply with: *.intro Name | Age | From | About you*\n\n.introcard on | off\n.introset <prompt text>`);
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "on") { updateMod(from, m => { m.introcard.enabled = true; }); return reply("🪪 *Intro card is ON.* New members will be asked to introduce themselves."); }
      if (OFF.includes(a0)) { updateMod(from, m => { m.introcard.enabled = false; }); return reply("🪪 *Intro card is OFF.*"); }
      return reply("Use: .introcard on | off");
    }
    if (cmd === "intro") {
      const parts = rest.split("|").map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return reply("Introduce yourself like this:\n*.intro Name | Age | From | About you*\nExample: .intro Prince | 22 | Lagos | I love coding");
      const [name, age, place, about] = parts.length >= 4 ? parts : [parts[0], parts[1], parts[2] || "-", parts[3] || "-"];
      const who = msg.key.participant || senderJid;
      const card =
        `╭─────────────────────╮\n   🪪 *MEMBER INTRO*\n╰─────────────────────╯\n` +
        `👤 *Name:* ${name.slice(0, 40)}\n🎂 *Age:* ${age.slice(0, 10)}\n📍 *From:* ${place.slice(0, 40)}\n💬 *About:* ${(about || "-").slice(0, 160)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n@${numberOf(who)} · ${ctx.meta?.subject || "this group"}`;
      try {
        const url = await sock.profilePictureUrl(who, "image");
        if (url) return sock.sendMessage(from, { image: { url }, caption: card, mentions: [who] }, { quoted: msg });
      } catch {}
      return reply(card, { mentions: [who] });
    }

    // ══ CUSTOM WELCOME / GOODBYE TEXT ════════════════════════════════════════
    if (["setwelcomemsg", "customwelcome", "setgoodbyemsg", "customgoodbye"].includes(cmd)) {
      const isWelcome = cmd === "setwelcomemsg" || cmd === "customwelcome";
      const key = isWelcome ? "welcome" : "goodbye";
      const cur = getGroup(from)[key];
      const sample = (t) => fillTemplate(t, { jid: msg.key.participant || senderJid, group: ctx.meta?.subject || "this group", count: ctx.participants.length });
      if (!rest) {
        return reply(`${isWelcome ? "👋" : "🚪"} *${isWelcome ? "Welcome" : "Goodbye"} message* — ${cur.enabled ? "ON ✅" : "OFF ❌"}\n\n${sample(cur.text || (isWelcome ? DEFAULT_WELCOME : DEFAULT_GOODBYE))}\n\nChange it: .${cmd} <text>\nUse {user} {group} {count}\nReset: .${cmd} reset\nTurn on/off: .${key} on | off`, { mentions: [msg.key.participant || senderJid] });
      }
      if (!senderIsAdmin) return needAdmin();
      if (rest.toLowerCase() === "reset") { updateGroup(from, g => { g[key].text = null; }); return reply("✅ Reset to the default message."); }
      updateGroup(from, g => { g[key].text = rest.slice(0, 700); });
      return reply(`✅ Saved. Preview:\n\n${sample(rest)}${cur.enabled ? "" : `\n\n⚠️ It's currently OFF. Turn it on: .${key} on`}`, { mentions: [msg.key.participant || senderJid] });
    }
  },
};
