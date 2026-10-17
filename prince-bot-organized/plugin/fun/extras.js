import axios from "axios";

export default {
  command: [
    "advice", "riddle", "8ball", "eightball",
    "coinflip", "flip",
    "horoscope",
    "password", "genpass",
    "countdown",
    "emojimix",
    "reverse",
    "wordcount"
  ],

  run: async ({ sock, msg, body, cmd, from }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // 💡 ADVICE
      // ══════════════════════════════
      if (cmd === "advice") {
        const res = await axios.get("https://api.adviceslip.com/advice", { timeout: 8000 });
        const slip = res.data.slip;
        return reply(`💡 *RANDOM ADVICE #${slip.id}*\n\n"${slip.advice}"\n\n_Take it or leave it_ 😏`);
      }

      // ══════════════════════════════
      // 🧩 RIDDLE
      // ══════════════════════════════
      if (cmd === "riddle") {
        const riddles = [
          { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
          { q: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?", a: "A map" },
          { q: "What has hands but can't clap?", a: "A clock" },
          { q: "What gets wetter as it dries?", a: "A towel" },
          { q: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", a: "An echo" },
          { q: "What has keys but no locks, space but no room, and you can enter but can't go inside?", a: "A keyboard" },
          { q: "The more you have of it, the less you see. What is it?", a: "Darkness" },
          { q: "What runs but never walks, has a mouth but never talks?", a: "A river" },
          { q: "I have a head and a tail, but no body. What am I?", a: "A coin" },
          { q: "What can travel around the world while staying in a corner?", a: "A stamp" }
        ];
        const r = riddles[Math.floor(Math.random() * riddles.length)];
        return reply(`🧩 *RIDDLE TIME!*\n\n❓ ${r.q}\n\n||💡 Answer: ${r.a}||`);
      }

      // ══════════════════════════════
      // 🎱 MAGIC 8 BALL
      // ══════════════════════════════
      if (cmd === "8ball" || cmd === "eightball") {
        if (!query) return reply("🎱 Ask me a yes/no question!\nExample: *.8ball Will I be rich?*");
        const answers = [
          "✅ It is certain.", "✅ Without a doubt.", "✅ Yes, definitely!",
          "✅ You may rely on it.", "✅ Most likely.", "🤔 Reply hazy, try again.",
          "🤔 Ask again later.", "🤔 Cannot predict now.", "❌ Don't count on it.",
          "❌ My sources say no.", "❌ Very doubtful.", "❌ Outlook not so good."
        ];
        const a = answers[Math.floor(Math.random() * answers.length)];
        return reply(`🎱 *MAGIC 8 BALL*\n\n❓ *Q:* ${query}\n\n${a}`);
      }

      // ══════════════════════════════
      // 🪙 COIN FLIP
      // ══════════════════════════════
      if (cmd === "coinflip" || cmd === "flip") {
        const result = Math.random() < 0.5 ? "🟡 HEADS" : "⚪ TAILS";
        return reply(`🪙 *COIN FLIP*\n\n${result}!\n\n_The coin has spoken_ 👑`);
      }

      // ══════════════════════════════
      // 🎲 DICE ROLL
      // ══════════════════════════════
      if (cmd === "dice" || cmd === "roll") {
        const sides = parseInt(args[0]) || 6;
        if (sides < 2 || sides > 100) return reply("❌ Dice sides must be between 2 and 100.");
        const result = Math.floor(Math.random() * sides) + 1;
        const faces = ["⚀","⚁","⚂","⚃","⚄","⚅"];
        const emoji = sides === 6 ? faces[result - 1] : "🎲";
        return reply(`🎲 *DICE ROLL* (d${sides})\n\n${emoji} You rolled: *${result}*\n\n_out of ${sides}_`);
      }

      // ══════════════════════════════
      // ♈ HOROSCOPE
      // ══════════════════════════════
      if (cmd === "horoscope") {
        const signs = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
        const sign = args[0]?.toLowerCase();
        if (!sign || !signs.includes(sign)) {
          return reply(`♈ *HOROSCOPE*\n\nPlease provide your star sign!\n\nExample: *.horoscope leo*\n\nSigns: ${signs.join(", ")}`);
        }
        const emojis = { aries:"♈",taurus:"♉",gemini:"♊",cancer:"♋",leo:"♌",virgo:"♍",libra:"♎",scorpio:"♏",sagittarius:"♐",capricorn:"♑",aquarius:"♒",pisces:"♓" };
        const fortunes = [
          "Today is your day to shine. Trust your instincts and go for it.",
          "A surprise is heading your way — keep your eyes open.",
          "Focus on what matters most. Let go of what drains you.",
          "Your energy is magnetic today. People are drawn to you.",
          "A challenge ahead will make you stronger. Face it head on.",
          "Good things are coming. Be patient and stay positive.",
          "Someone close has been thinking about you. Reach out.",
          "Financial opportunities may arise — think before you act.",
          "Your creativity is at a peak today. Use it wisely.",
          "Rest and recharge. Not every day needs to be a battle."
        ];
        const f = fortunes[Math.floor(Math.random() * fortunes.length)];
        return reply(`${emojis[sign]} *HOROSCOPE — ${sign.toUpperCase()}*\n\n📅 ${new Date().toLocaleDateString("en-GB", { weekday:"long", day:"2-digit", month:"long" })}\n\n✨ ${f}\n\n_Stars never lie_ 🌟`);
      }

      // ══════════════════════════════
      // 🔑 PASSWORD GENERATOR
      // ══════════════════════════════
      if (cmd === "password" || cmd === "genpass") {
        const length = Math.min(Math.max(parseInt(args[0]) || 16, 8), 64);
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+";
        let pass = "";
        for (let i = 0; i < length; i++) pass += chars[Math.floor(Math.random() * chars.length)];
        return reply(`🔑 *PASSWORD GENERATOR*\n\n\`\`\`${pass}\`\`\`\n\n📏 Length: ${length} characters\n\n⚠️ _Save this somewhere safe. Don't share it!_`);
      }

      // ══════════════════════════════
      // ⏳ COUNTDOWN
      // ══════════════════════════════
      if (cmd === "countdown") {
        const events = [
          { name: "New Year 2026", date: new Date("2026-01-01") },
          { name: "Christmas 2025", date: new Date("2025-12-25") },
          { name: "New Year 2027", date: new Date("2027-01-01") }
        ];
        const now = new Date();
        let text = "⏳ *COUNTDOWN TO EVENTS*\n\n";
        for (const ev of events) {
          const diff = ev.date - now;
          if (diff <= 0) continue;
          const days = Math.floor(diff / 86400000);
          const hours = Math.floor((diff % 86400000) / 3600000);
          text += `📅 *${ev.name}*\n   ⏰ ${days} days, ${hours} hours\n\n`;
        }
        text += "_Time waits for no one_ ⌛";
        return reply(text);
      }

      // ══════════════════════════════
      // 🔤 REVERSE TEXT
      // ══════════════════════════════
      if (cmd === "reverse") {
        if (!query) return reply("❌ Provide text to reverse!\nExample: *.reverse Hello World*");
        return reply(`🔤 *REVERSE TEXT*\n\n📥 Input: ${query}\n📤 Output: ${query.split("").reverse().join("")}`);
      }

      // ══════════════════════════════
      // 📊 WORD COUNT
      // ══════════════════════════════
      if (cmd === "wordcount") {
        if (!query) return reply("❌ Provide text to count!\nExample: *.wordcount Hello beautiful world*");
        const words = query.trim().split(/\s+/).length;
        const chars = query.length;
        const charsNoSpace = query.replace(/\s/g, "").length;
        const sentences = (query.match(/[.!?]+/g) || []).length;
        return reply(`📊 *WORD COUNT*\n\n📝 Text: "${query.substring(0,50)}${query.length > 50 ? "..." : ""}"\n\n📌 Words: *${words}*\n📌 Characters: *${chars}*\n📌 Chars (no spaces): *${charsNoSpace}*\n📌 Sentences: *${sentences}*`);
      }

      // ══════════════════════════════
      // 😂 EMOJI MIX
      // ══════════════════════════════
      if (cmd === "emojimix") {
        const sets = ["😂🤣😭😤😍🥰😘😋","🔥💥⚡🌊🌪️🌈☀️🌙","🐶🐱🐭🐹🐰🦊🐻🐼","🍕🍔🍟🌮🌯🍜🍣🍩","🏆🥇🎖️🏅🎗️🎪🎭🎨"];
        const set = sets[Math.floor(Math.random() * sets.length)];
        const emojis = [...set];
        const shuffled = emojis.sort(() => Math.random() - 0.5).slice(0, 5).join(" ");
        return reply(`😂 *EMOJI MIX*\n\n${shuffled}\n\n_Random emoji combo for you_ 🎲`);
      }

    } catch (e) {
      return reply(`❌ Error: ${e.message}`);
    }
  }
};
