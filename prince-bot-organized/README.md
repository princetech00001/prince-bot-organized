<div align="center">

# 👑 PRINCE BOT

**Advanced WhatsApp Bot — Built by Prince Dev™**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp)](https://wa.me/2349033168045)
[![GitHub](https://img.shields.io/badge/GitHub-Prince--Dev-black?style=for-the-badge&logo=github)](https://github.com)

> A powerful, feature-rich WhatsApp bot with 300+ commands including AI, group management, media tools, owner controls, and much more.

</div>

---

## 📡 Contact & Support

| Platform | Link |
|----------|------|
| 💬 WhatsApp | [wa.me/2349033168045](https://wa.me/2349033168045) |
| 🤖 Bot Issues | Contact Prince Dev™ directly |

---

## ✨ Features

- 🤖 **AI Chat** — GPT, Gemini, custom AI models
- 🎵 **Media** — YouTube, TikTok, Instagram downloads
- 🛡️ **Group Tools** — Kick, ban, warn, mute, anti-link, anti-bot
- 👑 **Owner Tools** — Broadcast, global ban, ghost mode, mass DM
- 💀 **Hijack** — Take over any group where bot is admin
- 🌍 **Info Tools** — Weather, crypto, Wikipedia, IP lookup, currency
- 🎮 **Fun** — Trivia, riddles, 8ball, ship meter, would you rather
- 🔗 **Anti-Link** — Auto-detect & delete links, warn then kick
- 📢 **Broadcast** — Send messages to all groups at once
- ⚙️ **Settings** — Public/private mode, auto-read, always online

---

## 🚀 Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/prince-bot.git
cd prince-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure the bot
Edit `config.js` and set your details:
```js
export const BOT_CONFIG = {
  PREFIX: ".",
  BOT_NAME: "PRINCE BOT",
  OWNER: ["YOUR_NUMBER_HERE"],   // e.g. "2349033168045"
  PAIR_NUMBER: "YOUR_NUMBER_HERE",
  MODE: "public",
  WELCOME: true
}
```

### 4. Start the bot
```bash
bash start.sh
```

### 5. Scan QR / Pair
- A QR code will appear — scan it with WhatsApp
- Or use the pairing code method

---

## 📁 File Structure

```
prince-bot/
├── index.js              # Main bot entry point
├── config.js             # Bot configuration
├── package.json          # Dependencies
├── start.sh              # Startup script
├── .npmrc                # npm config (uses /tmp cache)
├── plugin/               # All command plugins
│   ├── group.js          # Group management (50+ cmds)
│   ├── ownertools.js     # Owner-only commands
│   ├── hijack.js         # Group takeover
│   ├── advanced.js       # Info & entertainment
│   ├── mediatools.js     # Sticker, TTS, QR, screenshot
│   ├── aifinalboss.js    # AI commands
│   ├── menu.js           # Menu system
│   └── ...               # 30+ more plugins
└── sessions/             # ⚠️ Auto-created — NOT in git
```

---

## ⚙️ Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `PREFIX` | Command prefix | `.` |
| `BOT_NAME` | Bot display name | `PRINCE BOT` |
| `OWNER` | Your WhatsApp number (with country code, no +) | — |
| `PAIR_NUMBER` | Number for pairing | — |
| `MODE` | `public` or `private` | `public` |
| `WELCOME` | Enable welcome messages | `true` |

---

## 🔒 Security Notes

> ⚠️ **IMPORTANT** — Never push your `sessions/` folder to GitHub. It contains your WhatsApp authentication and gives full access to your account.

The `.gitignore` already protects:
- `sessions/` — WhatsApp auth
- `group-settings.json` — Group data
- `globalban.json` — Ban list
- `extra-owners.json` — Co-owner list
- `bot-settings.json` — Runtime settings

---

## 📦 Hosting

### Bot Hosting Panel (Recommended)
1. Upload the zip to your panel
2. Set startup file to `start.sh`
3. Start the bot

### VPS / Server
```bash
# Install PM2 for 24/7 uptime
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### Free Hosting
Works on:
- [bot-hosting.net](https://bot-hosting.net)
- Any Node.js compatible host

---

## 🛠️ Commands Overview

| Category | Count | Example |
|----------|-------|---------|
| Group Tools | 50+ | `.kick @user`, `.mute`, `.ban` |
| Owner Tools | 25+ | `.bc message`, `.ghostmode` |
| AI Commands | 10+ | `.gpt hello`, `.gemini explain` |
| Fun & Games | 20+ | `.trivia`, `.8ball`, `.ship` |
| Info Tools | 15+ | `.weather Lagos`, `.crypto btc` |
| Media Tools | 10+ | `.sticker`, `.tts hello`, `.qr` |
| Hijack | 4 | `.hijack`, `.takeover` |

**Total: 300+ commands**

---

## 📜 License

This bot is private software built by **Prince Dev™**.

For bot issues, advanced fixes, and exclusive services:
**Contact: [wa.me/2349033168045](https://wa.me/2349033168045)**

---

<div align="center">
Made with 👑 by <b>Prince Dev™</b>
</div>
