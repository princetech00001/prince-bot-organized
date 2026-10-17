import { downloadContentFromMessage } from 'baileys';

export default {
  // Logic runs on every message to 'catch' view-once content
  run: async ({ sock, msg }) => {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    
    // 1. Check if the message contains View-Once content
    const isViewOnce = 
      msg.message?.viewOnceMessageV2?.message || 
      msg.message?.viewOnceMessage?.message;

    if (!isViewOnce) return;

    // 2. Extract the actual media message (Image, Video, or Audio)
    const mediaType = Object.keys(isViewOnce)[0]; // e.g., 'imageMessage', 'videoMessage', 'audioMessage'
    const mediaContent = isViewOnce[mediaType];

    try {
      // 3. Download the media buffer from WhatsApp servers
      const stream = await downloadContentFromMessage(
        mediaContent,
        mediaType.replace('Message', '')
      );
      
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      // 4. Identify the sender
      const sender = msg.key.participant || msg.key.remoteJid;
      const caption = `🛡️ **Anti-ViewOnce Detected**\n\n*Sent by:* @${sender.split('@')[0]}\n*Type:* ${mediaType.replace('Message', '').toUpperCase()}`;

      // 5. Re-send the content back to the group
      if (mediaType === 'imageMessage') {
        await sock.sendMessage(from, { image: buffer, caption, mentions: [sender] });
      } else if (mediaType === 'videoMessage') {
        await sock.sendMessage(from, { video: buffer, caption, mentions: [sender] });
      } else if (mediaType === 'audioMessage') {
        // For audio, we send it as a normal PTT or audio file
        await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/ogg', ptt: true });
        await sock.sendMessage(from, { text: `🛡️ ^ Above was a View-Once Audio from @${sender.split('@')[0]}`, mentions: [sender] });
      }

    } catch (error) {
      console.error("Anti-ViewOnce Error:", error);
      // Optional: Notify the group that a recovery failed
    }
  }
}
