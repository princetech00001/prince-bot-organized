// Anime reaction commands (hug, pat, slap, kiss, poke, bonk, wink, cry) —
// adapted from a similar feature in SUKUNA MD. Uses otakugifs.xyz, a public,
// key-free GIF API — no new dependency needed.

const REACTIONS = {
  hug:  { emoji: "🤗", verb: "hugged",  selfVerb: "needs a hug",       api: "hug" },
  pat:  { emoji: "🖐️", verb: "patted",  selfVerb: "wants headpats",    api: "pat" },
  slap: { emoji: "👋", verb: "slapped", selfVerb: "is slapping the air", api: "slap" },
  kiss: { emoji: "💋", verb: "kissed",  selfVerb: "wants a kiss",       api: "kiss" },
  poke: { emoji: "👉", verb: "poked",   selfVerb: "is poking around",   api: "poke" },
  bonk: { emoji: "🔨", verb: "bonked",  selfVerb: "needs a bonk",       api: "punch" },
  wink: { emoji: "😉", verb: "winked at", selfVerb: "is winking",       api: "wink" },
  cry:  { emoji: "😢", verb: "made cry", selfVerb: "is crying",         api: "cry" }
};

async function fetchGifUrl(apiReaction) {
  const res = await fetch(`https://api.otakugifs.xyz/gif?reaction=${apiReaction}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.url || null;
}

export default {
  command: Object.keys(REACTIONS),

  async run({ sock, msg, from, cmd, senderJid }) {
    const reaction = REACTIONS[cmd];
    if (!reaction) return;

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const targetJid = mentioned || quotedParticipant || null;

    const senderTag = `@${(senderJid || from).split("@")[0]}`;
    const caption = targetJid
      ? `${senderTag} ${reaction.verb} @${targetJid.split("@")[0]} ${reaction.emoji}`
      : `${senderTag} ${reaction.selfVerb} ${reaction.emoji}`;
    const mentions = targetJid ? [senderJid || from, targetJid] : [senderJid || from];

    let gifUrl = null;
    try { gifUrl = await fetchGifUrl(reaction.api); } catch {}

    try {
      if (gifUrl) {
        await sock.sendMessage(from, { video: { url: gifUrl }, gifPlayback: true, caption, mentions }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: caption, mentions }, { quoted: msg });
      }
    } catch {
      // Some clients reject the gifPlayback video path for this file — fall
      // back to a plain image, then plain text, so the command never goes silent.
      try {
        await sock.sendMessage(from, { image: { url: gifUrl }, caption, mentions }, { quoted: msg });
      } catch {
        await sock.sendMessage(from, { text: caption, mentions }, { quoted: msg });
      }
    }
  }
};
