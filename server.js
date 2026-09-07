const express = require("express");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 8787;

const upload = multer({
    dest: path.join(__dirname, "uploads")
});

app.use(express.json());
app.use(express.static(__dirname));


// Startseite
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});


// Dienststatus
app.get("/api/status", (req, res) => {

    const ip = req.query.ip;

    if (!ip) {
        return res.status(400).json({
            ok: false,
            message: "Keine Drucker-IP angegeben."
        });
    }

    res.json({
        ok: true,
        service: "GHOST A1 mini Service",
        printerIP: ip,
        message:
            "Webdienst läuft. Der A1-mini-LAN-Tunnel muss im selben Netzwerk wie der Drucker laufen."
    });
});


// Datei hochladen
app.post(
    "/api/upload",
    upload.single("file"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                ok: false,
                message: "Keine Datei erhalten."
            });
        }

        res.json({
            ok: true,
            filename: req.file.originalname,
            storedAs: req.file.filename,
            message: "Datei wurde empfangen."
        });
    }
);


// Druck starten
app.post("/api/print", (req, res) => {

    const { ip } = req.body;

    if (!ip) {
        return res.status(400).json({
            ok: false,
            message: "Keine Drucker-IP."
        });
    }

    /*
      WICHTIG:

      Render kann nicht einfach auf einen privaten
      192.168.x.x-Drucker in deinem Zuhause zugreifen.

      Deshalb wird hier NOCH KEIN Druckbefehl an den
      A1 mini geschickt.
    */

    res.status(501).json({
        ok: false,
        message:
            "Drucker nicht direkt erreichbar: Dieser Render-Server befindet sich nicht im WLAN des A1 mini."
    });
});


// Druck stoppen
app.post("/api/stop", (req, res) => {

    const { ip } = req.body;

    if (!ip) {
        return res.status(400).json({
            ok: false,
            message: "Keine Drucker-IP."
        });
    }

    res.status(501).json({
        ok: false,
        message:
            "Stoppen benötigt ebenfalls eine lokale Verbindung zum A1 mini."
    });
});


app.listen(PORT, () => {
    console.log(
        `GHOST A1 mini Service läuft auf Port ${PORT}`
    );
});
