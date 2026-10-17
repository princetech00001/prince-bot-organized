import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BOT_CONFIG } from "../../config.js";
import { fancy } from "../../utils/fancyFont.js";
import { getMenuMedia } from "../../utils/menuMedia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNER_PATH = path.join(__dirname, "..", "..", "assets", "prince_banner.png");

function getUptime() {
  const u = process.uptime();
  const d = Math.floor(u / 86400);
  const h = Math.floor((u % 86400) / 3600);
  const m = Math.floor((u % 3600) / 60);
  const s = Math.floor(u % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getCpuUsage() {
  const cpus = os.cpus();
  const cpu = cpus[0];
  const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
  return (((total - cpu.times.idle) / total) * 100).toFixed(1);
}

function getWATTime() {
  const now = new Date();
  const wat = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let hours = wat.getHours();
  const mins = String(wat.getMinutes()).padStart(2, "0");
  const secs = String(wat.getSeconds()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return {
    date: `${days[wat.getDay()]}, ${String(wat.getDate()).padStart(2,"0")} ${months[wat.getMonth()]} ${wat.getFullYear()}`,
    time: `${hours}:${mins}:${secs} ${ampm} WAT`
  };
}

// One line per command, star + crown bullet, under a category header.
function section(title, commands, p) {
  const lines = commands.map(c => `⭐👑 *${p}${c}*`).join("\n");
  return `${fancy(title)}\n${lines}`;
}

export default {
  command: ["menu", "help", "start"],

  async run({ sock, msg, from, senderNumber, senderJid, deployedBy, botMode }) {
    const mode = botMode || "public";
    const { date, time } = getWATTime();
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - (os.freemem() / 1024 / 1024 / 1024)).toFixed(2);
    const mentionJid = senderJid || from;
    const p = BOT_CONFIG.PREFIX || ".";
    const modeEmoji = mode === "public" ? "🌍" : mode === "private" ? "🔒" : "👥";

    const quotes = [
      "「 Don't worry, I'm the strongest. 」",
      "「 Limitless. That's what I am. 」",
      "「 Power is not given. It is taken. 」",
      "「 I don't need luck. I have skill. 」"
    ];
    const q = quotes[Math.floor(Math.random() * quotes.length)];

    const header = [
      `✨👑 *${fancy("PRINCE X UNKNOWN BOT")}* 👑✨`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `👑 ${fancy("Owner")}      : ${fancy(BOT_CONFIG.OWNER_NAME)}`,
      `🚀 ${fancy("Deployed By")} : ${fancy(deployedBy || BOT_CONFIG.OWNER_NAME)}`,
      `📅 ${fancy("Date")}   : ${date}`,
      `🕐 ${fancy("Time")}   : ${time}`,
      `⏱️ ${fancy("Uptime")} : ${getUptime()}`,
      `💾 ${fancy("RAM")}    : ${usedMem}GB / ${totalMem}GB`,
      `💻 ${fancy("CPU")}    : ${getCpuUsage()}%   ${modeEmoji} ${fancy(mode.toUpperCase())}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ].join("\n");

    const premium = [
      `💎 *${fancy("PREMIUM COMMANDS")}*`,
      ...["getplugin", "listplugins", "aiscan"].map(c => `⭐👑 *${p}${c}*`),
      "",
      `📩 ${fancy("Contact owner to unlock")}: wa.me/${BOT_CONFIG.OWNER[0]}`,
      `ℹ️ ${fancy("Already have a code")}? → ${p}unlockpremium <code>`
    ].join("\n");

    const sections = [
      section("📦 *BASIC*", ["menu","help","ping","alive","botstatus","botstats","runtime","time","uptime","myid","mynumber","repo"], p),
      section("🔍 *SEARCH*", ["yts","lyrics","define","weather","wiki","google","image","bible","quran","github","iplookup","crypto","currency","number","randomuser","download","earthquake","apod","npmwatch","pypiwatch"], p),
      section("🎉 *FUN*", ["fact","joke","meme","quote","roast","compliment","ship","rate","wyr","8ball","dice","coinflip","riddle","horoscope","truth","dare","nhie","advice","emojimix","would","dadjoke","chucknorris","pickup","lovecalc","friendship","colorname","lorem","owofy","decide","choose","randomanimal","randomcountry","randomfood","randomword","pi","hexcolor","zodiac","chinese","fortune"], p),
      section("🤗 *REACTIONS*", ["hug","pat","slap","kiss","poke","bonk","wink","cry"], p),
      section("🎮 *GAMES*", ["ttt","guess","trivia","answer","rps","truthordare","squidgame"], p),
      section("🎵 *MUSIC/DOWNLOAD*", ["play","song2","ytv","spotify","soundcloud","apk","tiktok","instagram","facebook","itunes","savestatus"], p),
      section("💡 *UTILITY*", ["calc","sticker","toimg","attp","ttp","qr","translate","tts","shorten","ss","password","countdown","reverse","wordcount","base64","roman","morse","bmi","age","color","remindme","afk","back"], p),
      section("🤖 *AI CHAT*", ["claude","gemini","gpt","gpt5","gptx","glm","ai","aistatus","aiclear","jailbreak"], p),
      section("🎨 *AI IMAGE*", ["flux","fluxpro","fluxedit","gptedit","nano","nano2","nanopro","faceswap","txt2img"], p),
      section("👁️ *AI VISION*", ["qwen","wrmgpt","gemflash"], p),
      section("🎵 *AI AUDIO*", ["suno","tts","ttsv3"], p),
      section("📥 *MISC DOWNLOADS*", ["gdrive","mediafire","gitclone"], p),
      section("🖼️ *PHOTO/LOGO*", ["glowingtext","neontext","3dtext","burntext","icetext","matrix","rainbowtext","firelogo","cyberpunk","graffiti","pixeltext","retrowave","removebg","enhanceimg","colorize","greyscale","sepia","blur","sharpen","mirror","flip","addcaption","addwatermark","sticker","logomaker"], p),
      section("🔐 *ADMIN*", ["kick","add","promote","demote","ban","unban","softban","mute","unmute","muteall","unmuteall","tagall","warn","warnings","clearwarn","resetwarn","warnlimit","admincheck","antilink","invitelink","revoke","pinmsg","unpinmsg","purge","adminlist"], p),
      section("🌍 *GROUP*", ["open","close","setname","setdesc","link","resetlink","setrules","rules","welcome","goodbye","setgreeting","setbye","groupinfo","groupstats","lockgroup","unlockgroup","slowmode","onlyadmin","everyone","tagadmin","poll","totalmembers","exportmembers"], p),
      section("👥 *GROUP PLUS*", ["closetime","opentime","settimezone","notes","adminnotes","votekick","topchatters","activity","inactive","streak","pin","unpin","invite","report","announce"], p),
      section("📅 *GROUP PLUS 2*", ["event","eventlist","eventremove","groupcalendar","groupfaq","groupnotice","grouprecap","groupbackup","grouprestore","grouptemplate","memberroles","membertag","schedule","quiz"], p),
      section("🎮 *GAMES PLUS*", ["scramble","scrabble","sudoku","snake","whot","cyber","dash","matrix","doom","vampire"], p),
      section("🛡️ *PROTECTION*", ["antichannel","antimention","mentionlimit","antipicture","antivideo","mediaonly","textonly","capslock","profanity","floodlimit","linkpolicy","linkallow","restrict","jail","unjail","warnconfig","modlog","adminlog","modreport","memberhistory","permissionaudit"], p),
      section("🚪 *JOIN CONTROL*", ["antijoin","antiraid","guard","joinapproval","approve","antihijack","introcard","intro","introset","setwelcomemsg","setgoodbyemsg"], p),
      section("🧰 *ADMIN TOOLS*", ["listadmins","membercount","listactive","getgpp","setgpp","device","categories","listmenu","games","setmenuimage","setmenuvideo","setmenugif","resetmenuimage","resetmenuvideo","resetmenugif","confirmkick","deploy"], p),
      section("⚙️ *BOT SETTINGS*", ["alwaysonline","anticall","antidelete","antiedit","autobio","autoblock","autoreact","autoread","autorecord","autotype","chatbot","setprefix","antibot","antibadword","autoviewstatus","autoreactstatus"], p),
      section("🧠 *AI FIXER (OWNER)*", ["applyfix","aitest","aidisable","aienable"], p),
      section("👑 *OWNER*", ["restart","shutdown","bc","sendas","join","leave","setbio","setppbot","setmenu","mode","public","private","block","unblock","block2","unblock2","globalban","globalunban","banlist","warn2","warnlist","resetwarn2","clearwarns","addowner","removeowner","ownerlist","promote2","demote2","massdm","kickall","tagadmins","grouplist2","listgroups","getgroups","getgroupinfo","copygroup"], p),
      section("🔗 *PAIR*", ["pair"], p)
    ].join("\n\n");

    const menuText = [
      header,
      "",
      premium,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      sections,
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      q,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      `🚀👑 *${fancy("POWERED BY PRINCE TECH")}* 👑🚀`
    ].join("\n");

    try {
      // custom menu media (set with .setmenuimage / .setmenuvideo / .setmenugif) comes first
      const media = getMenuMedia();
      if (media && media.type !== "image") {
        await sock.sendMessage(from, {
          video: { url: media.path }, gifPlayback: media.type === "gif",
          caption: menuText, mentions: [mentionJid]
        }, { quoted: msg });
        return;
      }
      await sock.sendMessage(from, {
        image: media?.type === "image" ? { url: media.path }
          : fs.existsSync(BANNER_PATH) ? { url: BANNER_PATH } : { url: "https://files.catbox.moe/y8joob.jpg" },
        caption: menuText,
        mentions: [mentionJid]
      }, { quoted: msg });
    } catch {
      await sock.sendMessage(from, {
        text: menuText,
        mentions: [mentionJid]
      }, { quoted: msg });
    }
  }
};
