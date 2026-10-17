import axios from "axios";

// ── Simple in-memory trivia session store ──────────────────────────────────
const triviaActive = {};

export default {
  command: [ "inspire", "funfact",
    "wyr", "answer",
    "number", "numberinfo",
    "currency", "convert",
    "iplookup", "ipinfo",
    "github",
    "randomuser", "fakeuser"
  ],

  run: async ({ sock, msg, body, cmd, from, senderJid, senderNumber }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // 📖 WIKIPEDIA
      // ══════════════════════════════
      if (cmd === "wiki" || cmd === "wikipedia") {
        if (!query) return reply("📖 Provide a topic!\nExample: *.wiki Elon Musk*");
        const res = await axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
          { timeout: 10000 }
        );
        const data = res.data;
        if (data.type === "disambiguation") return reply(`⚠️ "${query}" is ambiguous. Try being more specific.`);
        if (!data.extract) return reply(`❌ No Wikipedia article found for "${query}"`);
        const text = data.extract.length > 800 ? data.extract.substring(0, 800) + "..." : data.extract;
        return reply(
          `📖 *WIKIPEDIA — ${data.title}*\n\n${text}\n\n🔗 Read more: ${data.content_urls?.desktop?.page || ""}`
        );
      }

      // ══════════════════════════════
      // 😂 JOKE
      // ══════════════════════════════
      if (cmd === "joke") {
        const type = args[0]?.toLowerCase() || "any";
        const validTypes = ["any", "programming", "misc", "dark", "pun", "spooky", "christmas"];
        const jType = validTypes.includes(type) ? type : "any";
        const res = await axios.get(`https://v2.jokeapi.dev/joke/${jType}?blacklistFlags=racist,sexist`, { timeout: 8000 });
        const j = res.data;
        if (j.type === "single") {
          return reply(`😂 *JOKE*\n\n${j.joke}`);
        } else {
          return reply(`😂 *JOKE*\n\n${j.setup}\n\n||💡 ${j.delivery}||`);
        }
      }

      // ══════════════════════════════
      // 💬 INSPIRATIONAL QUOTE
      // ══════════════════════════════
      if (cmd === "quote" || cmd === "inspire") {
        const res = await axios.get("https://api.quotable.io/random", { timeout: 8000 });
        const q = res.data;
        return reply(
          `💬 *QUOTE OF THE MOMENT*\n\n"${q.content}"\n\n— *${q.author}*\n\n🏷️ Tags: ${q.tags?.join(", ") || "N/A"}`
        );
      }

      // ══════════════════════════════
      // 🧠 FUN FACT
      // ══════════════════════════════
      if (cmd === "fact" || cmd === "funfact") {
        const res = await axios.get("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en", { timeout: 8000 });
        return reply(`🧠 *FUN FACT*\n\n${res.data.text}\n\n_Mind = blown_ 🤯`);
      }

      // ══════════════════════════════
      // 💘 SHIP METER
      // ══════════════════════════════
      if (cmd === "ship") {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length < 2) {
          // Ship sender with random person
          const pct = Math.floor(Math.random() * 101);
          const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
          const emoji = pct >= 80 ? "💞" : pct >= 50 ? "💛" : pct >= 30 ? "🤍" : "💔";
          return reply(
            `💘 *SHIP METER*\n\n` +
            `Tag 2 people to ship them!\nExample: *.ship @user1 @user2*\n\n` +
            `Or here's your random love score:\n\n` +
            `${emoji} ${pct}% compatible\n[${bar}]`
          );
        }
        const [u1, u2] = mentioned;
        const seed = (u1 + u2).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const pct = seed % 101;
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
        const emoji = pct >= 80 ? "💞 PERFECT MATCH!" : pct >= 60 ? "💛 Good chemistry!" : pct >= 40 ? "🤍 It could work..." : "💔 Unlikely, but who knows!";
        return sock.sendMessage(from, {
          text: `💘 *SHIP METER*\n\n@${u1.split("@")[0]} ❤️ @${u2.split("@")[0]}\n\n[${bar}]\n⚡ ${pct}% compatible\n\n${emoji}`,
          mentions: [u1, u2]
        }, { quoted: msg });
      }

      // ══════════════════════════════
      // ⭐ RATE SOMEONE
      // ══════════════════════════════
      if (cmd === "rate") {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const target = mentioned[0] || senderJid;
        const seed = target.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const score = (seed * 7 + 13) % 11; // 0-10
        const stars = "⭐".repeat(score) + "🌑".repeat(10 - score);
        const ratings = [
          "Utter disaster 💀", "Pretty rough 😬", "Below average 😕",
          "Okay I guess 🤷", "Average 😐", "Not bad actually 👍",
          "Pretty solid! 😊", "Impressive 🔥", "Excellent! 💪",
          "Outstanding! 🌟", "GOAT status 👑"
        ];
        return sock.sendMessage(from, {
          text: `⭐ *RATING*\n\n@${target.split("@")[0]}\n\n${stars}\n\nScore: *${score}/10*\nVerdict: ${ratings[score]}`,
          mentions: [target]
        }, { quoted: msg });
      }

      // ══════════════════════════════
      // 🤔 WOULD YOU RATHER
      // ══════════════════════════════
      if (cmd === "wyr" || cmd === "wouldyourather") {
        const questions = [
          ["Be able to fly", "Be invisible"],
          ["Always be 10 minutes late", "Always be 20 minutes early"],
          ["Have no internet for a month", "Have no music for a year"],
          ["Know how you'll die", "Know when you'll die"],
          ["Be the funniest person in the room", "Be the smartest person in the room"],
          ["Lose all your money", "Lose all your memories"],
          ["Live without your phone for a year", "Live without TV forever"],
          ["Have unlimited money but no friends", "Have great friends but always be broke"],
          ["Be famous for something embarrassing", "Never be famous at all"],
          ["Have super strength", "Have super speed"]
        ];
        const q = questions[Math.floor(Math.random() * questions.length)];
        return reply(
          `🤔 *WOULD YOU RATHER?*\n\n` +
          `🅰️ ${q[0]}\n\n— OR —\n\n` +
          `🅱️ ${q[1]}\n\n` +
          `_Reply A or B!_ 😏`
        );
      }

      // ══════════════════════════════
      // 🧩 TRIVIA QUIZ
      // ══════════════════════════════
      if (cmd === "trivia") {
        const res = await axios.get("https://opentdb.com/api.php?amount=1&type=multiple", { timeout: 10000 });
        const q = res.data.results[0];
        const decode = (str) => str.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#039;/g,"'");
        const question = decode(q.question);
        const correct = decode(q.correct_answer);
        const incorrect = q.incorrect_answers.map(decode);
        const options = [...incorrect, correct].sort(() => Math.random() - 0.5);
        const letters = ["A","B","C","D"];
        const correctLetter = letters[options.indexOf(correct)];

        triviaActive[from] = { answer: correctLetter, correct, expires: Date.now() + 30000 };

        let text = `🧩 *TRIVIA QUIZ*\n\n`;
        text += `📚 Category: ${decode(q.category)}\n`;
        text += `⚡ Difficulty: ${q.difficulty.toUpperCase()}\n\n`;
        text += `❓ *${question}*\n\n`;
        options.forEach((o, i) => { text += `${letters[i]}. ${o}\n`; });
        text += `\n_Reply *.answer A/B/C/D* within 30 seconds!_`;
        return reply(text);
      }

      if (cmd === "answer") {
        const session = triviaActive[from];
        if (!session) return reply("❌ No active trivia! Start one with *.trivia*");
        if (Date.now() > session.expires) {
          delete triviaActive[from];
          return reply(`⏰ *TIME'S UP!*\n\nThe correct answer was *${session.answer}. ${session.correct}*\n\nPlay again with *.trivia*`);
        }
        const userAnswer = args[0]?.toUpperCase();
        if (!["A","B","C","D"].includes(userAnswer)) return reply("❌ Reply with A, B, C, or D!\nExample: *.answer A*");
        const isCorrect = userAnswer === session.answer;
        delete triviaActive[from];
        return reply(isCorrect
          ? `✅ *CORRECT!* 🎉\n\nYou got it right! The answer was *${session.answer}. ${session.correct}*\n\n_Well done!_ 🏆`
          : `❌ *WRONG!*\n\nYou answered *${userAnswer}* but the correct answer was *${session.answer}. ${session.correct}*\n\n_Better luck next time!_ 😅`
        );
      }

      // ══════════════════════════════
      // 🔢 NUMBER FACTS
      // ══════════════════════════════
      if (cmd === "number" || cmd === "numberinfo") {
        const num = args[0] || Math.floor(Math.random() * 1000);
        const type = args[1] || "trivia";
        const res = await axios.get(`http://numbersapi.com/${num}/${type}`, { timeout: 8000 });
        return reply(`🔢 *NUMBER FACT*\n\n${res.data}\n\n_Source: numbersapi.com_ 📚`);
      }

      // ══════════════════════════════
      // 💱 CURRENCY CONVERT
      // ══════════════════════════════
      if (cmd === "currency" || cmd === "convert") {
        if (args.length < 3) return reply(
          "💱 Usage: *.currency <amount> <from> <to>*\nExample: *.currency 100 USD NGN*\n*.currency 50 GBP EUR*"
        );
        const amount = parseFloat(args[0]);
        const from2 = args[1].toUpperCase();
        const to = args[2].toUpperCase();
        if (isNaN(amount)) return reply("❌ Invalid amount!");
        const res = await axios.get(
          `https://api.exchangerate-api.com/v4/latest/${from2}`,
          { timeout: 10000 }
        );
        const rate = res.data.rates[to];
        if (!rate) return reply(`❌ Currency not found: ${to}\nCheck you're using valid 3-letter codes (USD, EUR, GBP, NGN, etc.)`);
        const result = (amount * rate).toFixed(2);
        return reply(
          `💱 *CURRENCY CONVERT*\n\n` +
          `💵 ${amount.toLocaleString()} ${from2}\n` +
          `= 💰 *${parseFloat(result).toLocaleString()} ${to}*\n\n` +
          `📈 Rate: 1 ${from2} = ${rate.toFixed(4)} ${to}\n` +
          `_Source: ExchangeRate-API_ 🌍`
        );
      }

      // ══════════════════════════════
      // 🌐 IP LOOKUP
      // ══════════════════════════════
      if (cmd === "iplookup" || cmd === "ipinfo") {
        const ip = args[0] || "";
        if (!ip) return reply("🌐 Provide an IP address!\nExample: *.iplookup 8.8.8.8*");
        const res = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 10000 });
        const d = res.data;
        if (d.status === "fail") return reply(`❌ Invalid IP address: ${ip}`);
        return reply(
          `🌐 *IP LOOKUP — ${ip}*\n\n` +
          `🏳️ Country: ${d.country} (${d.countryCode})\n` +
          `🏙️ City: ${d.city}\n` +
          `🗺️ Region: ${d.regionName}\n` +
          `📮 Timezone: ${d.timezone}\n` +
          `📡 ISP: ${d.isp}\n` +
          `🏢 Org: ${d.org}\n` +
          `📍 Coordinates: ${d.lat}, ${d.lon}\n\n` +
          `_This is public IP information only_ ℹ️`
        );
      }

      // ══════════════════════════════
      // 🐙 GITHUB USER LOOKUP
      // ══════════════════════════════
      if (cmd === "github") {
        if (!query) return reply("🐙 Provide a GitHub username!\nExample: *.github torvalds*");
        const res = await axios.get(`https://api.github.com/users/${encodeURIComponent(query)}`, {
          timeout: 10000,
          headers: { "User-Agent": "PrinceBot/1.0" }
        });
        const u = res.data;
        if (u.message === "Not Found") return reply(`❌ GitHub user "${query}" not found.`);
        return reply(
          `🐙 *GITHUB — ${u.login}*\n\n` +
          `👤 Name: ${u.name || "N/A"}\n` +
          `📝 Bio: ${u.bio || "No bio set"}\n` +
          `📍 Location: ${u.location || "N/A"}\n` +
          `🏢 Company: ${u.company || "N/A"}\n` +
          `📦 Public Repos: ${u.public_repos}\n` +
          `👥 Followers: ${u.followers} | Following: ${u.following}\n` +
          `📅 Joined: ${new Date(u.created_at).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}\n` +
          `🔗 Profile: ${u.html_url}`
        );
      }

      // ══════════════════════════════
      // 🎵 LYRICS SEARCH
      // ══════════════════════════════
      if (cmd === "lyrics") {
        if (!query) return reply("🎵 Provide a song name!\nExample: *.lyrics shape of you*");
        const parts = query.split("-");
        const artist = parts.length > 1 ? parts[0].trim() : "";
        const title = parts.length > 1 ? parts.slice(1).join("-").trim() : query;
        const url = `https://lyrist.vercel.app/api/${encodeURIComponent(title)}${artist ? `/${encodeURIComponent(artist)}` : ""}`;
        const res = await axios.get(url, { timeout: 12000 });
        if (!res.data?.lyrics) return reply(`❌ Lyrics not found for "${query}"\n\nTip: Try format *.lyrics artist - song title*`);
        const lyrics = res.data.lyrics.substring(0, 3000);
        return reply(
          `🎵 *LYRICS — ${res.data.title || title}*\n` +
          `👤 Artist: ${res.data.artist || artist || "Unknown"}\n\n` +
          `${lyrics}${res.data.lyrics.length > 3000 ? "\n\n_...lyrics truncated (too long)_" : ""}`
        );
      }

      // ══════════════════════════════
      // 👤 RANDOM FAKE USER (for testing)
      // ══════════════════════════════
      if (cmd === "randomuser" || cmd === "fakeuser") {
        const res = await axios.get("https://randomuser.me/api/", { timeout: 8000 });
        const u = res.data.results[0];
        const name = `${u.name.first} ${u.name.last}`;
        const dob = new Date(u.dob.date).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
        return reply(
          `👤 *RANDOM USER*\n\n` +
          `📛 Name: ${name}\n` +
          `🚻 Gender: ${u.gender}\n` +
          `📅 DOB: ${dob} (Age: ${u.dob.age})\n` +
          `📧 Email: ${u.email}\n` +
          `📱 Phone: ${u.phone}\n` +
          `🌍 Country: ${u.location.country}\n` +
          `🏙️ City: ${u.location.city}\n` +
          `🔑 Username: ${u.login.username}\n\n` +
          `_This is a randomly generated identity — not a real person_ ℹ️`
        );
      }

    } catch (e) {
      if (e.response?.status === 404) return reply(`❌ Not found. Check your input and try again.`);
      return reply(`❌ Error: ${e.message}`);
    }
  }
};
