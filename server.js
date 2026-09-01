const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});


let players = {};

let hunterId = null;
let gameStarted = false;
let gameStartTime = 0;

const MAX_PLAYERS = 2;
const HUNTER_DELAY = 30000;


/*
PLAYER JOIN
*/

io.on("connection", socket => {

    console.log("Spieler verbunden:", socket.id);

    if (Object.keys(players).length >= MAX_PLAYERS) {

        socket.emit("roomFull");

        socket.disconnect();

        return;
    }


    players[socket.id] = {

        id: socket.id,

        x: 0,

        y: 0,

        z: 35,

        rotation: 0,

        color: 0xff1744,

        role: null,

        hidden: false

    };


    /*
    Zweiten Spieler warten lassen
    */

    if (Object.keys(players).length === 1) {

        socket.emit("waiting", {
            players: 1,
            needed: 1
        });

    }


    /*
    Zwei Spieler vorhanden
    */

    if (Object.keys(players).length === 2) {

        const ids = Object.keys(players);

        hunterId =
            ids[Math.floor(Math.random() * ids.length)];


        ids.forEach(id => {

            players[id].role =
                id === hunterId
                ? "hunter"
                : "chameleon";

        });


        gameStarted = true;

        gameStartTime = Date.now();


        io.emit("gameStart", {

            hunterId,

            players,

            hunterDelay: HUNTER_DELAY

        });

    }


    /*
    Bewegung vom Client
    */

    socket.on("playerMove", data => {

        if (!players[socket.id]) return;

        const p = players[socket.id];


        if (typeof data.x === "number")
            p.x = data.x;

        if (typeof data.y === "number")
            p.y = data.y;

        if (typeof data.z === "number")
            p.z = data.z;

        if (typeof data.rotation === "number")
            p.rotation = data.rotation;

        if (typeof data.hidden === "boolean")
            p.hidden = data.hidden;


        io.emit("playerUpdate", {

            id: socket.id,

            x: p.x,

            y: p.y,

            z: p.z,

            rotation: p.rotation,

            color: p.color,

            hidden: p.hidden

        });

    });


    /*
    Farbe ändern
    */

    socket.on("paint", color => {

        if (!players[socket.id]) return;

        if (
            typeof color !== "number" ||
            !Number.isFinite(color)
        ) return;


        players[socket.id].color = color;


        io.emit("playerPaint", {

            id: socket.id,

            color

        });

    });


    /*
    Hunter versucht Spieler zu finden
    */

    socket.on("catchPlayer", targetId => {

        if (!gameStarted) return;

        if (socket.id !== hunterId) return;

        if (Date.now() - gameStartTime < HUNTER_DELAY) {

            socket.emit("hunterLocked");

            return;
        }


        if (!players[targetId]) return;


        const hunter = players[socket.id];

        const target = players[targetId];


        const dx = hunter.x - target.x;

        const dz = hunter.z - target.z;

        const distance =
            Math.sqrt(dx * dx + dz * dz);


        /*
        Der Hunter muss nahe genug sein.
        */

        if (distance < 2.8) {

            io.emit("playerCaught", {

                hunterId: socket.id,

                targetId

            });

            gameStarted = false;

        }

    });


    /*
    Ping / Zustand
    */

    socket.on("requestState", () => {

        socket.emit("state", {

            players,

            hunterId,

            gameStarted,

            gameStartTime

        });

    });


    /*
    Disconnect
    */

    socket.on("disconnect", () => {

        console.log(
            "Spieler verlassen:",
            socket.id
        );


        delete players[socket.id];


        if (Object.keys(players).length < 2) {

            gameStarted = false;

            hunterId = null;

            io.emit("waiting", {

                players:
                    Object.keys(players).length,

                needed:
                    MAX_PLAYERS -
                    Object.keys(players).length

            });

        }

    });

});


/*
Hunter-Timer synchronisieren
*/

setInterval(() => {

    if (!gameStarted) return;


    const elapsed =
        Date.now() - gameStartTime;


    const remaining =
        Math.max(
            0,
            HUNTER_DELAY - elapsed
        );


    io.emit("hunterTimer", {

        remaining

    });


}, 250);


server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `MECHA CHAMELEON Server läuft auf Port ${PORT}`
    );

});
