import axios from "axios";

const PICKUP_LINES = [
  "Are you a magician? Because whenever I look at you, everyone else disappears.",
  "Do you have a map? I keep getting lost in your eyes.",
  "Is your name Google? Because you have everything I've been searching for.",
  "If you were a vegetable, you'd be a cute-cumber.",
  "Are you made of copper and tellurium? Because you're Cu-Te.",
  "Do you like raisins? How about a date?",
  "Is there an airport nearby, or is that just my heart taking off?"
];

const COLOR_NAMES = [
  { name: "Cerulean", hex: "#007BA7" }, { name: "Vermilion", hex: "#E34234" },
  { name: "Chartreuse", hex: "#7FFF00" }, { name: "Mauve", hex: "#E0B0FF" },
  { name: "Periwinkle", hex: "#CCCCFF" }, { name: "Amaranth", hex: "#E52B50" },
  { name: "Viridian", hex: "#40826D" }, { name: "Saffron", hex: "#F4C430" }
];

const RANDOM_ANIMALS = ["Axolotl", "Pangolin", "Quokka", "Capybara", "Narwhal", "Okapi", "Tarsier", "Fennec Fox"];
const RANDOM_COUNTRIES = ["Bhutan", "Suriname", "Kiribati", "Eswatini", "Moldova", "Palau", "Comoros", "Tuvalu"];
const RANDOM_FOODS = ["Jollof Rice", "Pad Thai", "Poutine", "Ceviche", "Baklava", "Injera", "Empanada", "Pierogi"];
const RANDOM_WORDS = ["Serendipity", "Petrichor", "Ephemeral", "Luminous", "Mellifluous", "Solitude", "Wanderlust"];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Deterministic "percentage" from two names — same pair always gives the
// same result, like the classic love-calculator novelty.
function pairScore(a, b) {
  const combined = [a, b].sort().join("").toLowerCase();
  let hash = 0;
  for (const ch of combined) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 101;
}

export default {
  command: [
    "dadjoke", "chucknorris", "pickup", "lovecalc", "friendship",
    "colorname", "lorem", "owofy", "decide", "choose",
    "randomanimal", "randomcountry", "randomfood", "randomword"
  ],

  async run({ sock, msg, from, body, cmd }) {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
    const args = body.trim().split(" ").slice(1);

    if (cmd === "dadjoke") {
      try {
        const { data } = await axios.get("https://icanhazdadjoke.com/", {
          headers: { Accept: "application/json" }, timeout: 10000
        });
        return reply(`😄 ${data.joke}`);
      } catch {
        return reply("😄 I'm reading a book about anti-gravity. It's impossible to put down!");
      }
    }

    if (cmd === "chucknorris") {
      try {
        const { data } = await axios.get("https://api.chucknorris.io/jokes/random", { timeout: 10000 });
        return reply(`🥋 ${data.value}`);
      } catch {
        return reply("🥋 Chuck Norris counted to infinity. Twice.");
      }
    }

    if (cmd === "pickup") return reply(`💘 ${pick(PICKUP_LINES)}`);

    if (cmd === "lovecalc") {
      const names = args.join(" ").split(/\s*&\s*|\s+and\s+/i);
      if (names.length < 2) return reply("Usage: .lovecalc <name1> & <name2>");
      const score = pairScore(names[0], names[1]);
      return reply(`💞 *${names[0]}* + *${names[1]}* = ${score}%\n${score > 70 ? "Perfect match! 💍" : score > 40 ? "Could work out 🙂" : "Might be rocky 😅"}`);
    }

    if (cmd === "friendship") {
      const names = args.join(" ").split(/\s*&\s*|\s+and\s+/i);
      if (names.length < 2) return reply("Usage: .friendship <name1> & <name2>");
      const score = pairScore(names[0] + "f", names[1] + "f");
      return reply(`🤝 *${names[0]}* + *${names[1]}* friendship = ${score}%`);
    }

    if (cmd === "colorname") {
      const c = pick(COLOR_NAMES);
      return reply(`🎨 *${c.name}*\nHex: ${c.hex}`);
    }

    if (cmd === "lorem") {
      const count = Math.min(parseInt(args[0]) || 3, 20);
      const base = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");
      const out = Array.from({ length: count }, () =>
        Array.from({ length: 10 + Math.floor(Math.random() * 8) }, () => pick(base)).join(" ") + "."
      ).join(" ");
      return reply(out);
    }

    if (cmd === "owofy") {
      const text = args.join(" ");
      if (!text) return reply("Usage: .owofy <text>");
      const owo = text.replace(/[rl]/g, "w").replace(/[RL]/g, "W").replace(/n([aeiou])/g, "ny$1") + " owo";
      return reply(owo);
    }

    if (cmd === "decide") return reply(pick(["Yes ✅", "No ❌", "Maybe 🤔", "Definitely!", "Ask again later 🔮"]));

    if (cmd === "choose") {
      const options = args.join(" ").split(/\s+or\s+/i).filter(Boolean);
      if (options.length < 2) return reply("Usage: .choose pizza or burger or tacos");
      return reply(`🎯 I choose: *${pick(options)}*`);
    }

    if (cmd === "randomanimal") return reply(`🐾 ${pick(RANDOM_ANIMALS)}`);
    if (cmd === "randomcountry") return reply(`🌍 ${pick(RANDOM_COUNTRIES)}`);
    if (cmd === "randomfood") return reply(`🍽️ ${pick(RANDOM_FOODS)}`);
    if (cmd === "randomword") return reply(`📖 ${pick(RANDOM_WORDS)}`);
  }
};
