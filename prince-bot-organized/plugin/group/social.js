import fs from "fs";

// ── Persistent storage helpers ─────────────────────────────────────────────
const DATA_FILE = "./extras-data.json";
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); } catch { return {}; }
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

export default {
  command: [ "mentionall",
    "afk", "back",
    "remindme", "remind",
    "neverhaveiever", "nhie"
  ],

  run: async ({ sock, msg, body, cmd, from, isGroup, isOwner, senderJid, senderNumber }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    // ══════════════════════════════
    // 📊 POLL
    // ══════════════════════════════
    if (cmd === "poll") {
      if (!query) return reply("📊 Usage: *.poll Question | Option1 | Option2 | Option3*\nExample: *.poll Best fruit | Mango | Apple | Orange*");
      const parts = query.split("|").map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) return reply("❌ You need at least a question and 2 options.\nExample: *.poll Best? | Yes | No*");
      const question = parts[0];
      const options = parts.slice(1);
      const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
      let text = `📊 *POLL*\n\n❓ *${question}*\n\n`;
      options.slice(0, 10).forEach((o, i) => { text += `${emojis[i]} ${o}\n`; });
      text += `\n_Vote by replying with the number!_ 🗳️`;
      return reply(text);
    }

    // ══════════════════════════════
    // 👋 WELCOME MESSAGE PREVIEW
    // ══════════════════════════════
    if (cmd === "welcome") {
      if (!isGroup) return reply("❌ This command works in groups only.");
      const data = loadData();
      if (args[0] === "set") {
        const msg2 = args.slice(1).join(" ");
        if (!msg2) return reply("❌ Provide a welcome message!\nUse {name} for member name.\nExample: *.welcome set Welcome {name} to the group!*");
        if (!data.welcome) data.welcome = {};
        data.welcome[from] = msg2;
        saveData(data);
        return reply(`✅ Welcome message set!\n\nPreview: ${msg2.replace("{name}", "NewMember")}`);
      }
      if (args[0] === "off") {
        if (data.welcome) delete data.welcome[from];
        saveData(data);
        return reply("✅ Welcome message disabled for this group.");
      }
      const current = data.welcome?.[from];
      return reply(current
        ? `👋 *CURRENT WELCOME MSG:*\n\n${current}\n\nTo change: *.welcome set <message>*\nTo disable: *.welcome off*`
        : `👋 No welcome message set.\n\nTo set one: *.welcome set Welcome {name}!*`);
    }

    // ══════════════════════════════
    // 📢 TAG ALL MEMBERS
    // ══════════════════════════════
    if (cmd === "tagall" || cmd === "mentionall") {
      if (!isGroup) return reply("❌ Groups only!");
      if (!isOwner) return reply("❌ Only bot owner can use this.");
      try {
        const groupMeta = await sock.groupMetadata(from);
        const members = groupMeta.participants;
        const mentions = members.map(m => m.id);
        const message = query || "👋 Attention everyone!";
        let text = `📢 *${message}*\n\n`;
        members.forEach(m => { text += `@${m.id.split("@")[0]}\n`; });
        return sock.sendMessage(from, { text, mentions }, { quoted: msg });
      } catch (e) {
        return reply(`❌ Error: ${e.message}`);
      }
    }

    // ══════════════════════════════
    // 💤 AFK SYSTEM
    // ══════════════════════════════
    if (cmd === "afk") {
      const data = loadData();
      if (!data.afk) data.afk = {};
      const reason = query || "No reason given";
      data.afk[senderJid] = { reason, time: Date.now() };
      saveData(data);
      return reply(`💤 *AFK SET*\n\n@${senderNumber} is now AFK\n📝 Reason: ${reason}\n\nType *.back* when you return.`, [senderJid]);
    }

    if (cmd === "back") {
      const data = loadData();
      if (!data.afk) data.afk = {};
      const afkData = data.afk[senderJid];
      if (!afkData) return reply("❌ You were not AFK.");
      const duration = Math.floor((Date.now() - afkData.time) / 60000);
      delete data.afk[senderJid];
      saveData(data);
      return reply(`✅ *WELCOME BACK!*\n\n@${senderNumber} is no longer AFK\n⏱️ Was away for: ${duration} minute(s)`, [senderJid]);
    }

    // ══════════════════════════════
    // ⚠️ WARN SYSTEM
    // ══════════════════════════════
    if (cmd === "warn") {
      if (!isOwner) return reply("❌ Owner only command.");
      if (!isGroup) return reply("❌ Groups only!");
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentioned) return reply("❌ Tag a user to warn!\nExample: *.warn @user Spamming*");
      const reason = args.filter(a => !a.includes("@")).join(" ") || "No reason given";
      const data = loadData();
      if (!data.warns) data.warns = {};
      if (!data.warns[from]) data.warns[from] = {};
      if (!data.warns[from][mentioned]) data.warns[from][mentioned] = [];
      data.warns[from][mentioned].push({ reason, time: Date.now() });
      const count = data.warns[from][mentioned].length;
      saveData(data);
      return sock.sendMessage(from, {
        text: `⚠️ *WARNING ${count}/3*\n\n@${mentioned.split("@")[0]} has been warned!\n📝 Reason: ${reason}\n\n${count >= 3 ? "🚨 MAX WARNINGS REACHED!" : `${3 - count} warning(s) left before action.`}`,
        mentions: [mentioned]
      }, { quoted: msg });
    }

    if (cmd === "warnings") {
      if (!isGroup) return reply("❌ Groups only!");
      const data = loadData();
      const groupWarns = data.warns?.[from] || {};
      if (Object.keys(groupWarns).length === 0) return reply("✅ No warnings in this group!");
      let text = "⚠️ *WARNINGS LIST*\n\n";
      const mentions = [];
      for (const [jid, warns] of Object.entries(groupWarns)) {
        text += `@${jid.split("@")[0]}: ${warns.length} warning(s)\n`;
        mentions.push(jid);
      }
      return sock.sendMessage(from, { text, mentions }, { quoted: msg });
    }

    if (cmd === "clearwarn") {
      if (!isOwner) return reply("❌ Owner only command.");
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!mentioned) return reply("❌ Tag a user to clear warnings!");
      const data = loadData();
      if (data.warns?.[from]?.[mentioned]) {
        delete data.warns[from][mentioned];
        saveData(data);
        return reply(`✅ Warnings cleared for @${mentioned.split("@")[0]}`, [mentioned]);
      }
      return reply(`✅ No warnings found for that user.`);
    }

    // ══════════════════════════════
    // ⏰ REMIND ME
    // ══════════════════════════════
    if (cmd === "remindme" || cmd === "remind") {
      if (args.length < 2) return reply("⏰ Usage: *.remindme <minutes> <message>*\nExample: *.remindme 5 Take my meds*");
      const minutes = parseInt(args[0]);
      const reminderMsg = args.slice(1).join(" ");
      if (isNaN(minutes) || minutes < 1 || minutes > 1440) return reply("❌ Minutes must be between 1 and 1440 (24 hrs).");
      await reply(`⏰ *REMINDER SET!*\n\n📝 Message: ${reminderMsg}\n⏳ I'll remind you in *${minutes} minute(s)*!`);
      setTimeout(async () => {
        await sock.sendMessage(from, {
          text: `⏰ *REMINDER!*\n\n@${senderNumber}\n\n📝 ${reminderMsg}\n\n_This is your ${minutes} minute reminder_ ✅`,
          mentions: [senderJid]
        }).catch(() => {});
      }, minutes * 60 * 1000);
      return;
    }

    // ══════════════════════════════
    // 💌 COMPLIMENT
    // ══════════════════════════════
    if (cmd === "compliment") {
      const compliments = [
        "You light up every room you walk into! ✨",
        "You have the best energy — never change! 🌟",
        "Your smile could stop time. 😍",
        "You're smarter than you think, and that's saying something! 🧠",
        "Honestly? You're one in a million. 💎",
        "The world is genuinely better with you in it. 🌍",
        "You make hard things look effortless. 💪",
        "You have an amazing heart. Don't ever let anyone dim that. ❤️",
        "Your vibe is immaculate. Keep going. 🚀",
        "If confidence was a person, it would look like you. 👑"
      ];
      return reply(`💌 *COMPLIMENT*\n\n${compliments[Math.floor(Math.random() * compliments.length)]}`);
    }

    // ══════════════════════════════
    // 🔥 ROAST
    // ══════════════════════════════
    if (cmd === "roast") {
      const roasts = [
        "You're the human version of a participation trophy. 🏆",
        "I've seen better comebacks in a dead battery. 🔋",
        "Your WiFi password is probably '12345' and you feel proud. 😂",
        "If brains were petrol, you couldn't power a fly's motorcycle. 🛵",
        "You're the reason God invented the mute button. 🔇",
        "Even your shadow tries to walk away from you. 👣",
        "You bring so much joy… when you leave the room. 🚪",
        "I'd roast you harder but my mum said I shouldn't burn trash. 🗑️",
        "You have miles to go before you reach average. 😬",
        "Your vibe is so off, even your reflection gives you side-eye. 🪞"
      ];
      return reply(`🔥 *ROAST*\n\n${roasts[Math.floor(Math.random() * roasts.length)]}\n\n_Don't come for me, I came for you_ 😈`);
    }

    // ══════════════════════════════
    // ❓ TRUTH QUESTION
    // ══════════════════════════════
    if (cmd === "truth") {
      const truths = [
        "What's the most embarrassing thing you've ever done in public?",
        "Have you ever lied to get out of plans? What was the excuse?",
        "What's a secret you've never told anyone in this group?",
        "Who was your first crush and did they know?",
        "What's the worst thing you've ever said about someone behind their back?",
        "Have you ever cheated on a test or exam?",
        "What's a bad habit you still have but won't admit to?",
        "If you could erase one moment from your past, what would it be?",
        "What's the pettiest thing you've ever done for revenge?",
        "Have you ever sent a text to the wrong person? What did it say?"
      ];
      return reply(`❓ *TRUTH*\n\n${truths[Math.floor(Math.random() * truths.length)]}\n\n_You HAVE to answer honestly_ 😏`);
    }

    // ══════════════════════════════
    // 🎯 DARE CHALLENGE
    // ══════════════════════════════
    if (cmd === "dare") {
      const dares = [
        "Send a voice note of you singing a song for 10 seconds.",
        "Change your WhatsApp status to 'I lost a dare' for 1 hour.",
        "Send a selfie with the most ridiculous face you can make.",
        "Text the 5th person in your contacts 'You are my hero'.",
        "Do 10 push-ups and send a video as proof.",
        "Say the alphabet backwards in a voice note.",
        "Set your profile picture to a potato for 30 minutes.",
        "Send a voice note speaking only in your worst accent.",
        "Write a love poem about your favourite food and send it.",
        "Send a screenshot of your most recent embarrassing chat."
      ];
      return reply(`🎯 *DARE*\n\n${dares[Math.floor(Math.random() * dares.length)]}\n\n_No backing out now_ 😈`);
    }

    // ══════════════════════════════
    // 🙈 NEVER HAVE I EVER
    // ══════════════════════════════
    if (cmd === "neverhaveiever" || cmd === "nhie") {
      const statements = [
        "Never have I ever stayed up past 3am doing absolutely nothing productive.",
        "Never have I ever texted someone then pretended I didn't see their reply.",
        "Never have I ever eaten food that fell on the floor (5 second rule).",
        "Never have I ever pretended to be sick to avoid something.",
        "Never have I ever sent a risky text and immediately regretted it.",
        "Never have I ever laughed at something I wasn't supposed to.",
        "Never have I ever stalked someone's social media for more than 30 minutes.",
        "Never have I ever cried during a movie or show.",
        "Never have I ever told a white lie to avoid hurting someone's feelings.",
        "Never have I ever pretended I was busy to cancel plans."
      ];
      return reply(`🙈 *NEVER HAVE I EVER*\n\n${statements[Math.floor(Math.random() * statements.length)]}\n\n_React 👍 if you HAVE, 👎 if you HAVEN'T_ 😂`);
    }
  }
};
