// ─────────────────────────────────────────────────────────────────────────────
//  MOD GUARD — group protection settings and reports (original code).
//
//  Filters   : .antichannel .antimention .antipicture .antivideo .mediaonly
//              .textonly .capslock .profanity .floodlimit .mentionlimit
//  Members   : .jail .unjail .restrict .linkallow .linkpolicy .warnconfig
//  Reports   : .modlog .adminlog .modreport .memberhistory .permissionaudit
//
//  The filters themselves run in utils/modEngine.js on every group message.
//  Admins, the bot owner and the bot are never filtered.
// ─────────────────────────────────────────────────────────────────────────────
import { getGroup, updateGroup } from "../../utils/groupStore.js";
import { getMod, updateMod, findHistory } from "../../utils/modStore.js";
import { getMeta, forgetMeta } from "../../utils/modEngine.js";
import {
  findMember, isAdminMember, memberIdSet, memberKey, numberOf, targetFromMessage, getGroupContext,
} from "../../utils/groupAdmin.js";

const FILTERS = {
  antichannel: { title: "Anti-Channel", icon: "📢", about: "deletes WhatsApp Channel links and forwarded channel posts", actions: true },
  antimention: { title: "Anti-Mention", icon: "🏷️", about: "stops mass mentions such as @everyone or tagging many people", actions: true },
  antipicture: { title: "Anti-Picture", icon: "🖼️", about: "deletes pictures sent by members", actions: true },
  antivideo:   { title: "Anti-Video",   icon: "🎞️", about: "deletes videos sent by members", actions: true },
  capslock:    { title: "Caps-Lock filter", icon: "🔠", about: "deletes messages written in ALL CAPS", actions: true },
  profanity:   { title: "Word filter",  icon: "🤬", about: "deletes messages with banned words", actions: true },
  mediaonly:   { title: "Media-only mode", icon: "📷", about: "plain text messages are deleted; photos, videos, voice notes etc. are fine", actions: false },
  textonly:    { title: "Text-only mode",  icon: "💬", about: "anything that isn't text (photos, videos, stickers, voice notes) is deleted", actions: false },
};
const ALIAS = {
  antichannel: "antichannel", nochannel: "antichannel", nochannels: "antichannel", channelguard: "antichannel",
  antimention: "antimention", antigroupmention: "antimention", agm: "antimention", notagall: "antimention", antigmention: "antimention", antitag: "antimention", nomentions: "antimention",
  antipicture: "antipicture", antivideo: "antivideo", capslock: "capslock", profanity: "profanity",
  mediaonly: "mediaonly", textonly: "textonly",
};
const ACTIONS = ["delete", "warn", "kick"];
const OFF = ["off", "disable", "stop", "no"];

const TZ_DEFAULT = process.env.BOT_TIMEZONE || "Africa/Lagos";
async function tzOf(gid) {
  try { return (await import("../group/groupplus.js")).__internals.G(gid).tz || TZ_DEFAULT; } catch { return TZ_DEFAULT; }
}
const stamp = (t, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));

export default {
  command: [
    ...Object.keys(ALIAS), "floodlimit", "mentionlimit",
    "linkpolicy", "linkallow", "allowlink", "linkwhitelist",
    "restrict", "jail", "unjail", "warnconfig",
    "modlog", "adminlog", "modreport", "moderationreport", "modstats", "moderationstats",
    "memberhistory", "permissionaudit",
  ],

  async run({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber }) {
    const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });
    if (!isGroup) return reply("⚠️ This command only works inside a group.");

    const args = body.trim().split(/\s+/).slice(1);
    const a0 = (args[0] || "").toLowerCase();
    let ctx;
    try { ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }); }
    catch { return reply("❌ I couldn't read this group's info. Try again in a moment."); }
    const { senderIsAdmin, botIsAdmin, participants } = ctx;
    const needAdmin = () => reply("🚫 *Admins only.* Only group admins can use this command.");
    const tag = (jid) => `@${numberOf(jid)}`;
    const mod = getMod(from);
    const warnBotAdmin = botIsAdmin ? "" : "\n\n⚠️ I'm not a group admin yet, so I can't delete messages. Make me admin.";

    // ══ ON / OFF FILTERS ═════════════════════════════════════════════════════
    const filter = ALIAS[cmd];
    if (filter) {
      const F = FILTERS[filter];
      const cur = mod[filter];

      if (filter === "profanity" && ["add", "del", "remove", "list", "clear"].includes(a0)) {
        if (!senderIsAdmin) return needAdmin();
        if (a0 === "list") return reply(cur.words.length ? `🤬 *Banned words (${cur.words.length})*\n${cur.words.join(", ")}` : "No banned words yet. Add some: .profanity add word1 word2");
        if (a0 === "clear") { updateMod(from, m => { m.profanity.words = []; }); return reply("🗑️ Word list cleared."); }
        const words = args.slice(1).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(w => w.length >= 2);
        if (!words.length) return reply(`Give the word(s): .profanity ${a0} word1 word2`);
        updateMod(from, m => {
          const set = new Set(m.profanity.words);
          for (const w of words) a0 === "add" ? set.add(w) : set.delete(w);
          m.profanity.words = [...set].slice(0, 200);
        });
        return reply(a0 === "add" ? `✅ Added ${words.length} word(s). The filter is *${cur.enabled ? "ON" : "OFF"}*.${cur.enabled ? "" : "\nTurn it on: .profanity on"}` : `✅ Removed ${words.length} word(s).`);
      }

      if (!a0) {
        const lines = [`${F.icon} *${F.title}* — ${cur.enabled ? "ON ✅" : "OFF ❌"}`, F.about];
        if (F.actions) lines.push(`Action: *${cur.action}*`);
        if (filter === "antimention") lines.push(`Blocks tagging ${cur.limit}+ people (change: .mentionlimit 8)`);
        if (filter === "capslock") lines.push(`Triggers at ${cur.percent}% capitals, ${cur.minLetters}+ letters`);
        if (filter === "profanity") lines.push(`Words: ${cur.words.length} (.profanity add | del | list)`);
        lines.push("", `Use: .${cmd} on | off${F.actions ? " | delete | warn | kick" : ""}${filter === "capslock" ? " | <percent>" : ""}`);
        return reply(lines.join("\n") + (cur.enabled ? warnBotAdmin : ""));
      }
      if (!senderIsAdmin) return needAdmin();

      let note = "";
      if (OFF.includes(a0)) updateMod(from, m => { m[filter].enabled = false; });
      else if (a0 === "on" || a0 === "enable") updateMod(from, m => { m[filter].enabled = true; });
      else if (ACTIONS.includes(a0) && F.actions) updateMod(from, m => { m[filter].enabled = true; m[filter].action = a0; });
      else if (filter === "capslock" && /^\d{2,3}$/.test(a0) && +a0 >= 50 && +a0 <= 100) updateMod(from, m => { m.capslock.enabled = true; m.capslock.percent = +a0; });
      else return reply(`I didn't understand that. Use: .${cmd} on | off${F.actions ? " | delete | warn | kick" : ""}`);

      if ((a0 === "on" || ACTIONS.includes(a0) || /^\d+$/.test(a0)) && filter === "mediaonly") { updateMod(from, m => { m.textonly.enabled = false; }); note = "\n(Text-only mode was turned off — the two can't run together.)"; }
      if ((a0 === "on" || ACTIONS.includes(a0)) && filter === "textonly") { updateMod(from, m => { m.mediaonly.enabled = false; }); note = "\n(Media-only mode was turned off — the two can't run together.)"; }
      if (filter === "profanity" && !getMod(from).profanity.words.length && !OFF.includes(a0)) note += "\nThe word list is empty. Add words: .profanity add word1 word2";
      const now = getMod(from)[filter];
      return reply(`${F.icon} *${F.title}* is now *${now.enabled ? "ON ✅" : "OFF ❌"}*${F.actions && now.enabled ? ` (action: ${now.action})` : ""}${note}${now.enabled ? warnBotAdmin : ""}`);
    }

    // ══ LIMITS ═══════════════════════════════════════════════════════════════
    if (cmd === "mentionlimit") {
      if (!a0) return reply(`🏷️ Tagging *${mod.antimention.limit}* or more people at once counts as a mass mention.\nChange it: .mentionlimit 8`);
      if (!senderIsAdmin) return needAdmin();
      const n = parseInt(a0, 10);
      if (!n || n < 2 || n > 50) return reply("❌ Pick a number from 2 to 50.");
      updateMod(from, m => { m.antimention.limit = n; });
      return reply(`✅ Mass-mention limit set to *${n}*. ${mod.antimention.enabled ? "" : "\nTurn the filter on: .antimention on"}`);
    }
    if (cmd === "floodlimit") {
      const f = mod.flood;
      if (!a0) return reply(`🌊 *Flood protection* — ${f.enabled ? "ON ✅" : "OFF ❌"}\n${f.messages} messages in ${f.seconds} seconds triggers it. Action: *${f.action}*\n\nUse: .floodlimit 6 8   (messages seconds)\n.floodlimit on | off | delete | warn | kick`);
      if (!senderIsAdmin) return needAdmin();
      if (OFF.includes(a0)) { updateMod(from, m => { m.flood.enabled = false; }); return reply("🌊 Flood protection is now *OFF*."); }
      if (a0 === "on") { updateMod(from, m => { m.flood.enabled = true; }); return reply(`🌊 Flood protection is now *ON* (${f.messages} messages in ${f.seconds}s).${warnBotAdmin}`); }
      if (ACTIONS.includes(a0)) { updateMod(from, m => { m.flood.enabled = true; m.flood.action = a0; }); return reply(`🌊 Flood protection *ON*, action: *${a0}*.${warnBotAdmin}`); }
      const n = parseInt(args[0], 10), s = parseInt(args[1] || String(f.seconds), 10);
      if (!n || n < 3 || n > 30 || !s || s < 3 || s > 60) return reply("❌ Use: .floodlimit <messages 3-30> <seconds 3-60>\nExample: .floodlimit 6 8");
      updateMod(from, m => { m.flood.enabled = true; m.flood.messages = n; m.flood.seconds = s; });
      return reply(`🌊 Flood protection *ON*: ${n} messages in ${s} seconds. Action: *${f.action}*.${warnBotAdmin}`);
    }
    if (cmd === "warnconfig") {
      const g = getGroup(from);
      if (!a0) return reply(`⚠️ Members are removed after *${g.warnLimit}* warnings.\nChange it (admins): .warnconfig 5`);
      if (!senderIsAdmin) return needAdmin();
      const n = parseInt(a0, 10);
      if (!n || n < 2 || n > 20) return reply("❌ Pick a number from 2 to 20.");
      updateGroup(from, x => { x.warnLimit = n; });
      return reply(`✅ Members are now removed after *${n}* warnings.`);
    }

    // ══ LINKS ════════════════════════════════════════════════════════════════
    if (cmd === "linkpolicy") {
      const al = getGroup(from).antilink;
      if (!a0) {
        return reply(`🔗 *LINK POLICY*\nAnti-link: *${al.enabled ? "ON ✅" : "OFF ❌"}* (action: ${al.mode})\nAllowed websites: ${al.allow.length ? al.allow.join(", ") : "none"}\nMembers allowed to post links: ${mod.linkAllowed.length}\n\n.linkpolicy on | off | delete | warn | kick\n.linkpolicy allow youtube.com\n.linkpolicy disallow youtube.com\nMember exceptions: .linkallow @member`);
      }
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "allow" || a0 === "disallow") {
        const host = (args[1] || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return reply(`Give a website: .linkpolicy ${a0} youtube.com`);
        updateGroup(from, x => { const s = new Set(x.antilink.allow); a0 === "allow" ? s.add(host) : s.delete(host); x.antilink.allow = [...s]; });
        return reply(a0 === "allow" ? `✅ Links to *${host}* are now allowed.` : `✅ Links to *${host}* are blocked again.`);
      }
      if (OFF.includes(a0)) updateGroup(from, x => { x.antilink.enabled = false; });
      else if (a0 === "on") updateGroup(from, x => { x.antilink.enabled = true; });
      else if (ACTIONS.includes(a0)) updateGroup(from, x => { x.antilink.enabled = true; x.antilink.mode = a0; });
      else return reply("Use: .linkpolicy on | off | delete | warn | kick | allow <site> | disallow <site>");
      const now = getGroup(from).antilink;
      return reply(`🔗 Anti-link is now *${now.enabled ? "ON ✅" : "OFF ❌"}* (action: ${now.mode}).${now.enabled ? warnBotAdmin : ""}`);
    }

    if (["linkallow", "allowlink", "linkwhitelist"].includes(cmd)) {
      if (a0 === "list" || !a0 && !targetFromMessage(msg, args)) {
        const list = mod.linkAllowed;
        return reply(list.length ? `🔗 *Members allowed to post links*\n${list.map(e => "• " + tag(e.jid)).join("\n")}` : "No member exceptions yet.\nAllow one: .linkallow @member", { mentions: list.map(e => e.jid) });
      }
      if (!senderIsAdmin) return needAdmin();
      const target = targetFromMessage(msg, args);
      const member = target ? findMember(participants, target) : null;
      if (!member) return reply("Tag the member or reply to their message:\n.linkallow @member");
      const ids = [...memberIdSet(member)];
      const exists = mod.linkAllowed.some(e => e.ids.some(i => ids.includes(i)));
      if (a0 === "remove" || a0 === "del" || exists) {
        updateMod(from, m => { m.linkAllowed = m.linkAllowed.filter(e => !e.ids.some(i => ids.includes(i))); });
        return reply(`🔗 ${tag(member.id)} can no longer post links.`, { mentions: [member.id] });
      }
      updateMod(from, m => { m.linkAllowed.push({ key: memberKey(member), ids, jid: member.id }); });
      return reply(`🔗 ${tag(member.id)} may now post links, even with anti-link on.`, { mentions: [member.id] });
    }

    // ══ RESTRICTED MODE ══════════════════════════════════════════════════════
    if (cmd === "restrict") {
      const r = mod.restrict;
      if (!a0 || a0 === "status") return reply(`🔒 *Restricted mode* — ${r.enabled ? "ON ✅" : "OFF ❌"}\nOnly admins and approved members can chat while it's on.\nApproved members: ${r.allow.length}\n\n.restrict on | off\n.restrict allow @member\n.restrict disallow @member\n.restrict list`);
      if (a0 === "list") return reply(r.allow.length ? `🔒 *Approved members*\n${r.allow.map(e => "• " + tag(e.jid)).join("\n")}` : "No approved members yet.", { mentions: r.allow.map(e => e.jid) });
      if (!senderIsAdmin) return needAdmin();
      if (a0 === "on") { updateMod(from, m => { m.restrict.enabled = true; }); return reply(`🔒 Restricted mode is *ON*. Only admins and approved members can chat.${warnBotAdmin}`); }
      if (OFF.includes(a0)) { updateMod(from, m => { m.restrict.enabled = false; }); return reply("🔓 Restricted mode is *OFF*. Everyone can chat."); }
      if (a0 === "allow" || a0 === "disallow") {
        const target = targetFromMessage(msg, args.slice(1));
        const member = target ? findMember(participants, target) : null;
        if (!member) return reply(`Tag the member or reply to their message:\n.restrict ${a0} @member`);
        const ids = [...memberIdSet(member)];
        updateMod(from, m => {
          m.restrict.allow = m.restrict.allow.filter(e => !e.ids.some(i => ids.includes(i)));
          if (a0 === "allow") m.restrict.allow.push({ key: memberKey(member), ids, jid: member.id });
        });
        return reply(a0 === "allow" ? `✅ ${tag(member.id)} can chat in restricted mode.` : `✅ ${tag(member.id)} was removed from the approved list.`, { mentions: [member.id] });
      }
      return reply("Use: .restrict on | off | allow @member | disallow @member | list");
    }

    // ══ JAIL ═════════════════════════════════════════════════════════════════
    if (cmd === "jail" || cmd === "unjail") {
      const jailed = Object.values(mod.jailed);
      if (cmd === "jail" && !a0 && !targetFromMessage(msg, args)) {
        return reply(jailed.length ? `⛓️ *JAILED MEMBERS*\n${jailed.map(j => `• ${tag(j.jid)} — ${j.reason}`).join("\n")}\n\nRelease: .unjail @member` : "⛓️ Nobody is jailed.\nJail someone: .jail @member reason", { mentions: jailed.map(j => j.jid) });
      }
      if (!senderIsAdmin) return needAdmin();
      if (cmd === "unjail" && (a0 === "all")) { updateMod(from, m => { m.jailed = {}; }); return reply(`🔓 Released everyone (${jailed.length}).`); }
      const target = targetFromMessage(msg, args);
      const member = target ? findMember(participants, target) : null;
      if (!member) return reply(`Tag the member or reply to their message:\n.${cmd} @member`);
      const ids = [...memberIdSet(member)];
      if (cmd === "unjail") {
        const had = jailed.some(j => j.ids.some(i => ids.includes(i)));
        updateMod(from, m => { for (const [k, j] of Object.entries(m.jailed)) if (j.ids.some(i => ids.includes(i))) delete m.jailed[k]; });
        return reply(had ? `🔓 ${tag(member.id)} is free to talk again.` : `${tag(member.id)} wasn't jailed.`, { mentions: [member.id] });
      }
      if (isAdminMember(member)) return reply("🚫 Admins can't be jailed.");
      if (findMember([member], sock.user?.id, sock.user?.lid)) return reply("🙂 I can't jail myself.");
      const reason = args.filter(a => !a.startsWith("@") && !/^\+?\d{7,15}$/.test(a)).join(" ").trim().slice(0, 60) || "no reason given";
      updateMod(from, m => { m.jailed[memberKey(member)] = { ids, jid: member.id, by: numberOf(senderJid), reason, at: Date.now() }; });
      return reply(`⛓️ ${tag(member.id)} is *jailed*. Every message they send will be deleted until an admin runs .unjail.\nReason: ${reason}${warnBotAdmin}`, { mentions: [member.id] });
    }

    // ══ LOGS & REPORTS (admins) ══════════════════════════════════════════════
    if (["modlog", "adminlog", "modreport", "moderationreport", "modstats", "moderationstats", "memberhistory", "permissionaudit"].includes(cmd)) {
      if (!senderIsAdmin) return needAdmin();
      const tz = await tzOf(from);

      if (cmd === "modlog") {
        const rows = mod.log.filter(e => e.type === "action").slice(-15).reverse();
        if (!rows.length) return reply("📋 *MOD LOG*\n\nNothing has been enforced yet.");
        return reply(`📋 *MOD LOG* (last ${rows.length})\n\n${rows.map(e => `• ${stamp(e.t, tz)} — *${e.filter}*${e.jid ? " " + tag(e.jid) : ""} → ${e.action}${e.reason && e.filter !== "jail" ? ` (${e.reason})` : ""}`).join("\n")}`, { mentions: rows.map(e => e.jid).filter(Boolean) });
      }
      if (cmd === "adminlog") {
        const rows = mod.log.filter(e => e.type === "admin" || e.filter === "antihijack").slice(-15).reverse();
        if (!rows.length) return reply("👑 *ADMIN LOG*\n\nNo admin changes recorded yet. I only record changes that happen while I'm in the group.");
        return reply(`👑 *ADMIN LOG* (last ${rows.length})\n\n${rows.map(e => e.type === "admin"
          ? `• ${stamp(e.t, tz)} — ${e.action} ${e.targets.map(n => "@" + n).join(" ")}${e.by ? " by @" + e.by : ""}`
          : `• ${stamp(e.t, tz)} — ${e.reason}`).join("\n")}`, { mentions: rows.flatMap(e => [...(e.targets || []), e.by].filter(Boolean)).map(n => `${n}@s.whatsapp.net`) });
      }
      if (cmd === "memberhistory") {
        const target = targetFromMessage(msg, args);
        const member = target ? findMember(participants, target) : null;
        if (!member) return reply("Tag the member or reply to their message:\n.memberhistory @member");
        const h = findHistory(mod, ...memberIdSet(member));
        const warns = getGroup(from).warns[memberKey(member)]?.count || 0;
        const jailedNow = Object.values(mod.jailed).some(j => j.ids.some(i => memberIdSet(member).has(i)));
        let activity = null;
        try { const gp = (await import("../group/groupplus.js")).__internals.G(from); for (const id of memberIdSet(member)) if (gp.activity?.[id]) { activity = gp.activity[id]; break; } } catch {}
        const lines = [
          `👤 *MEMBER HISTORY* ${tag(member.id)}`,
          `Role: ${member.admin === "superadmin" ? "group creator" : isAdminMember(member) ? "admin" : "member"}`,
          h ? `First seen by me: ${stamp(h.first, tz)}` : "First seen by me: before I started recording",
          h ? `Joined ${h.joins} time(s) · left ${h.leaves} time(s)${h.lastLeave ? ` · last left ${stamp(h.lastLeave, tz)}` : ""}` : "Joins / leaves: no record yet",
          `Warnings: ${warns}/${getGroup(from).warnLimit}${jailedNow ? " · ⛓️ jailed" : ""}`,
          activity ? `Messages counted: ${activity.n} · last seen chatting ${stamp(activity.last, tz)}` : "Messages counted: none yet",
        ];
        return reply(lines.join("\n"), { mentions: [member.id] });
      }
      if (cmd === "permissionaudit") {
        forgetMeta(from);
        const meta = await getMeta(sock, from, 0);
        const parts = meta.participants || [];
        const admins = parts.filter(isAdminMember);
        const on = (b) => (b ? "✅" : "⚠️");
        const guards = ["antichannel", "antimention", "capslock", "flood", "profanity"].filter(k => mod[k].enabled);
        const lines = [
          `🔍 *PERMISSION AUDIT* — ${meta.subject}`,
          "",
          `${on(botIsAdmin)} I am ${botIsAdmin ? "" : "NOT "}a group admin${botIsAdmin ? "" : " — filters can't work"}`,
          `👥 Members: ${parts.length} · admins: ${admins.length} (${Math.round(100 * admins.length / Math.max(1, parts.length))}%)`,
          `${on(admins.length <= Math.max(3, parts.length * 0.1))} ${admins.length <= Math.max(3, parts.length * 0.1) ? "Admin count looks reasonable" : "Many admins — more people can change the group"}`,
          `${meta.announce ? "🔒" : "🔓"} Sending messages: ${meta.announce ? "admins only" : "everyone"}`,
          `${meta.restrict ? "🔒" : "🔓"} Editing group info: ${meta.restrict ? "admins only" : "everyone"}`,
          `${on(meta.joinApprovalMode)} Join approval: ${meta.joinApprovalMode ? "on" : "off"}`,
          `${meta.memberAddMode === "all_member_add" ? "⚠️" : "✅"} Adding members: ${meta.memberAddMode === "all_member_add" ? "any member can add" : "admins only"}`,
          `${on(getGroup(from).antilink.enabled)} Anti-link: ${getGroup(from).antilink.enabled ? "on" : "off"}`,
          `${on(guards.length > 0)} Content filters on: ${guards.length ? guards.join(", ") : "none"}`,
          `${on(mod.antihijack.enabled)} Admin protection: ${mod.antihijack.enabled ? "on" : "off"}   ${on(mod.antiraid.enabled)} Anti-raid: ${mod.antiraid.enabled ? "on" : "off"}`,
        ];
        const tips = [];
        if (!botIsAdmin) tips.push("Make me an admin so protections can work.");
        if (!getGroup(from).antilink.enabled) tips.push("Turn on anti-link: .antilink on");
        if (!mod.antiraid.enabled) tips.push("Turn on raid protection: .antiraid on");
        if (!mod.antihijack.enabled) tips.push("Protect your admins: .antihijack on");
        return reply(lines.join("\n") + (tips.length ? `\n\n*Suggestions*\n${tips.map(t => "• " + t).join("\n")}` : "\n\n✅ Looks well protected."));
      }
      // modreport
      const since = Date.now() - 7 * 86400000;
      const rows = mod.log.filter(e => e.t >= since);
      const acts = rows.filter(e => e.type === "action");
      const byFilter = {};
      for (const e of acts) byFilter[e.filter] = (byFilter[e.filter] || 0) + 1;
      const offenders = {};
      for (const e of acts) if (e.jid) offenders[e.jid] = (offenders[e.jid] || 0) + 1;
      const top = Object.entries(offenders).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const joins = rows.filter(e => e.type === "join" && !e.detail).length, leaves = rows.filter(e => e.type === "leave").length;
      return reply(
        `📊 *MODERATION REPORT — last 7 days*\n_${meta0(ctx)}_\n\n` +
        `🛡️ Actions taken: *${acts.length}*\n` +
        (Object.keys(byFilter).length ? Object.entries(byFilter).sort((a, b) => b[1] - a[1]).map(([k, n]) => `   • ${k}: ${n}`).join("\n") + "\n" : "") +
        `👋 Joined: *${joins}* · left: *${leaves}*\n` +
        `⚠️ Active warnings: *${Object.keys(getGroup(from).warns).length}* · jailed: *${Object.keys(mod.jailed).length}*\n` +
        (top.length ? `\n*Most flagged*\n${top.map(([j, n]) => `• ${tag(j)} — ${n}`).join("\n")}` : "\nNo repeat offenders. 🎉"),
        { mentions: top.map(([j]) => j) }
      );
    }
  },
};

const meta0 = (ctx) => ctx.meta?.subject || "this group";
