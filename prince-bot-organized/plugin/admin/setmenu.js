import fs from "fs";
import { BOT_CONFIG } from "../../config.js";

const MENU_FILE = "./menu-variant.json";

function loadVariant() {
  try {
    if (fs.existsSync(MENU_FILE))
      return JSON.parse(fs.readFileSync(MENU_FILE)).variant || 2;
  } catch (e) {}
  return 2;
}

function saveVariant(id) {
  fs.writeFileSync(MENU_FILE, JSON.stringify({ variant: id }, null, 2));
}

const VARIANTS = {
  v1:  { id: 1,  name: "Simple",               desc: "Image only, no extra context" },
  v2:  { id: 2,  name: "Standard",             desc: "Image + full contextInfo (default)" },
  v3:  { id: 3,  name: "Document",             desc: "Document + thumbnail + verified quoted" },
  v4:  { id: 4,  name: "Video",                desc: "Video + contextInfo + verified quoted" },
  v5:  { id: 5,  name: "Button",               desc: "Image + quick-reply buttons" },
  v6:  { id: 6,  name: "Document Premium",     desc: "Document + 1280x450 thumbnail + full contextInfo" },
  v7:  { id: 7,  name: "Carousel",             desc: "Swipeable cards per category" },
  v8:  { id: 8,  name: "Minimalist",           desc: "Image + ftroli quoted + fresh design" },
  v9:  { id: 9,  name: "NativeFlow Basic",     desc: "Interactive + limited_time_offer + single_select" },
  v10: { id: 10, name: "NativeFlow Extended",  desc: "Full interactive menu style" },
  v11: { id: 11, name: "Document Interactive", desc: "Document + nativeFlowMessage + CTA buttons" },
  v12: { id: 12, name: "Classic Grid",         desc: "Bold grid layout with category icons" },
  v13: { id: 13, name: "Canvas Thumbnail",     desc: "Document V6 + Canvas banner thumbnail" },
  v14: { id: 14, name: "Dark Theme",           desc: "Dark aesthetic border style" },
  v15: { id: 15, name: "Compact Pro",          desc: "Compact single-column power layout" },
};

export default {
  command: ["setmenu", "menuvariant", "menustyle", "setdesign", "menudesign"],

  async run({ sock, msg, from, body, isOwner }) {
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    if (!isOwner) {
      return reply(
        `❌ *ACCESS DENIED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Only the bot owner can change the menu variant.\n` +
        `━━━━━━━━━━━━━━━━━━━━━`
      );
    }

    const args  = body.trim().split(" ").slice(1);
    const input = args[0]?.toLowerCase();
    const current = loadVariant();

    // No arg — show list
    if (!input) {
      const lines = Object.entries(VARIANTS).map(([key, val]) =>
        `${val.id === current ? "✅" : "▫️"} *${key.toUpperCase()}* — _${val.desc}_`
      ).join("\n");

      return reply(
        `🎨 *SET MENU VARIANT*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Current: *V${current}* — _${VARIANTS["v" + current]?.name || "Unknown"}_\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `${lines}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Usage: .setmenu v1  to  .setmenu v15_`
      );
    }

    // Validate
    const selected = VARIANTS[input];
    if (!selected) {
      return reply(
        `❌ *"${input}"* is not valid.\n\n` +
        `Use: .setmenu v1  to  .setmenu v15\n` +
        `Type *.setmenu* to see all options.`
      );
    }

    // Already set
    if (selected.id === current) {
      return reply(
        `ℹ️ Already using *V${selected.id} — ${selected.name}*\n\n` +
        `No change needed.`
      );
    }

    saveVariant(selected.id);

    return reply(
      `✅ *MENU VARIANT UPDATED*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 Variant : *V${selected.id}*\n` +
      `🎨 Name    : *${selected.name}*\n` +
      `📝 Desc    : _${selected.desc}_\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Type *.menu* to see the result.`
    );
  }
};
