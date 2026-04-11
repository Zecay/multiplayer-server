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

// Add extra words the library might miss
filter.addWords('nigga', 'fag', 'retard', 'kys');

// Normalize leetspeak before checking
// e.g. f0ck -> fuck, sh1t -> shit, @ss -> ass
function normalizeLeet(text) {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/\+/g, 't')
    .replace(/\|/g, 'i')
    .replace(/\(/g, 'c')
    // Strip repeated characters like fuuuuck -> fuck
    .replace(/(.)\1{2,}/g, '$1$1');
}

function isBad(text) {
  const normalized = normalizeLeet(text);
  // Check both original and normalized
  try {
    return filter.isProfane(text) || filter.isProfane(normalized);
  } catch {
    return false;
  }
}

function cleanUsername(name) {
  if (isBad(name)) return 'Player';
  return name;
}

const players = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  players[socket.id] = { x: 0, y: 0, username: 'Player', lastSeen: Date.now() };

  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].lastSeen = Date.now();
    }
  });

  socket.on("setUsername", (name) => {
    if (players[socket.id]) {
      const clean = cleanUsername(String(name).trim().slice(0, 25));
      players[socket.id].username = clean;
      socket.emit('usernameSet', clean);
    }
  });

  socket.on("chat", (text) => {
    if (!players[socket.id]) return;
    const clean = String(text).trim().slice(0, 140);
    if (!clean) return;
    if (isBad(clean)) {
      socket.emit('chatBlocked', 'Your message was blocked for inappropriate language.');
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
  io.emit("state", players);
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
