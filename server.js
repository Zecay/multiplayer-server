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

  players[socket.id] = { x: 0, y: 0, lastSeen: Date.now() };

  socket.on("move", (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].lastSeen = Date.now();
    }
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

// Remove ghost players who haven't sent anything in 15 seconds
setInterval(() => {
  const now = Date.now();
  for (const id in players) {
    if (now - players[id].lastSeen > 15000) {
      delete players[id];
      console.log("Removed ghost player:", id);
    }
  }
}, 2000);

// Broadcast full state to all clients every 50ms
setInterval(() => {
  io.emit("state", players);
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
