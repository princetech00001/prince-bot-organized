import axios from "axios";
import fs from "fs";

const DB_FILE = "./gpt_memory.json";

// ================= MEMORY =================
let db = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
  : {};

const saveDB = () => {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
};

const getUser = (id) => {
  if (!db[id]) {
    db[id] = { history: [], mode: "normal" };
  }
  return db[id];
};

// ================= MODES =================
const SYSTEM = {
  normal: "You are a helpful AI assistant.",
  coder: "You are a senior software engineer. Be precise and technical.",
  teacher: "Explain simply like a teacher.",
  savage: "Funny but respectful savage replies."
};

const getSystemPrompt = (mode) => SYSTEM[mode] || SYSTEM.normal;

// ================= UTIL =================
const splitText = (text, size = 3500) => {
  const parts = [];
  for (let i = 0; i < text.length; i += size) {
    parts.push(text.slice(i, i + size));
  }
  return parts;
};

const escapeRegex = (s) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ================= GPT =================
async function askAI(context) {
  try {
    const res = await axios.get(
      "https://api.zenzxz.my.id/ai/copilot",
      {
        params: {
          message: context,
          model: "gpt-5"
        },
        timeout: 20000
      }
    );

    return res.data?.result?.text || null;
  } catch (err) {
    console.log("GPT error:", err.message);
    return null;
  }
}

// ================= IMAGE ENGINE =================
function buildStrongPrompt(prompt) {
  return `
Ultra realistic cinematic 8K digital artwork.

STRICT RULES:
- Follow instruction EXACTLY
- Do NOT simplify or remove objects
- Render all details clearly
- Professional lighting and composition

SCENE:
${prompt}

STYLE:
hyper-detailed, cinematic lighting, sharp focus, realistic rendering
`;
}

async function generateImage(prompt) {
  try {
    const safePrompt = encodeURIComponent(prompt.slice(0, 800));

    const url = `https://image.pollinations.ai/prompt/${safePrompt}`;

    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000
    });

    const type = res.headers["content-type"];

    if (!type?.includes("image")) return null;

    return Buffer.from(res.data);
  } catch (err) {
    console.log("Image error:", err.message);
    return null;
  }
}

// ================= BOT =================
export default {
  command: ["gpt"],
  category: "ai",

  run: async ({ sock, msg, from, body, prefix = "." }) => {
    const text =
      body ||
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    const input = text
      .trim()
      .replace(
        new RegExp(`^${escapeRegex(prefix)}(gpt|ai)\\s*`, "i"),
        ""
      );

    const user = getUser(from);

    // ================= IMAGE =================
    if (input.startsWith("img ")) {
      const prompt = input.slice(4).trim();

      if (!prompt) {
        return sock.sendMessage(
          from,
          { text: "🖼 Example:\n.gpt img 12 planets in orbit" },
          { quoted: msg }
        );
      }

      await sock.sendMessage(from, {
        react: { text: "🎨", key: msg.key }
      });

      const strongPrompt = buildStrongPrompt(prompt);
      const image = await generateImage(strongPrompt);

      if (!image || image.length < 1000) {
        await sock.sendMessage(from, {
          react: { text: "❌", key: msg.key }
        });

        return sock.sendMessage(
          from,
          { text: "❌ Image failed. Try clearer prompt." },
          { quoted: msg }
        );
      }

      await sock.sendMessage(from, {
        react: { text: "✅", key: msg.key }
      });

      return sock.sendMessage(
        from,
        {
          image,
          caption: `🖼 AI IMAGE\n\nOriginal: ${prompt}`
        },
        { quoted: msg }
      );
    }

    // ================= EMPTY =================
    if (!input) {
      return sock.sendMessage(
        from,
        {
          text:
            "🤖 AI BOT\n\nCommands:\n.gpt hello\n.gpt img cat in space\n.gpt mode coder\n.gpt reset\n.gpt status"
        },
        { quoted: msg }
      );
    }

    // ================= RESET =================
    if (input === "reset") {
      user.history = [];
      saveDB();

      return sock.sendMessage(
        from,
        { text: "🧹 Memory cleared." },
        { quoted: msg }
      );
    }

    // ================= STATUS =================
    if (input === "status") {
      return sock.sendMessage(
        from,
        {
          text: `📊 STATUS\nMode: ${user.mode}\nMemory: ${user.history.length}`
        },
        { quoted: msg }
      );
    }

    // ================= MODE =================
    if (input.startsWith("mode ")) {
      const mode = input.split(" ")[1];

      if (!SYSTEM[mode]) {
        return sock.sendMessage(
          from,
          {
            text: "❌ Modes: normal, coder, teacher, savage"
          },
          { quoted: msg }
        );
      }

      user.mode = mode;
      saveDB();

      return sock.sendMessage(
        from,
        { text: `🎭 Mode changed → ${mode}` },
        { quoted: msg }
      );
    }

    // ================= CHAT =================
    await sock.sendPresenceUpdate("composing", from);
    await sock.sendMessage(from, {
      react: { text: "🧠", key: msg.key }
    });

    user.history.push({ role: "user", text: input });

    const context =
      `${getSystemPrompt(user.mode)}\n\n` +
      user.history
        .slice(-10)
        .map((m) => `${m.role}: ${m.text}`)
        .join("\n");

    let reply = await askAI(context);

    if (!reply) {
      reply = await askAI(context); // retry once
    }

    if (!reply) {
      return sock.sendMessage(
        from,
        { text: "❌ AI failed" },
        { quoted: msg }
      );
    }

    user.history.push({ role: "assistant", text: reply });

    if (user.history.length > 25) {
      user.history = user.history.slice(-25);
    }

    saveDB();

    await sock.sendMessage(from, {
      react: { text: "✅", key: msg.key }
    });

    for (const part of splitText(reply)) {
      await sock.sendMessage(
        from,
        {
          text: `🤖 AI (${user.mode})\n\n${part}`
        },
        { quoted: msg }
      );
    }
  }
};