const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const players = new Map();

function findOpponent(socketId) {
  for (const [id, player] of players) {
    if (id !== socketId && player.inBattle) {
      return id;
    }
  }
  return null;
}

io.on("connection", socket => {

  players.set(socket.id, {
    id: socket.id,
    x: 0,
    y: 5,
    z: 15,
    lives: 3,
    inBattle: false,
    opponent: null
  });

  socket.emit("connected", {
    id: socket.id
  });

  socket.on("findBattle", () => {

    const player = players.get(socket.id);
    if (!player) return;

    const opponentId = findOpponent(socket.id);

    if (opponentId) {

      const opponent = players.get(opponentId);

      player.inBattle = true;
      opponent.inBattle = true;

      player.opponent = opponentId;
      opponent.opponent = socket.id;

      socket.emit("battleFound", {
        opponent: opponentId
      });

      io.to(opponentId).emit("battleFound", {
        opponent: socket.id
      });

    } else {

      player.inBattle = true;

      socket.emit("waiting", {
        message: "Warte auf einen Gegner..."
      });
    }
  });

  socket.on("position", data => {

    const player = players.get(socket.id);
    if (!player || !player.inBattle) return;

    player.x = Number(data.x) || 0;
    player.y = Number(data.y) || 5;
    player.z = Number(data.z) || 0;

    if (player.opponent) {

      io.to(player.opponent).emit("enemyPosition", {
        x: player.x,
        y: player.y,
        z: player.z
      });
    }
  });

  socket.on("shoot", () => {

    const player = players.get(socket.id);
    if (!player || !player.inBattle) return;

    if (!player.opponent) return;

    const opponent = players.get(player.opponent);

    if (!opponent) return;

    io.to(opponent.id).emit("enemyShot");

    opponent.lives--;

    if (opponent.lives <= 0) {

      socket.emit("battleWon");

      io.to(opponent.id).emit("battleLost");

      player.inBattle = false;
      opponent.inBattle = false;
      player.opponent = null;
      opponent.opponent = null;

    } else {

      io.to(player.id).emit("enemyHit", {
        lives: opponent.lives
      });
    }
  });

  socket.on("respawn", data => {

    const player = players.get(socket.id);
    if (!player) return;

    player.x = Number(data.x) || 0;
    player.y = 5;
    player.z = Number(data.z) || 0;

    if (player.opponent) {

      io.to(player.opponent).emit("enemyPosition", {
        x: player.x,
        y: player.y,
        z: player.z
      });
    }
  });

  socket.on("leaveBattle", () => {

    const player = players.get(socket.id);

    if (!player) return;

    if (player.opponent) {

      const opponent = players.get(player.opponent);

      if (opponent) {

        opponent.inBattle = false;
        opponent.opponent = null;

        io.to(opponent.id).emit("opponentLeft");
      }
    }

    player.inBattle = false;
    player.opponent = null;
  });

  socket.on("disconnect", () => {

    const player = players.get(socket.id);

    if (player && player.opponent) {

      const opponent = players.get(player.opponent);

      if (opponent) {

        opponent.inBattle = false;
        opponent.opponent = null;

        io.to(opponent.id).emit("opponentLeft");
      }
    }

    players.delete(socket.id);
  });
});

app.get("/api/status", (req, res) => {

  res.json({
    online: true,
    players: players.size,
    battles: [...players.values()]
      .filter(p => p.inBattle).length
  });
});

server.listen(PORT, () => {
  console.log(`MECH ARENA läuft auf Port ${PORT}`);
});
