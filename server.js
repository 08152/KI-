const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});


const MAX_PLAYERS = 2;
const HUNTER_WAIT = 30000;

let waitingPlayers = [];
let players = {};

let game = {
    running: false,
    hunterId: null,
    startedAt: 0
};


/* =========================
   LOBBY
========================= */

function sendLobbyState() {

    const count = waitingPlayers.length;

    io.emit("lobbyUpdate", {
        players: count,
        needed: Math.max(0, MAX_PLAYERS - count)
    });
}


function startGame() {

    if (game.running) return;

    if (waitingPlayers.length < MAX_PLAYERS) return;


    const ids = waitingPlayers.splice(0, MAX_PLAYERS);

    const hunter =
        ids[Math.floor(Math.random() * ids.length)];

    game.running = true;
    game.hunterId = hunter;
    game.startedAt = Date.now();


    ids.forEach((id, index) => {

        if (!players[id]) return;

        players[id].role =
            id === hunter
                ? "hunter"
                : "chameleon";

        players[id].x =
            id === hunter ? 0 : 6;

        players[id].y = 0;

        players[id].z = 35;

        players[id].inGame = true;
    });


    io.to(ids[0]).emit("gameStart", {
        myId: ids[0],
        hunterId: hunter,
        players: getPublicPlayers(ids)
    });

    io.to(ids[1]).emit("gameStart", {
        myId: ids[1],
        hunterId: hunter,
        players: getPublicPlayers(ids)
    });


    sendLobbyState();

    console.log(
        "GAME START:",
        ids,
        "Hunter:",
        hunter
    );
}


function getPublicPlayers(ids) {

    const result = {};

    ids.forEach(id => {

        if (!players[id]) return;

        result[id] = {
            id,
            x: players[id].x,
            y: players[id].y,
            z: players[id].z,
            rotation: players[id].rotation,
            color: players[id].color,
            role: players[id].role,
            hidden: players[id].hidden
        };
    });

    return result;
}


/* =========================
   NEXT ROUND
========================= */

function endGame() {

    game.running = false;
    game.hunterId = null;
    game.startedAt = 0;


    Object.keys(players).forEach(id => {

        if (players[id]) {
            players[id].inGame = false;
            players[id].role = null;
        }

    });


    /*
    Alle Spieler, die noch verbunden sind,
    kommen wieder in die Lobby.
    */

    waitingPlayers = Object.keys(players);


    io.emit("returnToLobby");

    sendLobbyState();

    setTimeout(startGame, 300);
}


/* =========================
   CONNECTION
========================= */

io.on("connection", socket => {

    console.log(
        "JOIN:",
        socket.id
    );


    players[socket.id] = {

        id: socket.id,

        x: 0,
        y: 0,
        z: 35,

        rotation: 0,

        color: 0xff1744,

        hidden: false,

        role: null,

        inGame: false
    };


    /*
    Spieler kommt in Warteschlange.
    */

    waitingPlayers.push(socket.id);


    /*
    Sofort Lobby anzeigen.
    */

    socket.emit("lobbyUpdate", {

        players: waitingPlayers.length,

        needed:
            Math.max(
                0,
                MAX_PLAYERS -
                waitingPlayers.length
            )
    });


    sendLobbyState();


    /*
    Wenn 2 Spieler da sind:
    Runde starten.
    */

    if (
        waitingPlayers.length >=
        MAX_PLAYERS &&
        !game.running
    ) {

        setTimeout(
            startGame,
            300
        );
    }


    /* =========================
       PLAYER MOVE
    ========================= */

    socket.on("playerMove", data => {

        const p = players[socket.id];

        if (!p) return;

        if (!p.inGame) return;


        if (
            typeof data.x === "number"
        ) p.x = data.x;


        if (
            typeof data.y === "number"
        ) p.y = data.y;


        if (
            typeof data.z === "number"
        ) p.z = data.z;


        if (
            typeof data.rotation === "number"
        ) p.rotation = data.rotation;


        if (
            typeof data.hidden === "boolean"
        ) p.hidden = data.hidden;


        /*
        Bewegung nur an Spieler
        der aktuellen Runde senden.
        */

        socket.broadcast.emit(
            "playerUpdate",
            {
                id: socket.id,

                x: p.x,
                y: p.y,
                z: p.z,

                rotation: p.rotation,

                color: p.color,

                hidden: p.hidden
            }
        );

    });


    /* =========================
       PAINT
    ========================= */

    socket.on("paint", color => {

        const p = players[socket.id];

        if (!p) return;

        if (
            typeof color !== "number"
        ) return;


        p.color = color;


        socket.broadcast.emit(
            "playerPaint",
            {
                id: socket.id,
                color: color
            }
        );

    });


    /* =========================
       CATCH
    ========================= */

    socket.on("catchPlayer", targetId => {

        if (!game.running) return;

        if (socket.id !== game.hunterId)
            return;

        /*
        30 Sekunden Schutzzeit.
        */

        if (
            Date.now() -
            game.startedAt <
            HUNTER_WAIT
        ) {

            socket.emit("hunterLocked");

            return;
        }


        const hunter =
            players[socket.id];

        const target =
            players[targetId];


        if (!hunter || !target)
            return;


        const dx =
            hunter.x -
            target.x;

        const dz =
            hunter.z -
            target.z;


        const distance =
            Math.sqrt(
                dx * dx +
                dz * dz
            );


        if (distance <= 3.2) {

            io.emit(
                "playerCaught",
                {
                    hunterId: socket.id,
                    targetId
                }
            );


            endGame();
        }

    });


    /* =========================
       STATE
    ========================= */

    socket.on(
        "requestState",
        () => {

            socket.emit(
                "state",
                {
                    lobbyPlayers:
                        waitingPlayers.length,

                    gameRunning:
                        game.running,

                    hunterId:
                        game.hunterId
                }
            );

        }
    );


    /* =========================
       DISCONNECT
    ========================= */

    socket.on("disconnect", () => {

        console.log(
            "LEAVE:",
            socket.id
        );


        waitingPlayers =
            waitingPlayers.filter(
                id => id !== socket.id
            );


        delete players[socket.id];


        /*
        Wenn ein Spieler während
        der Runde verschwindet,
        Runde beenden.
        */

        if (game.running) {

            const remaining =
                Object.keys(players)
                    .filter(
                        id =>
                            players[id].inGame
                    );


            if (remaining.length < 2) {

                game.running = false;

                game.hunterId = null;

                io.emit(
                    "returnToLobby"
                );
            }

        }


        sendLobbyState();


        /*
        Falls danach wieder
        zwei Spieler warten.
        */

        if (
            !game.running &&
            waitingPlayers.length >= 2
        ) {

            setTimeout(
                startGame,
                300
            );
        }

    });

});


/* =========================
   HUNTER TIMER
========================= */

setInterval(() => {

    if (!game.running) return;


    const elapsed =
        Date.now() -
        game.startedAt;


    const remaining =
        Math.max(
            0,
            HUNTER_WAIT -
            elapsed
        );


    io.emit(
        "hunterTimer",
        {
            remaining
        }
    );


}, 250);


/* =========================
   SERVER
========================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "MECHA CHAMELEON läuft auf Port",
            PORT
        );

    }
);
