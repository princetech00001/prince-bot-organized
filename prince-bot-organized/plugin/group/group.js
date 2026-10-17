import fs from 'fs';
import { BOT_CONFIG } from "../../config.js";
import { findMember, isAdminMember, botJids, senderJids } from "../../utils/groupAdmin.js";
import { getGroup as getGuard } from "../../utils/groupStore.js";

const GSTORE = './group-settings.json';

function loadGStore() {
  try { if (fs.existsSync(GSTORE)) return JSON.parse(fs.readFileSync(GSTORE, 'utf8')); } catch {}
  return {};
}
function saveGStore(d) { fs.writeFileSync(GSTORE, JSON.stringify(d, null, 2)); }
function getG(gid, key, def = null) { return loadGStore()?.[gid]?.[key] ?? def; }
function setG(gid, key, val) {
  const d = loadGStore();
  if (!d[gid]) d[gid] = {};
  d[gid][key] = val;
  saveGStore(d);
}
function cleanNum(jid) {
  if (!jid) return "";
  return String(jid).replace(/@.*/, "").replace(/:.*/, "").replace(/^2340?/, "234").trim();
}
function fmt(text) { return text.trim(); }

export default {
  command: [
    "group","groupinfo","groupstats","groupsettings",
    "open","close",
    "mute","unmute","muteall","unmuteall",
    "setname","setdesc","settopic","topic",
    "link","grouplink","invitelink","resetlink","revoke",
    "setrules","rules","clearrules",
    "lockgroup","unlockgroup","onlyadmin","everyone",
    "exportmembers","maxmembers","totalmembers",
    "tagall","hidetag","tagadmin",
    "add","kick",
    "promote","demote","makeadmin","removeadmin",
    "ban","unban","softban",
    "adminlist","listadmin","admincheck",
    "deletemsg","del","delete",
    "poll",
    "antibot","antibadword",
    "creategc","creategroup",
    "botadmin","pinmsg","slowmode"
  ],

  async run({ sock, msg, from, cmd, body, isOwner, isGroup, senderJid, botNumber }) {
    const reply = (text, mentions = []) =>
      sock.sendMessage(from, { text: fmt(text), mentions }, { quoted: msg });

    if (!isGroup) {
      return reply(
        "╔══════════════════════════════════════╗\n" +
        "║  ❌  GROUP-ONLY COMMAND              ║\n" +
        "╠══════════════════════════════════════╣\n" +
        "║  This command only works inside a  ║\n" +
        "║  WhatsApp group.                   ║\n" +
        "╚══════════════════════════════════════╝"
      );
    }

    const args = body.trim().split(/\s+/).slice(1);
    const text = args.join(" ").trim();

    let meta;
    try { meta = await sock.groupMetadata(from); }
    catch {
      return reply("❌ Could not fetch group info. Please try again.");
    }

    const participants = meta.participants || [];
    const groupName = meta.subject || "Unknown Group";
    const totalMembers = participants.length;
    const admins = participants.filter(p => p.admin);

    // ── Bot admin detection (proven logic from original group.js) ─────────────
    const botNum = cleanNum(botNumber || BOT_CONFIG?.OWNER?.[0] || "");
    // Matches by phone id AND hidden LID id, so it works in every group.
    const botP = findMember(participants, ...botJids(sock, botNum));
    const botIsAdmin = isAdminMember(botP);
    const isBotOwner = isOwner || cleanNum(senderJid) === botNum;

    // ── Context (mentions / quoted) ───────────────────────────────────────────
    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
    const target = ctx.mentionedJid?.[0] || ctx.participant || null;

    // ── Sender admin check ────────────────────────────────────────────────────
    const senderP = findMember(participants, ...senderJids(msg, senderJid));
    const senderIsAdmin = isAdminMember(senderP) || isOwner;

    // ── Permission gates ──────────────────────────────────────────────────────
    const needsBotAdmin = [
      "open","close","mute","unmute","muteall","unmuteall",
      "setname","setdesc","lockgroup","unlockgroup","onlyadmin",
      "link","grouplink","invitelink","resetlink","revoke",
      "add","kick","kickall","promote","demote","makeadmin",
      "removeadmin","ban","softban","deletemsg","del","delete","pinmsg"
    ];
    const needsSenderAdmin = [
      "open","close","mute","unmute","muteall","unmuteall",
      "setname","setdesc","settopic","lockgroup","unlockgroup",
      "onlyadmin","everyone","link","grouplink","invitelink",
      "resetlink","revoke","setrules","clearrules","setgreeting",
      "cleargreeting","setbye","clearbye","add","kick","kickall",
      "promote","demote","makeadmin","removeadmin","ban","softban",
      "deletemsg","del","delete","tagall","hidetag","warn",
      "clearwarn","exportmembers","antibot","antilink","antibadword","welcome","pinmsg"
    ];

    if (needsBotAdmin.includes(cmd) && !botIsAdmin && !isBotOwner) {
      return reply(
        "╔══════════════════════════════════════╗\n" +
        "║  ⚠️  BOT NEEDS ADMIN RIGHTS         ║\n" +
        "╠══════════════════════════════════════╣\n" +
        "║  Make the bot a group admin first.  ║\n" +
        "║  Settings → Group info → Make admin ║\n" +
        "╚══════════════════════════════════════╝"
      );
    }

    if (needsSenderAdmin.includes(cmd) && !senderIsAdmin) {
      return reply(
        "╔══════════════════════════════════════╗\n" +
        "║  🚫  ADMIN ONLY COMMAND             ║\n" +
        "╠══════════════════════════════════════╣\n" +
        "║  Only group admins can use this.    ║\n" +
        "╚══════════════════════════════════════╝"
      );
    }

    // helper to build box cards cleanly
    const B = "║";
    const TL="╔", TR="╗", BL="╚", BR="╝", MH="═".repeat(38), ML="╠"+"═".repeat(38)+"╣";
    const box = (title, lines, footer="") => {
      let out = TL+MH+TR+"\n"+B+"  "+title.padEnd(36)+B+"\n"+ML+"\n";
      for (const l of lines) out += B+"  "+l+"\n";
      out += BL+MH+BR;
      if (footer) out += "\n\n"+footer;
      return out;
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  BOT ADMIN STATUS
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "botadmin") {
      return reply(box("🤖  BOT ADMIN STATUS", [
        "Bot Number : "+botNum,
        "Found      : "+(botP ? "✅ Yes" : "❌ No"),
        "Is Admin   : "+(botIsAdmin ? "✅ Yes" : "❌ No — make bot admin")
      ]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GROUP INFO
    // ─────────────────────────────────────────────────────────────────────────
    if (["group","groupinfo","groupstats"].includes(cmd)) {
      const created = meta.creation
        ? new Date(meta.creation * 1000).toLocaleDateString("en-GB", {day:"2-digit",month:"short",year:"numeric"})
        : "Unknown";
      const desc = meta.desc ? meta.desc.substring(0,70)+(meta.desc.length>70?"...":"") : "None";
      return reply(box("📊  GROUP INFO", [
        "📌 Name    : "+groupName,
        "📅 Created : "+created,
        "👥 Members : "+totalMembers,
        "👑 Admins  : "+admins.length,
        "🔇 Muted   : "+(meta.announce?"Yes (admins only)":"No"),
        "🔒 Locked  : "+(meta.restrict?"Yes":"No"),
        "🤖 Bot     : "+(botIsAdmin?"✅ Admin":"❌ Not admin"),
        "",
        "📝 Desc: "+desc
      ]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GROUP SETTINGS SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "groupsettings") {
      const guard = getGuard(from);
      return reply(box("⚙️  GROUP SETTINGS", [
        "👋 Welcome    : "+(guard.welcome.enabled?"✅ ON":"❌ OFF"),
        "🔗 Anti-link  : "+(guard.antilink.enabled?"✅ ON ("+guard.antilink.mode+")":"❌ OFF"),
        "🤖 Anti-bot   : "+(getG(from,"antibot",false)?"✅ ON":"❌ OFF"),
        "🤬 Anti-bad   : "+(getG(from,"antibadword",false)?"✅ ON":"❌ OFF"),
        "📜 Rules set  : "+(getG(from,"rules")?"✅ Yes":"❌ No"),
        "📌 Topic      : "+(getG(from,"topic")?"✅ Set":"❌ None")
      ]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  OPEN / CLOSE
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "open" || cmd === "close") {
      await sock.groupSettingUpdate(from, cmd==="close" ? "announcement" : "not_announcement");
      return reply(cmd==="close"
        ? box("🔒  GROUP CLOSED",["Only admins can send messages now."])
        : box("🔓  GROUP OPENED",["All members can send messages now."])
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MUTE / UNMUTE
    // ─────────────────────────────────────────────────────────────────────────
    if (["mute","unmute","muteall","unmuteall"].includes(cmd)) {
      const muting = cmd==="mute"||cmd==="muteall";
      await sock.groupSettingUpdate(from, muting ? "announcement" : "not_announcement");
      return reply(muting
        ? box("🔇  GROUP MUTED",["Only admins can now send messages."])
        : box("🔊  GROUP UNMUTED",["All members can now send messages."])
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LOCK / UNLOCK
    // ─────────────────────────────────────────────────────────────────────────
    if (["lockgroup","onlyadmin"].includes(cmd)) {
      await sock.groupSettingUpdate(from, "locked");
      return reply(box("🔒  GROUP LOCKED",["Only admins can edit group info."]));
    }
    if (["unlockgroup","everyone"].includes(cmd)) {
      await sock.groupSettingUpdate(from, "unlocked");
      return reply(box("🔓  GROUP UNLOCKED",["All members can edit group info."]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SET NAME / DESC / TOPIC
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "setname") {
      if (!text) return reply("❌ Provide a name!\nExample: *.setname Prince Squad 👑*");
      await sock.groupUpdateSubject(from, text);
      return reply(box("✏️  GROUP NAME UPDATED",["New Name: "+text]));
    }

    if (cmd === "setdesc") {
      if (!text) return reply("❌ Provide a description!\nExample: *.setdesc Welcome to our group!*");
      await sock.groupUpdateDescription(from, text);
      return reply(box("📝  DESCRIPTION UPDATED",[text.substring(0,70)]));
    }

    if (["settopic","topic"].includes(cmd)) {
      if (!text) {
        const t = getG(from,"topic");
        return reply(t ? box("📌  GROUP TOPIC",[t]) : "❌ No topic set. Use *.settopic <text>*");
      }
      setG(from,"topic",text);
      return reply("✅ *Topic updated!*\n\n📌 "+text);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INVITE LINK
    // ─────────────────────────────────────────────────────────────────────────
    if (["link","grouplink","invitelink"].includes(cmd)) {
      const code = await sock.groupInviteCode(from);
      return reply(box("🔗  GROUP INVITE LINK",[
        "https://chat.whatsapp.com/"+code,
        "",
        "⚠️ Share only with trusted people!"
      ]));
    }

    if (["resetlink","revoke"].includes(cmd)) {
      await sock.groupRevokeInvite(from);
      return reply(box("🔄  INVITE LINK RESET",[
        "The old link is now invalid.",
        "Generate a new one with *.link*"
      ]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  RULES
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "setrules") {
      if (!text) return reply("❌ Usage: *.setrules 1. No spam\n2. Respect all members*");
      setG(from,"rules",text);
      return reply(box("📜  RULES SAVED",["Type *.rules* for anyone to view them."]));
    }
    if (cmd === "rules") {
      const r = getG(from,"rules");
      if (!r) return reply("❌ No rules set.\nAdmins: use *.setrules* to set them.");
      return reply(box("📜  GROUP RULES — "+groupName.substring(0,20),r.split("\n").map(l=>"  "+l),"⚠️ Please follow the rules to stay in the group."));
    }
    if (cmd === "clearrules") {
      setG(from,"rules",null);
      return reply("✅ *Group rules cleared.*");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ADMIN LIST
    // ─────────────────────────────────────────────────────────────────────────
    if (["adminlist","listadmin","admincheck"].includes(cmd)) {
      if (admins.length===0) return reply("❌ No admins found.");
      const lines = admins.map((a,i)=>`${i+1}. @${cleanNum(a.id)} ${a.admin==="superadmin"?"👑":"⭐"}`);
      return sock.sendMessage(from, {
        text: fmt(box("👑  ADMIN LIST — "+groupName.substring(0,18), [...lines,"","Total: "+admins.length+" admin(s)"]) ),
        mentions: admins.map(a=>a.id)
      }, { quoted: msg });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MEMBER COUNTS
    // ─────────────────────────────────────────────────────────────────────────
    if (["totalmembers","maxmembers"].includes(cmd)) {
      return reply(box("👥  MEMBER COUNT",[
        "Total Members : "+totalMembers,
        "Admins        : "+admins.length,
        "Regular       : "+(totalMembers-admins.length),
        "Capacity      : "+totalMembers+"/1024"
      ]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXPORT MEMBERS
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "exportmembers") {
      const list = participants.map((p,i)=>`${i+1}. +${cleanNum(p.id)}${p.admin?" ⭐":""}`).join("\n");
      return reply(box("📋  MEMBER LIST — "+groupName.substring(0,18),[list,"","Total: "+totalMembers+" members"]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  TAG COMMANDS
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "tagall") {
      const members = participants.map(p=>p.id);
      return sock.sendMessage(from, {
        text: fmt(text || "📢 *Attention "+groupName+"!*\n\nAll members have been tagged."),
        mentions: members
      }, { quoted: msg });
    }
    if (cmd === "hidetag") {
      return sock.sendMessage(from, {
        text: fmt(text || "📢 Hidden announcement."),
        mentions: participants.map(p=>p.id)
      }, { quoted: msg });
    }
    if (cmd === "tagadmin") {
      const adminIds = admins.map(a=>a.id);
      return sock.sendMessage(from, {
        text: fmt("👑 *Admins of "+groupName+"*\n\n"+adminIds.map(id=>"@"+cleanNum(id)).join("\n")),
        mentions: adminIds
      }, { quoted: msg });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ADD / KICK / KICKALL
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "add") {
      if (!text) return reply("❌ Provide a number!\nExample: *.add 2349033168045*");
      const num = text.replace(/[^0-9]/g,"")+"@s.whatsapp.net";
      const result = await sock.groupParticipantsUpdate(from,[num],"add").catch(e=>e);
      const status = result?.[0]?.status||result?.status;
      if (!status||status==="200") return reply(box("✅  MEMBER ADDED",["Number: +"+text.replace(/[^0-9]/g,""),"Successfully added to the group!"]));
      if (status==="403") return reply("❌ +"+text+" has privacy settings that block group adds.");
      if (status==="408") return reply("❌ +"+text+" is not on WhatsApp.");
      return reply("⚠️ Could not add. Status: "+status);
    }

    if (cmd === "kick") {
      if (!target) return reply("❌ Tag or reply to someone to kick!\nExample: *.kick @user*");
      await sock.groupParticipantsUpdate(from,[target],"remove");
      return sock.sendMessage(from, {
        text: fmt(box("👢  MEMBER KICKED",[
          "@"+cleanNum(target)+" has been removed",
          "from "+groupName+"."
        ])),
        mentions: [target]
      }, { quoted: msg });
    }

    if (cmd === "kickall") {
      if (!isOwner) return reply("❌ Owner only command.");
      const toKick = participants.filter(p=>!p.admin&&p.id!==botP?.id);
      if (!toKick.length) return reply("❌ No non-admin members to kick.");
      await reply(box("⚠️  KICKALL INITIATED",["Removing "+toKick.length+" non-admin members..."]));
      let kicked=0;
      for (const p of toKick) {
        await sock.groupParticipantsUpdate(from,[p.id],"remove").catch(()=>{});
        kicked++;
        await new Promise(r=>setTimeout(r,600));
      }
      return reply("✅ Done! Kicked "+kicked+" member(s).");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PROMOTE / DEMOTE
    // ─────────────────────────────────────────────────────────────────────────
    if (["promote","makeadmin"].includes(cmd)) {
      if (!target) return reply("❌ Tag someone to promote!\nExample: *.promote @user*");
      await sock.groupParticipantsUpdate(from,[target],"promote");
      return sock.sendMessage(from, {
        text: fmt(box("⬆️  MEMBER PROMOTED",["@"+cleanNum(target)+" is now a group admin! 👑"])),
        mentions: [target]
      }, { quoted: msg });
    }
    if (["demote","removeadmin"].includes(cmd)) {
      if (!target) return reply("❌ Tag someone to demote!\nExample: *.demote @user*");
      await sock.groupParticipantsUpdate(from,[target],"demote");
      return sock.sendMessage(from, {
        text: fmt(box("⬇️  ADMIN DEMOTED",["@"+cleanNum(target)+" is no longer an admin."])),
        mentions: [target]
      }, { quoted: msg });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  BAN / UNBAN / SOFTBAN
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "ban") {
      if (!target) return reply("❌ Tag someone to ban!\nExample: *.ban @user*");
      let bl = getG(from,"banlist")||[];
      if (!bl.includes(target)) bl.push(target);
      setG(from,"banlist",bl);
      await sock.groupParticipantsUpdate(from,[target],"remove");
      return sock.sendMessage(from, {
        text: fmt(box("🚫  MEMBER BANNED",[
          "@"+cleanNum(target)+" has been banned",
          "and removed from the group."
        ])),
        mentions: [target]
      }, { quoted: msg });
    }
    if (cmd === "unban") {
      if (!target) return reply("❌ Tag someone to unban!\nExample: *.unban @user*");
      setG(from,"banlist",(getG(from,"banlist")||[]).filter(x=>x!==target));
      return sock.sendMessage(from, {
        text: fmt("✅ @"+cleanNum(target)+" has been unbanned."),
        mentions: [target]
      }, { quoted: msg });
    }
    if (cmd === "softban") {
      if (!target) return reply("❌ Tag someone to softban!\nExample: *.softban @user*");
      await reply("🔄 Softbanning @"+cleanNum(target)+"...",[target]);
      await sock.groupParticipantsUpdate(from,[target],"remove");
      await new Promise(r=>setTimeout(r,2000));
      await sock.groupParticipantsUpdate(from,[target],"add");
      return sock.sendMessage(from, {
        text: fmt(box("🔄  SOFTBAN COMPLETE",[
          "@"+cleanNum(target)+" was removed",
          "and re-added. Messages cleared."
        ])),
        mentions: [target]
      }, { quoted: msg });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DELETE MESSAGE
    // ─────────────────────────────────────────────────────────────────────────
    if (["deletemsg","del","delete"].includes(cmd)) {
      if (!ctx.stanzaId) return reply("❌ Reply to a message to delete it!\nExample: Reply to any message with *.del*");
      await sock.sendMessage(from, {
        delete: { remoteJid: from, fromMe: false, id: ctx.stanzaId, participant: ctx.participant }
      });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POLL
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "poll") {
      if (!text) return reply("❌ Usage: *.poll Question | Option1 | Option2*\nExample: *.poll Best fruit? | Mango | Apple*");
      const parts = text.split("|").map(x=>x.trim()).filter(Boolean);
      if (parts.length<3) return reply("❌ Need at least a question and 2 options!\nExample: *.poll GOAT? | Messi | Ronaldo*");
      await sock.sendMessage(from, { poll: { name: parts[0], values: parts.slice(1).slice(0,12), selectableCount: 1 } }, { quoted: msg });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ANTI TOGGLES
    // ─────────────────────────────────────────────────────────────────────────
    // Antibot / Antibadword toggles
    for (const [c,k,label,emoji] of [
      ["antibot","antibot","Anti-Bot","🤖"],
      ["antibadword","antibadword","Anti-Badword","🤬"]
    ]) {
      if (cmd===c) {
        const cur = getG(from,k,false);
        setG(from,k,!cur);
        return reply(box(emoji+"  "+label,[
          "Status: "+(!cur?"✅ ENABLED":"❌ DISABLED")
        ]));
      }
    }

    // Antilink toggle — with detailed explanation
    if (cmd === "antilink") {
      const cur = getG(from,"antilink",false);
      setG(from,"antilink",!cur);
      return reply(box("🔗  ANTI-LINK "+(!cur?"ENABLED":"DISABLED"),[
        "Status : "+(!cur?"✅ ON":"❌ OFF"),
        "",
        ...(!cur ? [
          "How it works:",
          "• Any link sent by a member",
          "  will be deleted instantly.",
          "• 1st link  → ⚠️ Warning 1/3",
          "• 2nd link  → ⚠️ Warning 2/3",
          "• 3rd link  → 👢 KICKED from group",
          "",
          "Admins are always exempt ✅"
        ] : [
          "Members can now send links freely."
        ])
      ]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CREATE GROUP
    // ─────────────────────────────────────────────────────────────────────────
    if (["creategc","creategroup"].includes(cmd)) {
      if (!isOwner) return reply("❌ Only the bot owner can create groups.");
      if (!text) return reply("❌ Provide a group name!\nExample: *.creategc Prince Squad*");
      await sock.groupCreate(text,[senderJid]);
      return reply(box("✅  GROUP CREATED",["Name: "+text]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PIN MESSAGE
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "pinmsg") {
      if (!ctx.stanzaId) return reply("❌ Reply to a message to pin it!\nExample: Reply with *.pinmsg*");
      try {
        await sock.sendMessage(from, {
          pin: { type:1, time:604800, key: { remoteJid:from, fromMe:ctx.participant===sock.user?.id, id:ctx.stanzaId, participant:ctx.participant } }
        });
        return reply("📌 *Message pinned for 7 days!*");
      } catch { return reply("❌ Could not pin. Ensure bot has admin rights."); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SLOW MODE (advisory)
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === "slowmode") {
      return reply(box("⏱️  SLOW MODE",[
        "WhatsApp does not support slow mode via bots.",
        "",
        "Alternatives:",
        "• *.mute*  — Only admins can message",
        "• *.close* — Lock the group entirely",
        "• *.antibot* — Block bot accounts"
      ]));
    }

    return reply("✅ Command *"+cmd+"* executed.");
  }
};
