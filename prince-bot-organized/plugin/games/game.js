import axios from "axios";

// In-memory game state store
const gameState = new Map();

export default {

  command: [
    "ttt", "tictactoe",
    "guess", "guessnumber",
    "dice", "roll",
    "trivia",
    "truth", "dare", "truthordare",
    "squidgame",
    "rps", "rockpaperscissors"
  ],

  run: async ({ sock, msg, body, cmd, from, senderJid }) => {

    from = from || msg.key.remoteJid;
    const args = body.trim().split(" ").slice(1);
    const sender = senderJid || from;
    const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });

    try {

      // ══════════════════════════════
      // 🎲 DICE ROLL
      // ══════════════════════════════

      if (cmd === "dice" || cmd === "roll") {
        const sides = parseInt(args[0]) || 6;
        if (sides < 2 || sides > 100) return reply("🎲 Dice sides must be between 2 and 100.");
        const result = Math.floor(Math.random() * sides) + 1;
        const faces = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };
        const face = sides === 6 ? (faces[result] + " ") : "";
        return reply(`🎲 *DICE ROLL* (d${sides})\n\n${face}You rolled: *${result}*\n\n${result === sides ? "🔥 Max roll! Lucky!" : result === 1 ? "💀 Minimum roll. Unlucky." : "Good roll!"}`);
      }

      // ══════════════════════════════
      // 🔢 NUMBER GUESSING GAME
      // ══════════════════════════════

      if (cmd === "guess" || cmd === "guessnumber") {
        const key = `guess_${from}_${sender}`;

        if (!args[0] || args[0] === "start" || args[0] === "new") {
          const secret = Math.floor(Math.random() * 100) + 1;
          gameState.set(key, { secret, attempts: 0, max: 7 });
          return reply(`🔢 *NUMBER GUESSING GAME*\n\nI've picked a number between *1 and 100*.\nYou have *7 attempts* to guess it!\n\nType: .guess <number>\nType: .guess quit — to end the game`);
        }

        if (args[0] === "quit" || args[0] === "stop") {
          const state = gameState.get(key);
          gameState.delete(key);
          return reply(state
            ? `🛑 Game ended. The number was *${state.secret}*. Better luck next time!`
            : "❌ No active game. Start one with: .guess start");
        }

        const state = gameState.get(key);
        if (!state) return reply("❌ No active game! Start one with: .guess start");

        const guess = parseInt(args[0]);
        if (isNaN(guess) || guess < 1 || guess > 100) return reply("❌ Please enter a valid number between 1 and 100.");

        state.attempts++;
        const remaining = state.max - state.attempts;

        if (guess === state.secret) {
          gameState.delete(key);
          return reply(`🎉 *CORRECT!* The number was *${state.secret}*!\n\n✅ You got it in *${state.attempts}* attempt${state.attempts > 1 ? "s" : ""}!\n\n${state.attempts <= 3 ? "🔥 Amazing! You're a genius!" : state.attempts <= 5 ? "👏 Well done!" : "😅 Phew! Just made it!"}`);
        }

        if (state.attempts >= state.max) {
          gameState.delete(key);
          return reply(`💀 *GAME OVER!*\n\nYou used all ${state.max} attempts.\nThe number was *${state.secret}*.\n\nStart again with: .guess start`);
        }

        const hint = guess < state.secret ? "📈 Too low! Go higher." : "📉 Too high! Go lower.";
        return reply(`${hint}\n\n🔢 Your guess: *${guess}*\n⚡ Attempts left: *${remaining}*`);
      }

      // ══════════════════════════════
      // ❓ TRIVIA QUIZ
      // ══════════════════════════════

      if (cmd === "trivia") {
        const res = await axios.get(
          "https://opentdb.com/api.php?amount=1&type=multiple",
          { timeout: 10000 }
        );
        const q = res.data.results[0];
        const allAnswers = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
        const labels = ["🅰️", "🅱️", "🅲", "🅳"];
        const answerList = allAnswers.map((a, i) => `${labels[i]} ${decodeHtmlEntities(a)}`).join("\n");
        const correctIndex = allAnswers.indexOf(q.correct_answer);
        const correctLabel = labels[correctIndex];

        const key = `trivia_${from}_${sender}`;
        gameState.set(key, { answer: correctLabel, full: q.correct_answer, timeout: Date.now() + 30000 });

        // Auto-reveal after 30s
        setTimeout(() => {
          const s = gameState.get(key);
          if (s && Date.now() >= s.timeout) {
            gameState.delete(key);
            sock.sendMessage(from, {
              text: `⏰ *Time's up!*\nThe correct answer was: *${correctLabel} ${decodeHtmlEntities(q.correct_answer)}*`
            });
          }
        }, 30000);

        const category = decodeHtmlEntities(q.category);
        const question = decodeHtmlEntities(q.question);
        const difficulty = q.difficulty.toUpperCase();

        return reply(`🧠 *TRIVIA QUIZ*\n\n📂 Category: ${category}\n⚡ Difficulty: ${difficulty}\n\n❓ ${question}\n\n${answerList}\n\n_Reply with the letter! (30s to answer)_\nType: .trivia answer <letter>`);
      }

      if (cmd === "trivia" && args[0] === "answer") {
        const key = `trivia_${from}_${sender}`;
        const state = gameState.get(key);
        if (!state) return reply("❌ No active trivia. Start one with: .trivia");
        if (Date.now() > state.timeout) {
          gameState.delete(key);
          return reply(`⏰ *Too slow!*\nThe answer was: *${state.answer} ${decodeHtmlEntities(state.full)}*`);
        }
        const userAnswer = args[1]?.toUpperCase();
        if (!userAnswer) return reply("❓ Reply with: .trivia answer A/B/C/D");
        gameState.delete(key);
        if (userAnswer === state.answer.replace(/[^A-D]/g, "")) {
          return reply(`✅ *CORRECT!* ${state.answer}\n\nWell done! You got it right! 🎉`);
        }
        return reply(`❌ *WRONG!*\nThe correct answer was: *${state.answer} ${decodeHtmlEntities(state.full)}*\n\nBetter luck next time!`);
      }

      // ══════════════════════════════
      // 💭 TRUTH OR DARE
      // ══════════════════════════════

      if (cmd === "truth") {
        const truths = [
          "What is your biggest fear?",
          "What's the most embarrassing thing you've ever done?",
          "Have you ever lied to your best friend?",
          "What's your biggest regret in life?",
          "Have you ever cheated on a test or exam?",
          "What is your biggest insecurity?",
          "What's the most illegal thing you've ever done?",
          "Have you ever had a crush on someone in this group?",
          "What's a secret you've never told anyone?",
          "What's the worst thing you've ever done to someone you love?",
          "Have you ever pretended to be sick to avoid something?",
          "What's the pettiest thing you've ever done?",
          "If you could erase one memory, what would it be?",
          "Have you ever ghosted someone?",
          "What's one thing you hope your parents never find out?"
        ];
        const t = truths[Math.floor(Math.random() * truths.length)];
        return reply(`💭 *TRUTH*\n\n❓ ${t}`);
      }

      if (cmd === "dare") {
        const dares = [
          "Send a voice note singing your favourite song for 30 seconds.",
          "Change your WhatsApp status to 'I love [group name]' for 1 hour.",
          "Tag someone in this group and say one nice thing about them.",
          "Send the oldest photo in your gallery.",
          "Do 10 push-ups and send a video as proof.",
          "Send a screenshot of your most recent WhatsApp conversation.",
          "Text your crush 'hey' and send us the screenshot.",
          "Post a funny selfie as your WhatsApp status for 10 minutes.",
          "Record yourself doing a 15-second dance and send it here.",
          "Send the last song you listened to.",
          "Share your screen time from today.",
          "Send a voice note saying 'I am the best dancer in the world'.",
          "Type everything with your nose for the next 2 minutes.",
          "Send a message to someone you haven't talked to in months.",
          "Do your best impression of another group member via voice note."
        ];
        const d = dares[Math.floor(Math.random() * dares.length)];
        return reply(`🔥 *DARE*\n\n🎯 ${d}`);
      }

      if (cmd === "truthordare") {
        const pick = Math.random() > 0.5 ? "TRUTH" : "DARE";
        const truths = [
          "What is your biggest fear?",
          "What's the most embarrassing thing you've ever done?",
          "Have you ever lied to your best friend?",
          "What's your biggest regret?",
          "Have you ever cheated on a test?"
        ];
        const dares = [
          "Send a voice note singing for 30 seconds.",
          "Change your status to 'I love this group' for 1 hour.",
          "Tag someone and say something nice about them.",
          "Send the oldest photo in your gallery.",
          "Do 10 push-ups and send proof."
        ];
        const choice = pick === "TRUTH"
          ? truths[Math.floor(Math.random() * truths.length)]
          : dares[Math.floor(Math.random() * dares.length)];
        const emoji = pick === "TRUTH" ? "💭" : "🔥";
        return reply(`${emoji} *TRUTH OR DARE — ${pick}*\n\n${pick === "TRUTH" ? "❓" : "🎯"} ${choice}`);
      }

      // ══════════════════════════════
      // 🦑 SQUID GAME
      // ══════════════════════════════

      if (cmd === "squidgame") {
        const games = [
          { name: "🟢 Red Light, Green Light", desc: "Everyone freezes! Don't move a muscle or you're eliminated. 💀", result: Math.random() > 0.4 ? "✅ You survived!" : "💀 You moved. Eliminated." },
          { name: "🍬 Honeycomb (Dalgona)", desc: "Pick your shape: ⭐ Star, 🔺 Triangle, ⭕ Circle, ☂️ Umbrella", result: Math.random() > 0.5 ? "✅ You carved it perfectly! Survived!" : "💀 The cookie broke. Eliminated." },
          { name: "🤝 Tug of War", desc: "Your team pulls with everything they've got!", result: Math.random() > 0.4 ? "✅ Your team wins! You survive!" : "💀 You fell. Eliminated." },
          { name: "🔵 Marbles", desc: "You bet all your marbles against your partner.", result: Math.random() > 0.5 ? "✅ You won all the marbles! Survived!" : "💀 You lost all your marbles. Eliminated." },
          { name: "🌉 Glass Bridge", desc: "You must choose the right glass panels to cross!", result: Math.random() > 0.45 ? "✅ You crossed safely! Survived!" : "💀 Wrong panel. Eliminated." }
        ];
        const game = games[Math.floor(Math.random() * games.length)];
        const survived = game.result.startsWith("✅");
        return reply(`🦑 *SQUID GAME*\n\n*Game:* ${game.name}\n\n📋 ${game.desc}\n\n━━━━━━━━━━━━━━━━\n${game.result}\n\n${survived ? "🎖️ Player 456 lives to fight another day." : "⚰️ Another player falls in the games."}`);
      }

      // ══════════════════════════════
      // ✊ ROCK PAPER SCISSORS
      // ══════════════════════════════

      if (cmd === "rps" || cmd === "rockpaperscissors") {
        const choices = ["rock", "paper", "scissors"];
        const emojis = { rock: "🪨", paper: "📄", scissors: "✂️" };
        const userChoice = args[0]?.toLowerCase();

        if (!choices.includes(userChoice)) {
          return reply(`✊ *ROCK PAPER SCISSORS*\n\nUsage: .rps rock / paper / scissors\n\n🪨 Rock\n📄 Paper\n✂️ Scissors`);
        }

        const botChoice = choices[Math.floor(Math.random() * 3)];
        let result = "";

        if (userChoice === botChoice) result = "🤝 *It's a TIE!*";
        else if (
          (userChoice === "rock" && botChoice === "scissors") ||
          (userChoice === "paper" && botChoice === "rock") ||
          (userChoice === "scissors" && botChoice === "paper")
        ) {
          result = "🎉 *YOU WIN!* 🏆";
        } else {
          result = "💀 *BOT WINS!* Better luck next time!";
        }

        return reply(`✊ *ROCK PAPER SCISSORS*\n\n👤 You: ${emojis[userChoice]} ${userChoice.toUpperCase()}\n🤖 Bot: ${emojis[botChoice]} ${botChoice.toUpperCase()}\n\n${result}`);
      }

      // ══════════════════════════════
      // ❌⭕ TIC TAC TOE
      // ══════════════════════════════

      if (cmd === "ttt" || cmd === "tictactoe") {
        const key = `ttt_${from}`;

        if (!args[0] || args[0] === "start" || args[0] === "new") {
          const board = Array(9).fill("·");
          gameState.set(key, { board, turn: "X", vs: "bot" });
          return reply(`❌⭕ *TIC TAC TOE*\n\nYou are ❌, Bot is ⭕\n\n${renderBoard(board)}\n\nPick a square (1-9):\n.ttt <number>\n.ttt quit — end game`);
        }

        if (args[0] === "quit") {
          gameState.delete(key);
          return reply("🛑 Tic Tac Toe ended.");
        }

        const state = gameState.get(key);
        if (!state) return reply("❌ No active game! Start with: .ttt start");

        const pos = parseInt(args[0]) - 1;
        if (isNaN(pos) || pos < 0 || pos > 8) return reply("❌ Choose a square between 1 and 9.");
        if (state.board[pos] !== "·") return reply("❌ That square is already taken! Choose another.");

        // Player move
        state.board[pos] = "X";
        const playerWin = checkWinner(state.board, "X");
        if (playerWin) {
          gameState.delete(key);
          return reply(`${renderBoard(state.board)}\n\n🎉 *YOU WIN!* Congratulations! 🏆`);
        }
        if (!state.board.includes("·")) {
          gameState.delete(key);
          return reply(`${renderBoard(state.board)}\n\n🤝 *It's a DRAW!* Good game!`);
        }

        // Bot move (simple AI — block or random)
        const botMove = getBotMove(state.board);
        state.board[botMove] = "O";
        const botWin = checkWinner(state.board, "O");
        if (botWin) {
          gameState.delete(key);
          return reply(`${renderBoard(state.board)}\n\n💀 *BOT WINS!* Better luck next time!`);
        }
        if (!state.board.includes("·")) {
          gameState.delete(key);
          return reply(`${renderBoard(state.board)}\n\n🤝 *It's a DRAW!* Good game!`);
        }

        return reply(`${renderBoard(state.board)}\n\n✅ Your move done. Bot played.\nYour turn! Pick 1-9.`);
      }

    } catch (err) {
      console.error("[game.js]", err?.message || err);
      return sock.sendMessage(from, { text: `❌ Game error: ${err.message}` }, { quoted: msg });
    }
  }
};

// ── HELPERS ──

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D");
}

function renderBoard(board) {
  const symbols = board.map(c => c === "X" ? "❌" : c === "O" ? "⭕" : "⬜");
  return `${symbols[0]}${symbols[1]}${symbols[2]}\n${symbols[3]}${symbols[4]}${symbols[5]}\n${symbols[6]}${symbols[7]}${symbols[8]}`;
}

function checkWinner(board, player) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  return wins.some(([a,b,c]) => board[a] === player && board[b] === player && board[c] === player);
}

function getBotMove(board) {
  // Try to win
  for (let i = 0; i < 9; i++) {
    if (board[i] === "·") {
      board[i] = "O";
      if (checkWinner(board, "O")) { board[i] = "·"; return i; }
      board[i] = "·";
    }
  }
  // Try to block player
  for (let i = 0; i < 9; i++) {
    if (board[i] === "·") {
      board[i] = "X";
      if (checkWinner(board, "X")) { board[i] = "·"; return i; }
      board[i] = "·";
    }
  }
  // Take center
  if (board[4] === "·") return 4;
  // Take corner
  for (const c of [0, 2, 6, 8]) if (board[c] === "·") return c;
  // Take any
  return board.findIndex(c => c === "·");
}
