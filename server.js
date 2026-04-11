const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Filter = require("bad-words");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const filter = new Filter();

filter.addWords(
  'nigga', 'fag', 'faggot', 'retard', 'kys', 'tranny',
  'chink', 'spic', 'wetback', 'cracker', 'gook', 'kyke'
);

const ALLOWED_COLORS = [
  '#4fc3f7', // blue (default)
  '#ffffff', // white
  '#a78bfa', // purple
  '#34d399', // green
  '#f87171', // red
  '#fbbf24', // yellow
  '#fb923c', // orange
  '#f472b6', // pink
];

function normalizeLeet(text) {
  return text
    .toLowerCase()
    // Leet substitutions
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/6/g, 'g')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/\+/g, 't')
    .replace(/\|/g, 'i')
    .replace(/\(/g, 'c')
    .replace(/\)/g, 'o')
    .replace(/></, 'x')
    .replace(/vv/g, 'w')
    .replace(/\/\//g, 'n')
    // Strip spaces between letters used to dodge filter (f u c k -> fuck)
    .replace(/(\b\w\s){2,}/g, (m) => m.replace(/\s/g, ''))
    // Collapse ALL repeated characters: fuuuck -> fuk, fuuck -> fuk
    .replace(/(.)\1+/g, '$1');
}

function isBad(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalizeLeet(text);
  // Also check with all spaces/symbols stripped
  const stripped = text.toLowerCase().replace(/[^a-z]/g, '');
  // Also check stripped+collapsed
  const strippedCollapsed = stripped.replace(/(.)\1+/g, '$1');
  try {
    return (
      filter.isProfane(text) ||
      filter.isProfane(normalized) ||
      filter.isProfane(stripped) ||
      filter.isProfane(strippedCollapsed)
    );
  } catch {
    return false;
  }
}

function isValidUsername(name) {
  if (!name || name.trim().length < 1) return { ok: false, reason: 'Username cannot be empty.' };
  if (name.trim().length > 25) return { ok: false, reason: 'Username is too long.' };
  if (!/^[a-zA-Z0-9_ ]+$/.test(name.trim())) return { ok: false, reason: 'Only letters, numbers, underscores and spaces allowed.' };
  if (isBad(name)) return { ok: false, reason: 'That username is not allowed. Please choose another.' };
  return { ok: true };
}

const players = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  players[socket.id] = {
    x: 0, y: 0,
    username: null,
    approved: false,
    color: '#4fc3f7',
    lastSeen: Date.now()
  };

  socket.on("requestUsername", (name) => {
    const result = isValidUsername(String(name));
    if (result.ok) {
      players[socket.id].username = String(name).trim();
      players[socket.id].approved = true;
      socket.emit("usernameApproved", players[socket.id].username);
    } else {
      socket.emit("usernameRejected", result.reason);
    }
  });

  socket.on("setColor", (color) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    if (ALLOWED_COLORS.includes(color)) {
      players[socket.id].color = color;
    }
  });

  socket.on("move", (data) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].lastSeen = Date.now();
  });

  socket.on("chat", (text) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    const clean = String(text).trim().slice(0, 140);
    if (!clean) return;
    if (isBad(clean)) {
      socket.emit('chatBlocked', '🚫 Your message was blocked for inappropriate language.');
      return;
    }
    io.emit("chat", {
      id: socket.id,
      username: players[socket.id].username,
      text: clean,
    });
  });

  socket.on("heartbeat", () => {
    if (players[socket.id]) {
      players[socket.id].lastSeen = Date.now();
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    console.log("Player disconnected:", socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const id in players) {
    if (now - players[id].lastSeen > 15000) {
      delete players[id];
      console.log("Removed ghost player:", id);
    }
  }
}, 2000);

setInterval(() => {
  const approved = {};
  for (const [id, p] of Object.entries(players)) {
    if (p.approved) approved[id] = p;
  }
  io.emit("state", approved);
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
