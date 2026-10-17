import axios from "axios";

export default {
  command: [
    "crypto", "price", "dictionary",
    "color", "colorinfo",
    "myip",
    "age", "birthday",
    "bmi",
    "roman",
    "morse", "decodemorse",
    "base64", "b64"
  ],

  run: async ({ sock, msg, body, cmd, from }) => {
    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const query = args.join(" ").trim();
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // 🌤️ WEATHER
      // ══════════════════════════════
      if (cmd === "weather") {
        if (!query) return reply("🌤️ Provide a city!\nExample: *.weather Lagos*");
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(query)}?format=j1`, { timeout: 10000 });
        const cur = res.data.current_condition[0];
        const area = res.data.nearest_area[0];
        const city = area.areaName[0].value;
        const country = area.country[0].value;
        const tempC = cur.temp_C;
        const tempF = cur.temp_F;
        const feels = cur.FeelsLikeC;
        const humidity = cur.humidity;
        const wind = cur.windspeedKmph;
        const desc = cur.weatherDesc[0].value;
        const uvIndex = cur.uvIndex;

        const weatherEmoji = desc.toLowerCase().includes("sun") || desc.toLowerCase().includes("clear") ? "☀️"
          : desc.toLowerCase().includes("rain") ? "🌧️"
          : desc.toLowerCase().includes("cloud") ? "☁️"
          : desc.toLowerCase().includes("thunder") ? "⛈️"
          : desc.toLowerCase().includes("snow") ? "❄️"
          : desc.toLowerCase().includes("fog") ? "🌫️" : "🌤️";

        return reply(
          `${weatherEmoji} *WEATHER — ${city}, ${country}*\n\n` +
          `🌡️ Temp: *${tempC}°C / ${tempF}°F*\n` +
          `🤔 Feels like: ${feels}°C\n` +
          `💧 Humidity: ${humidity}%\n` +
          `💨 Wind: ${wind} km/h\n` +
          `☀️ UV Index: ${uvIndex}\n` +
          `📋 Condition: ${desc}\n\n` +
          `_Updated just now_ 🕐`
        );
      }

      // ══════════════════════════════
      // 💰 CRYPTO PRICE
      // ══════════════════════════════
      if (cmd === "crypto" || cmd === "price") {
        const coin = (args[0] || "bitcoin").toLowerCase();
        const map = { btc:"bitcoin", eth:"ethereum", bnb:"binancecoin", sol:"solana", doge:"dogecoin", ada:"cardano", xrp:"ripple", ltc:"litecoin" };
        const id = map[coin] || coin;
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd,ngn&include_24hr_change=true`, { timeout: 10000 });
        const data = res.data[id];
        if (!data) return reply(`❌ Coin not found: *${coin}*\n\nTry: btc, eth, bnb, sol, doge, ada, xrp`);
        const change = data.usd_24h_change?.toFixed(2) || "N/A";
        const arrow = parseFloat(change) >= 0 ? "📈" : "📉";
        return reply(
          `💰 *CRYPTO PRICE — ${id.toUpperCase()}*\n\n` +
          `💵 USD: *$${data.usd?.toLocaleString()}*\n` +
          `🟢 NGN: ₦${data.ngn?.toLocaleString()}\n` +
          `${arrow} 24h Change: ${change}%\n\n` +
          `_Data from CoinGecko_ 📊`
        );
      }

      // ══════════════════════════════
      // 📖 DICTIONARY
      // ══════════════════════════════
      if (cmd === "define" || cmd === "dictionary") {
        if (!query) return reply("📖 Provide a word!\nExample: *.define serendipity*");
        const word = args[0];
        const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeout: 8000 });
        const entry = res.data[0];
        const phonetic = entry.phonetic || entry.phonetics?.[0]?.text || "";
        const meanings = entry.meanings.slice(0, 2);
        let text = `📖 *DICTIONARY — "${word}"*\n`;
        if (phonetic) text += `🔊 ${phonetic}\n`;
        text += "\n";
        for (const m of meanings) {
          text += `🔹 *${m.partOfSpeech}*\n`;
          const defs = m.definitions.slice(0, 2);
          for (const d of defs) {
            text += `   • ${d.definition}\n`;
            if (d.example) text += `   _e.g. "${d.example}"_\n`;
          }
          text += "\n";
        }
        return reply(text.trim());
      }

      // ══════════════════════════════
      // 🎨 COLOR INFO
      // ══════════════════════════════
      if (cmd === "color" || cmd === "colorinfo") {
        const hex = (args[0] || "").replace("#", "").trim();
        if (!hex || hex.length !== 6) return reply("🎨 Provide a hex color!\nExample: *.color FF5733*");
        const r = parseInt(hex.substring(0,2), 16);
        const g = parseInt(hex.substring(2,4), 16);
        const b = parseInt(hex.substring(4,6), 16);
        const brightness = Math.round((r * 299 + g * 587 + b * 114) / 1000);
        const light = brightness > 128 ? "Light" : "Dark";
        return reply(
          `🎨 *COLOR INFO — #${hex.toUpperCase()}*\n\n` +
          `🔴 Red: ${r}\n` +
          `🟢 Green: ${g}\n` +
          `🔵 Blue: ${b}\n` +
          `☀️ Brightness: ${brightness} (${light})\n` +
          `🔗 HEX: #${hex.toUpperCase()}\n` +
          `📦 RGB: rgb(${r}, ${g}, ${b})\n\n` +
          `_Use this for design work_ 🖌️`
        );
      }

      // ══════════════════════════════
      // 🎂 AGE CALCULATOR
      // ══════════════════════════════
      if (cmd === "age" || cmd === "birthday") {
        if (!query) return reply("🎂 Provide your birth date!\nExample: *.age 2000-05-15*");
        const birth = new Date(args[0]);
        if (isNaN(birth)) return reply("❌ Invalid date! Use format: YYYY-MM-DD\nExample: *.age 2000-05-15*");
        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        let months = now.getMonth() - birth.getMonth();
        if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
          years--; months += 12;
        }
        const days = Math.floor((now - birth) / 86400000);
        const nextBday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
        if (nextBday < now) nextBday.setFullYear(now.getFullYear() + 1);
        const daysLeft = Math.ceil((nextBday - now) / 86400000);
        return reply(
          `🎂 *AGE CALCULATOR*\n\n` +
          `📅 Born: ${birth.toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" })}\n\n` +
          `🎉 Age: *${years} years, ${months} months*\n` +
          `📆 Total days alive: *${days.toLocaleString()} days*\n` +
          `🎈 Next birthday in: *${daysLeft} days*\n\n` +
          `_${daysLeft <= 7 ? "🎉 Birthday is very soon!" : "Keep growing! 💪"}_`
        );
      }

      // ══════════════════════════════
      // ⚖️ BMI CALCULATOR
      // ══════════════════════════════
      if (cmd === "bmi") {
        if (args.length < 2) return reply("⚖️ Provide weight (kg) and height (cm)!\nExample: *.bmi 70 175*");
        const weight = parseFloat(args[0]);
        const heightCm = parseFloat(args[1]);
        if (isNaN(weight) || isNaN(heightCm)) return reply("❌ Invalid numbers provided.");
        const heightM = heightCm / 100;
        const bmi = (weight / (heightM * heightM)).toFixed(1);
        let category, emoji;
        if (bmi < 18.5) { category = "Underweight"; emoji = "😟"; }
        else if (bmi < 25) { category = "Normal weight"; emoji = "✅"; }
        else if (bmi < 30) { category = "Overweight"; emoji = "⚠️"; }
        else { category = "Obese"; emoji = "🚨"; }
        return reply(
          `⚖️ *BMI CALCULATOR*\n\n` +
          `💪 Weight: ${weight} kg\n` +
          `📏 Height: ${heightCm} cm\n\n` +
          `📊 Your BMI: *${bmi}*\n` +
          `${emoji} Category: *${category}*\n\n` +
          `_BMI Scale:_\n• <18.5 = Underweight\n• 18.5–24.9 = Normal\n• 25–29.9 = Overweight\n• 30+ = Obese`
        );
      }

      // ══════════════════════════════
      // 🔢 ROMAN NUMERALS
      // ══════════════════════════════
      if (cmd === "roman") {
        if (!query) return reply("🔢 Provide a number!\nExample: *.roman 2024*");
        const num = parseInt(query);
        if (isNaN(num) || num < 1 || num > 3999) return reply("❌ Please provide a number between 1 and 3999.");
        const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
        const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
        let result = ""; let n = num;
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
        }
        return reply(`🔢 *ROMAN NUMERALS*\n\n🔹 Arabic: *${num}*\n🔹 Roman: *${result}*`);
      }

      // ══════════════════════════════
      // 📡 MORSE CODE
      // ══════════════════════════════
      if (cmd === "morse") {
        if (!query) return reply("📡 Provide text to convert!\nExample: *.morse Hello*");
        const map = {
          A:".-", B:"-...", C:"-.-.", D:"-..", E:".", F:"..-.", G:"--.", H:"....", I:"..", J:".---",
          K:"-.-", L:".-..", M:"--", N:"-.", O:"---", P:".--.", Q:"--.-", R:".-.", S:"...", T:"-",
          U:"..-", V:"...-", W:".--", X:"-..-", Y:"-.--", Z:"--..",
          "0":"-----","1":".----","2":"..---","3":"...--","4":"....-","5":".....",
          "6":"-....","7":"--...","8":"---..","9":"----."," ":"/"
        };
        const morse = query.toUpperCase().split("").map(c => map[c] || "?").join(" ");
        return reply(`📡 *MORSE CODE*\n\n📝 Text: ${query}\n🔊 Morse: \`\`\`${morse}\`\`\``);
      }

      // ══════════════════════════════
      // 🔐 BASE64
      // ══════════════════════════════
      if (cmd === "base64" || cmd === "b64") {
        if (!query) return reply("🔐 Provide text!\nExample: *.base64 encode Hello World*\n*.base64 decode SGVsbG8gV29ybGQ=*");
        const action = args[0]?.toLowerCase();
        const text = args.slice(1).join(" ");
        if (action === "encode" && text) {
          const encoded = Buffer.from(text).toString("base64");
          return reply(`🔐 *BASE64 ENCODE*\n\n📥 Input: ${text}\n📤 Output: \`\`\`${encoded}\`\`\``);
        }
        if (action === "decode" && text) {
          try {
            const decoded = Buffer.from(text, "base64").toString("utf8");
            return reply(`🔓 *BASE64 DECODE*\n\n📥 Input: ${text}\n📤 Output: ${decoded}`);
          } catch { return reply("❌ Invalid base64 string."); }
        }
        return reply("🔐 Usage:\n*.base64 encode Hello World*\n*.base64 decode SGVsbG8gV29ybGQ=*");
      }

    } catch (e) {
      if (e.response?.status === 404) return reply(`❌ Not found. Check your input and try again.`);
      return reply(`❌ Error: ${e.message}`);
    }
  }
};
