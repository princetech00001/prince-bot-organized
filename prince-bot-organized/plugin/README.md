# Plugin folder layout

Every plugin lives in `plugin/<category>/<name>.js`. The bot finds them by
itself, at any folder depth, so you never register a plugin anywhere.

| Folder | What goes here |
| --- | --- |
| `admin/` | Bot settings, menu, mode, status, auto-react / auto-reply |
| `ai/` | AI chat and AI image / music / voice tools |
| `downloader/` | Music, video and file downloaders |
| `fun/` | Jokes, reactions, random fun commands |
| `games/` | Games |
| `general/` | Bot info, owner info, ids, repo |
| `group/` | Group management and group tools |
| `media/` | Stickers and media conversion |
| `moderation/` | Anti-link, anti-bot, bad words, protection |
| `owner/` | Owner-only tools, premium, plugin tools |
| `search/` | Web, Bible, Quran, lyrics, weather search |
| `textmaker/` | Logo and text-effect makers |
| `utility/` | Calculators, converters, lookups |

## Add a new plugin

1. Pick the folder that fits (or create a new one, for example `plugin/anime/`).
2. Create a file in it, for example `plugin/fun/hello.js`:

```js
export default {
  command: ["hello", "hi"],

  run: async ({ sock, msg, from, body, cmd }) => {
    from = from || msg.key.remoteJid;
    await sock.sendMessage(from, { text: "Hello!" }, { quoted: msg });
  }
};
```

3. Restart the bot. The console prints `✅ Loaded: fun/hello.js`.

## Rules

- Inside a category folder, import shared files with `../../`, for example
  `import { BOT_CONFIG } from "../../config.js";`
- File names must be unique across all folders.
- A file whose name starts with `disabled-` is skipped by the loader.
- Files that are not command plugins (helpers, servers) belong in `utils/`.

## Group tools (welcome, goodbye, warn, anti-link)

These four features share one settings file, `data/group-guard.json`, so a
setting you change with a command is exactly what the bot uses.

| Command | What it does |
| --- | --- |
| `.welcome on / off / set <text> / reset / test` | Greets new members (with their profile photo when they have one) |
| `.goodbye on / off / set <text> / reset / test` | Message when someone leaves |
| `.warn @user [reason]` | Warns a member; at the limit they are removed |
| `.warnings [@user]` | One member's warnings, or everyone who has warnings |
| `.resetwarn @user` | Clears a member's warnings |
| `.warnlimit <1-10>` | Sets how many warnings before removal (default 3) |
| `.antilink on / off / status` | Turns link blocking on or off |
| `.antilink mode delete / warn / kick` | What happens when a member sends a link |
| `.antilink allow <domain>` / `unallow` / `list` | Domains that are always allowed |

Text placeholders for welcome and goodbye: `{user}` (tags the member),
`{group}`, `{count}`, `{desc}`.

Admins, the owner and real bot commands are never touched by anti-link.
The bot must be a group admin to delete links or remove members.

Code: `utils/groupStore.js` (settings), `utils/linkGuard.js` (anti-link),
`utils/welcomeGuard.js` (welcome/goodbye), `utils/groupAdmin.js` (admin checks).
