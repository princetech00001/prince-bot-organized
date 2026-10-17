import fs from "fs";

const FILE = "./telegram-data.json";

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { users: {}, sessions: {} };
  }
}

let data = load();

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function touchUser(telegramId, username) {
  const key = String(telegramId);
  if (!data.users[key]) {
    data.users[key] = { username: username || null, firstSeen: Date.now() };
  } else {
    data.users[key].username = username || data.users[key].username;
  }
  save();
}

export function allUsers() {
  return Object.entries(data.users).map(([id, u]) => ({ id, ...u }));
}

export function setSession(telegramId, sessionInfo) {
  data.sessions[String(telegramId)] = sessionInfo;
  save();
}

export function getSession(telegramId) {
  return data.sessions[String(telegramId)] || null;
}

export function allSessions() {
  return Object.entries(data.sessions).map(([telegramId, s]) => ({ telegramId, ...s }));
}

export function removeSession(telegramId) {
  delete data.sessions[String(telegramId)];
  save();
}
