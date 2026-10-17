export default {
  command: ["renamegroup"],

  run: async ({ sock, msg, body }) => {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");

    // 1. Check if the command is being used in a group
    if (!isGroup) {
      return await sock.sendMessage(from, { text: "❌ This command only works in groups!" });
    }

    // 2. Extract the new name (everything after the command)
    const newName = body.slice(body.indexOf(" ") + 1).trim();

    // 3. Validation: Check if a name was actually provided
    if (!newName || body.split(" ").length < 2) {
      return await sock.sendMessage(from, { text: "⚠️ Please provide a new name! \n\n*Example:* .renamegroup My Awesome Group" });
    }

    // 4. Execute the rename
    try {
      await sock.groupUpdateSubject(from, newName);
      await sock.sendMessage(from, { text: `✅ Group name has been changed to: *${newName}*` });
    } catch (error) {
      // Common error: Bot is not an admin
      await sock.sendMessage(from, { text: "❌ Failed to rename. Please make sure the bot is an **Admin**!" });
    }
  }
}