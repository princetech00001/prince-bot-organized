import { getGroup, updateGroup, addWarn, resetWarns, getWarnCount } from "../../utils/groupStore.js";
import { getGroupContext, findMember, isAdminMember, isSelf, memberKey, numberOf, targetFromMessage } from "../../utils/groupAdmin.js";

// .warn @user [reason]   .warnings [@user]   .resetwarn @user   .warnlimit <1-10>
// Reaching the limit removes the member (the bot must be admin).
export default {
  command: ["warn", "warnings", "warns", "resetwarn", "clearwarn", "warnlimit"],

  run: async ({ sock, msg, from, body, cmd, isOwner, isGroup, senderJid, botNumber, prefix = "." }) => {
    const reply = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg });
    if (!isGroup) return reply("❌ This command only works inside a group.");

    let ctx;
    try { ctx = await getGroupContext({ sock, msg, from, senderJid, botNumber, isOwner }); }
    catch { return reply("❌ Could not read group info. Try again."); }

    const args = body.trim().split(/\s+/).slice(1);
    const settings = getGroup(from);
    const limit = settings.warnLimit;

    // ── anyone can check warnings ──
    if (cmd === "warnings" || cmd === "warns") {
      const targetJid = targetFromMessage(msg, args);
      if (targetJid) {
        const member = findMember(ctx.participants, targetJid);
        if (!member) return reply("❌ That person isn't in this group.");
        const w = settings.warns[memberKey(member)];
        const count = w?.count || 0;
        return reply(
          `⚠️ *Warnings for @${numberOf(member.id)}*\n${count}/${limit}` +
          (w?.reasons?.length ? `\n\nRecent reasons:\n${w.reasons.map(r => `• ${r}`).join("\n")}` : ""),
          [member.id]
        );
      }
      // no target: list everyone with warnings
      const rows = ctx.participants
        .map(p => ({ p, count: settings.warns[memberKey(p)]?.count || 0 }))
        .filter(x => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
      if (!rows.length) return reply("✅ Nobody in this group has warnings.");
      return reply(
        `⚠️ *Warned members* (limit ${limit})\n\n` + rows.map(x => `• @${numberOf(x.p.id)} — ${x.count}/${limit}`).join("\n"),
        rows.map(x => x.p.id)
      );
    }

    // ── everything below is admin-only ──
    if (!ctx.senderIsAdmin) return reply("🚫 Only group admins can use this command.");

    if (cmd === "warnlimit") {
      const n = parseInt(args[0], 10);
      if (!n || n < 1 || n > 10) return reply(`⚙️ Current warn limit: *${limit}*\nChange it: *${prefix}warnlimit <1-10>*`);
      updateGroup(from, g => { g.warnLimit = n; });
      return reply(`✅ Warn limit set to *${n}*. Members are removed when they reach ${n}/${n}.`);
    }

    const targetJid = targetFromMessage(msg, args);
    if (!targetJid) {
      return reply(cmd === "warn"
        ? `❌ Tag or reply to someone.\nExample: *${prefix}warn @user spamming*`
        : `❌ Tag or reply to someone.\nExample: *${prefix}resetwarn @user*`);
    }
    const member = findMember(ctx.participants, targetJid);
    if (!member) return reply("❌ That person isn't in this group.");
    const num = numberOf(member.id);
    const key = memberKey(member);

    if (cmd === "resetwarn" || cmd === "clearwarn") {
      resetWarns(from, key);
      return reply(`✅ Warnings cleared for @${num}.`, [member.id]);
    }

    // cmd === "warn"
    if (isSelf(sock, member.id, member.phoneNumber)) return reply("😅 I can't warn myself.");
    if (isAdminMember(member)) return reply("🚫 You can't warn a group admin.");

    const reason = args.filter(a => !a.startsWith("@") && !/^\+?\d{7,15}$/.test(a)).join(" ").trim() || "No reason given";
    const count = addWarn(from, key, reason);

    if (count < limit) {
      return reply(
        `⚠️ *WARNING* — @${num}\nReason : ${reason.slice(0, 60)}\nCount  : ${count}/${limit}\n\n${limit - count} more and you will be removed.`,
        [member.id]
      );
    }

    // limit reached → remove
    if (!ctx.botIsAdmin) {
      return reply(
        `🚨 @${num} reached ${count}/${limit} warnings, but I'm not a group admin so I can't remove them.\nMake me admin and use *${prefix}kick @user*.`,
        [member.id]
      );
    }
    try {
      await sock.groupParticipantsUpdate(from, [member.id], "remove");
      resetWarns(from, key);
      return reply(`🚫 @${num} reached ${limit}/${limit} warnings and was removed from the group.`, [member.id]);
    } catch (e) {
      return reply(`🚨 @${num} reached ${count}/${limit} warnings but I couldn't remove them: ${e.message}`, [member.id]);
    }
  }
};
