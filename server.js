const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

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
      const clean = String(name).trim().slice(0, 25);
      players[socket.id].username = clean;
    }
  });

  socket.on("chat", (text) => {
    if (!players[socket.id]) return;
    const clean = String(text).trim().slice(0, 140);
    if (!clean) return;
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
