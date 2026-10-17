const PI_DIGITS = "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";

const ZODIAC_SIGNS = [
  ["Capricorn", "♑", 1, 19], ["Aquarius", "♒", 2, 18], ["Pisces", "♓", 3, 20],
  ["Aries", "♈", 4, 19], ["Taurus", "♉", 5, 20], ["Gemini", "♊", 6, 20],
  ["Cancer", "♋", 7, 22], ["Leo", "♌", 8, 22], ["Virgo", "♍", 9, 22],
  ["Libra", "♎", 10, 22], ["Scorpio", "♏", 11, 21], ["Sagittarius", "♐", 12, 21],
  ["Capricorn", "♑", 12, 31]
];

const CHINESE_ANIMALS = ["Monkey", "Rooster", "Dog", "Pig", "Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat"];

const FORTUNES = [
  "Small consistent steps turn difficult work into finished work.",
  "A clear plan is often the fastest path through a complicated problem.",
  "Today is a good day to improve one thing and document what changed.",
  "Patience, testing, and careful observation reveal the reliable solution.",
  "The strongest systems are built from simple parts that fail clearly."
];

export default {
  command: ["pi", "hexcolor", "zodiac", "chinese", "chinesezodiac", "fortune", "wisdom"],

  async run({ sock, msg, from, body, cmd }) {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const args = body.trim().split(" ").slice(1);

    if (cmd === "pi") {
      const n = Math.min(Math.max(parseInt(args[0]) || 10, 1), 100);
      return reply(`🥧 *π* to ${n} decimals\n${PI_DIGITS.slice(0, n + 2)}`);
    }

    if (cmd === "hexcolor") {
      const h = (args[0] || "").trim().replace("#", "");
      if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return reply("Usage: .hexcolor #RRGGBB");
      const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
      const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
      const bright = (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "light" : "dark";
      return reply(`🎨 *#${full.toUpperCase()}*\n• RGB  : ${r}, ${g}, ${b}\n• Tone : ${bright}`);
    }

    if (cmd === "zodiac") {
      const m = (args[0] || "").match(/^(\d{1,2})[-/](\d{1,2})$/);
      if (!m) return reply("Usage: .zodiac MM-DD (e.g. .zodiac 06-15)");
      const mo = +m[1], d = +m[2];
      let sign = ZODIAC_SIGNS[ZODIAC_SIGNS.length - 1];
      for (const s of ZODIAC_SIGNS) if (mo < s[2] || (mo === s[2] && d <= s[3])) { sign = s; break; }
      return reply(`🔮 *Zodiac*\nDate: ${mo}-${d}\nSign: ${sign[1]} *${sign[0]}*`);
    }

    if (cmd === "chinese" || cmd === "chinesezodiac") {
      const y = parseInt(args[0]);
      if (isNaN(y) || y < 1900 || y > 2100) return reply("Usage: .chinese YYYY");
      return reply(`🐉 *Chinese Zodiac*\n${y} → *${CHINESE_ANIMALS[y % 12]}*`);
    }

    if (cmd === "fortune" || cmd === "wisdom") {
      const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      return reply(`╭━━━〔 FORTUNE 〕━━━╮\n│ ${fortune}\n╰━━━━━━━━━━━━━━━━━━━━╯`);
    }
  }
};
