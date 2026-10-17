import axios from "axios";

export default {

  command: [
    "fact", "joke", "jokes",
    "meme", "quote", "quotes",
    "roast", "compliment",
    "would", "wouldyourather",
    "ship", "rate"
  ],

  run: async ({ sock, msg, body, cmd, from, senderJid, args: rawArgs }) => {

    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // 😄 JOKES
      // ══════════════════════════════

      if (cmd === "joke" || cmd === "jokes") {
        const res = await axios.get("https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,racist,sexist,explicit&type=twopart", { timeout: 8000 });
        if (res.data.type === "twopart") {
          return reply(`😂 *JOKE OF THE DAY*\n\n${res.data.setup}\n\n||${res.data.delivery}||`);
        }
        return reply(`😂 *JOKE*\n\n${res.data.joke}`);
      }

      // ══════════════════════════════
      // 🤔 RANDOM FACT
      // ══════════════════════════════

      if (cmd === "fact") {
        const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", { timeout: 8000 });
        return reply(`🧠 *RANDOM FACT*\n\n${res.data.text}`);
      }

      // ══════════════════════════════
      // 💬 QUOTE
      // ══════════════════════════════

      if (cmd === "quote" || cmd === "quotes") {
        const res = await axios.get("https://api.quotable.io/random", { timeout: 8000 });
        return reply(`💬 *QUOTE*\n\n"${res.data.content}"\n\n— _${res.data.author}_`);
      }

      // ══════════════════════════════
      // 🔥 ROAST
      // ══════════════════════════════

      if (cmd === "roast") {
        const roasts = [
          "You're the reason they put instructions on shampoo bottles.",
          "You're like a cloud — when you disappear, it's a beautiful day.",
          "I'd agree with you, but then we'd both be wrong.",
          "Some drink from the fountain of knowledge. You just gargled.",
          "You're not stupid. You just have bad luck thinking.",
          "I'm not insulting you, I'm describing you.",
          "You have the right to remain silent because anything you say will probably be stupid.",
          "Your life is a tragedy. Good thing no one is watching.",
          "You're so slow, even snails send you motivational messages.",
          "If brains were petrol, you wouldn't have enough to power a flea's motorcycle."
        ];
        const roast = roasts[Math.floor(Math.random() * roasts.length)];
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const target = mention ? `@${mention.split("@")[0]}` : "you";
        return reply(`🔥 *ROAST*\n\n${target}: ${roast}`);
      }

      // ══════════════════════════════
      // 💐 COMPLIMENT
      // ══════════════════════════════

      if (cmd === "compliment") {
        const compliments = [
          "You light up every room you walk into. ✨",
          "Your kindness is a gift to everyone around you. 💝",
          "You have an incredible ability to see the best in people. 🌟",
          "You make the world a much better place just by being in it. 🌍",
          "Your smile could light up an entire city. 😊",
          "You are more talented than you give yourself credit for. 💪",
          "The energy you bring to every moment is truly magical. 🔮",
          "You inspire people without even trying. 🦋"
        ];
        const c = compliments[Math.floor(Math.random() * compliments.length)];
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const target = mention ? `@${mention.split("@")[0]}` : "you";
        return reply(`💐 *COMPLIMENT*\n\n${target}: ${c}`);
      }

      // ══════════════════════════════
      // 🤔 WOULD YOU RATHER
      // ══════════════════════════════

      if (cmd === "would" || cmd === "wouldyourather") {
        const questions = [
          ["Have the ability to fly", "Have the ability to be invisible"],
          ["Always be 10 minutes late", "Always be 20 minutes early"],
          ["Lose all your money", "Lose all your memories"],
          ["Only be able to whisper", "Only be able to shout"],
          ["Know how you will die", "Know when you will die"],
          ["Live without music", "Live without movies"],
          ["Never use the internet again", "Never watch TV again"],
          ["Be feared by all", "Be loved by all"],
          ["Have a rewind button for life", "Have a pause button for life"],
          ["Be always cold", "Be always hot"]
        ];
        const q = questions[Math.floor(Math.random() * questions.length)];
        return reply(`🤔 *WOULD YOU RATHER?*\n\n🅰️ ${q[0]}\n\n🆚\n\n🅱️ ${q[1]}\n\n_Reply A or B!_`);
      }

      // ══════════════════════════════
      // 💘 SHIP METER
      // ══════════════════════════════

      if (cmd === "ship") {
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const sender = senderJid || from;

        const p1 = mentions[0] ? `@${mentions[0].split("@")[0]}` : "You";
        const p2 = mentions[1] ? `@${mentions[1].split("@")[0]}` : "Your crush";

        const percent = Math.floor(Math.random() * 101);
        const bar = "█".repeat(Math.floor(percent / 10)) + "░".repeat(10 - Math.floor(percent / 10));

        let emoji = "💔";
        let msg2 = "Not a match.";
        if (percent >= 90) { emoji = "💞"; msg2 = "SOULMATES! Made for each other! 🔥"; }
        else if (percent >= 70) { emoji = "❤️"; msg2 = "Great match! Go for it! 😍"; }
        else if (percent >= 50) { emoji = "💛"; msg2 = "Pretty good! Worth exploring."; }
        else if (percent >= 30) { emoji = "💙"; msg2 = "Meh. Could work with effort."; }

        return reply(`💘 *SHIP METER*\n\n${p1} + ${p2}\n\n[${bar}] ${percent}%\n\n${emoji} ${msg2}`);
      }

      // ══════════════════════════════
      // ⭐ RATE
      // ══════════════════════════════

      if (cmd === "rate") {
        const mention = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const target = mention ? `@${mention.split("@")[0]}` : (args.join(" ") || "you");
        const score = Math.floor(Math.random() * 11);
        const bar = "⭐".repeat(score) + "☆".repeat(10 - score);

        let verdict = "";
        if (score >= 9) verdict = "Legendary! 🔥👑";
        else if (score >= 7) verdict = "Pretty fire 😎";
        else if (score >= 5) verdict = "Average, could be better 😐";
        else if (score >= 3) verdict = "Needs some work lol 😅";
        else verdict = "Yikes... 💀";

        return reply(`⭐ *RATE*\n\n${target}\n\n${bar}\n\n*Score:* ${score}/10\n*Verdict:* ${verdict}`);
      }

    } catch (err) {
      console.error("[fun.js]", err?.message || err);
      return reply(`❌ Error: ${err.message}\n\nTry again later.`);
    }
  }
};
