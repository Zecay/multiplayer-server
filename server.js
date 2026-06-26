const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Filter = require("bad-words");

const app = express();
const fs = require("fs");

// CORS headers — Web Workers fetch from Remix sandbox
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Parse JSON bodies for POST /api/sync
app.use(express.json({ limit: '100kb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const filter = new Filter();
filter.addWords(
  'nigga', 'fag', 'faggot', 'retard', 'kys', 'tranny',
  'chink', 'spic', 'wetback', 'cracker', 'gook', 'kyke',
  'anus', 'sex'
);

const WHITELIST = new Set([
  'good', 'god', 'hell', 'damn', 'crap', 'darn', 'heck'
]);

const ALLOWED_COLORS = [
  '#4fc3f7', '#ffffff', '#a78bfa', '#34d399',
  '#f87171', '#fbbf24', '#fb923c', '#f472b6',
];

const ALLOWED_HATS = new Set([
  'character1', 'character2', 'character3', 'character4', 'character5',
  'character6', 'character7', 'character8', 'character9', 'character10',
  null
]);

function normalizeLeet(text) {
  return text
    .toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/6/g, 'g')
    .replace(/7/g, 't').replace(/8/g, 'b').replace(/9/g, 'g')
    .replace(/@/g, 'a').replace(/\$/g, 's').replace(/!/g, 'i')
    .replace(/\+/g, 't').replace(/\|/g, 'i').replace(/\(/g, 'c')
    .replace(/\)/g, 'o').replace(/></, 'x').replace(/vv/g, 'w')
    .replace(/\/\//g, 'n')
    .replace(/(\b\w\s){2,}/g, (m) => m.replace(/\s/g, ''))
    .replace(/(.)\1+/g, '$1');
}

function isBad(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalizeLeet(text);
  const stripped = text.toLowerCase().replace(/[^a-z]/g, '');
  const strippedCollapsed = stripped.replace(/(.)\1+/g, '$1');
  const lower = text.toLowerCase();
  if (WHITELIST.has(lower) || WHITELIST.has(normalized) || WHITELIST.has(stripped) || WHITELIST.has(strippedCollapsed)) {
    return false;
  }
  try {
    return (
      filter.isProfane(text) ||
      filter.isProfane(normalized) ||
      filter.isProfane(stripped) ||
      filter.isProfane(strippedCollapsed)
    );
  } catch { return false; }
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
    hat: null,
    credits: 0,
    playTimeMs: 0,
    ownedCharacters: ['character1', 'character2'],
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

  socket.on("setHat", (hat) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    if (hat === null || ALLOWED_HATS.has(hat)) {
      players[socket.id].hat = hat;
    }
  });

  socket.on("updatePlayerInfo", (data) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    if (Number.isFinite(data.credits)) {
      players[socket.id].credits = Math.max(0, Math.floor(data.credits));
    }
    if (Number.isFinite(data.playTimeMs)) {
      players[socket.id].playTimeMs = Math.max(0, Math.floor(data.playTimeMs));
    }
    if (Array.isArray(data.ownedCharacters)) {
      players[socket.id].ownedCharacters = [...new Set(
        data.ownedCharacters.filter(v => typeof v === 'string' && v)
      )];
    }
  });

  socket.on("move", (data) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    // FIX: Validate incoming position data to prevent cheating/crashes
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    if (!isFinite(data.x) || !isFinite(data.y)) return;
    // Clamp positions to reasonable world bounds
    const MAX_POS = 5000;
    players[socket.id].x = Math.max(-MAX_POS, Math.min(MAX_POS, data.x));
    players[socket.id].y = Math.max(-MAX_POS, Math.min(MAX_POS, data.y));
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

  // ── Private messaging: NO word filter, just length cap ──
  socket.on("privateMessage", (data) => {
    if (!players[socket.id] || !players[socket.id].approved) return;
    const { toId, text } = data || {};
    if (!toId || typeof toId !== 'string') return;
    const target = players[toId];
    if (!target || !target.approved) {
      socket.emit('pmError', { toId, reason: 'That player is no longer online.' });
      return;
    }
    const clean = String(text || '').trim().slice(0, 300);
    if (!clean) return;
    const payload = {
      fromId: socket.id,
      fromUsername: players[socket.id].username,
      toId,
      text: clean,
      ts: Date.now(),
    };
    // Send to recipient
    io.to(toId).emit('privateMessage', payload);
    // Echo back to sender so they see their own message in the DM thread
    socket.emit('privateMessage', payload);
  });

  socket.on("heartbeat", () => {
    if (players[socket.id]) players[socket.id].lastSeen = Date.now();
  });

  socket.on("disconnect", () => {
    // Notify anyone who had an open DM with this player
    io.emit("playerOffline", { id: socket.id });
    delete players[socket.id];
    console.log("Player disconnected:", socket.id);
  });
});

// Ghost-player cleanup
setInterval(() => {
  const now = Date.now();
  for (const id in players) {
    if (now - players[id].lastSeen > 15000) {
      io.emit("playerOffline", { id });
      delete players[id];
      console.log("Removed ghost player:", id);
    }
  }
}, 2000);

// World state broadcast
setInterval(() => {
  const approved = {};
  for (const [id, p] of Object.entries(players)) {
    if (p.approved) approved[id] = p;
  }
  io.emit("state", approved);
}, 50);

const PORT = process.env.PORT || 3000;

// FIX: Also serve the map from the server so the client can fetch from the same origin
app.get("/map", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  // Try to serve MAP.json from the same directory
  const mapPath = __dirname + "/MAP.json";
  if (fs.existsSync(mapPath)) {
    res.sendFile(mapPath);
  } else {
    res.status(404).json({ error: "MAP.json not found on server" });
  }
});

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
