// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const MAX_PLAYERS = 2;
const HUNTER_DELAY = 30000;
const ROUND_TIME = 120000;

const players = {};
let lobby = [];
let game = null;

function sendLobby() {
    io.emit("waiting", {
        players: lobby.length
    });
}

function startGame() {

    if (game) return;
    if (lobby.length < 2) return;

    const ids = lobby.splice(0, 2);

    const hunterId =
        ids[Math.floor(Math.random() * ids.length)];

    game = {
        ids,
        hunterId,
        started: Date.now(),
        finished: false
    };

    ids.forEach((id, index) => {

        const p = players[id];

        if (!p) return;

        p.inGame = true;
        p.role = id === hunterId
            ? "hunter"
            : "chameleon";

        p.x = id === hunterId ? -7 : 7;
        p.y = 0;
        p.z = 35;
        p.rotation = 0;
        p.color = 0xff1744;
        p.hidden = false;
    });

    const publicPlayers = {};

    ids.forEach(id => {

        const p = players[id];

        publicPlayers[id] = {
            x: p.x,
            y: p.y,
            z: p.z,
            rotation: p.rotation,
            color: p.color,
            hidden: p.hidden
        };
    });

    ids.forEach(id => {

        io.to(id).emit("gameStart", {
            players: publicPlayers,
            hunterId
        });
    });

    sendLobby();
}

function endGame(winner) {

    if (!game || game.finished) return;

    game.finished = true;

    io.emit("roundResult", {
        winner
    });

    setTimeout(() => {

        game = null;

        Object.keys(players).forEach(id => {

            if (!players[id]) return;

            players[id].inGame = false;
            players[id].role = null;

        });

        lobby = [];

        sendLobby();

    }, 1000);
}

setInterval(() => {

    if (!game || game.finished) return;

    const elapsed = Date.now() - game.started;

    const hunterRemaining =
        Math.max(0, HUNTER_DELAY - elapsed);

    io.emit("hunterTimer", {
        remaining: hunterRemaining
    });

    if (elapsed >= ROUND_TIME) {
        endGame("chameleon");
    }

}, 250);

io.on("connection", socket => {

    players[socket.id] = {
        id: socket.id,
        inGame: false,
        role: null,
        x: 0,
        y: 0,
        z: 35,
        rotation: 0,
        color: 0xff1744,
        hidden: false
    };

    socket.emit("waiting", {
        players: lobby.length
    });

    socket.on("requestState", () => {

        if (!game && !lobby.includes(socket.id)) {
            lobby.push(socket.id);
        }

        sendLobby();

        if (lobby.length >= 2) {
            setTimeout(startGame, 200);
        }
    });

    socket.on("joinLobby", () => {

        if (!players[socket.id]) return;
        if (players[socket.id].inGame) return;

        if (!lobby.includes(socket.id)) {
            lobby.push(socket.id);
        }

        sendLobby();

        if (lobby.length >= 2 && !game) {
            setTimeout(startGame, 200);
        }
    });

    socket.on("playerMove", data => {

        const p = players[socket.id];

        if (!p || !p.inGame || !game) return;

        const elapsed =
            Date.now() - game.started;

        if (
            p.role === "hunter" &&
            elapsed < HUNTER_DELAY
        ) {
            socket.emit("hunterLocked");
            return;
        }

        if (typeof data.x === "number") p.x = data.x;
        if (typeof data.y === "number") p.y = data.y;
        if (typeof data.z === "number") p.z = data.z;
        if (typeof data.rotation === "number") {
            p.rotation = data.rotation;
        }

        if (typeof data.hidden === "boolean") {
            p.hidden = data.hidden;
        }

        socket.broadcast.emit("playerUpdate", {
            id: socket.id,
            x: p.x,
            y: p.y,
            z: p.z,
            rotation: p.rotation,
            color: p.color,
            hidden: p.hidden
        });
    });

    socket.on("paint", color => {

        const p = players[socket.id];

        if (!p || !p.inGame) return;
        if (p.role !== "chameleon") return;

        if (typeof color !== "number") return;

        p.color = color;

        socket.broadcast.emit("playerPaint", {
            id: socket.id,
            color
        });
    });

    socket.on("catchPlayer", targetId => {

        if (!game || game.finished) return;

        const hunter = players[socket.id];
        const target = players[targetId];

        if (!hunter || !target) return;

        if (hunter.role !== "hunter") return;
        if (target.role !== "chameleon") return;

        const elapsed =
            Date.now() - game.started;

        if (elapsed < HUNTER_DELAY) {
            socket.emit("hunterLocked");
            return;
        }

        const dx = hunter.x - target.x;
        const dz = hunter.z - target.z;

        const distance =
            Math.sqrt(dx * dx + dz * dz);

        if (distance <= 3.5) {

            io.emit("playerCaught", {
                hunterId: socket.id,
                targetId
            });

            endGame("hunter");
        }
    });

    socket.on("disconnect", () => {

        const wasInGame =
            players[socket.id] &&
            players[socket.id].inGame;

        const wasHunter =
            players[socket.id] &&
            players[socket.id].role === "hunter";

        lobby =
            lobby.filter(id => id !== socket.id);

        delete players[socket.id];

        io.emit("playerLeft", socket.id);

        if (wasInGame && game && !game.finished) {

            endGame(
                wasHunter
                    ? "chameleon"
                    : "hunter"
            );

        } else {

            sendLobby();
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        "MECHA CHAMELEON läuft auf Port " + PORT
    );
});
