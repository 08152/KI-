const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

ffmpeg.setFfmpegPath(ffmpegPath);

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({
    dest: uploadDir,
    limits: {
        fileSize: 500 * 1024 * 1024
    }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});


/*
========================================
VIDEO → MP4
========================================
*/

app.post(
    "/convert",
    upload.single("video"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                error: "Kein Video hochgeladen."
            });
        }

        const input = req.file.path;

        const id =
            crypto.randomBytes(12).toString("hex");

        const output =
            path.join(
                outputDir,
                id + ".mp4"
            );

        ffmpeg(input)
            .videoCodec("libx264")
            .audioCodec("aac")
            .outputOptions([
                "-preset veryfast",
                "-crf 26",
                "-movflags +faststart"
            ])
            .format("mp4")

            .on("start", command => {
                console.log(
                    "FFmpeg gestartet:"
                );

                console.log(command);
            })

            .on("progress", progress => {

                console.log(
                    `Fortschritt: ${
                        progress.percent
                            ? progress.percent.toFixed(1)
                            : 0
                    }%`
                );

            })

            .on("error", error => {

                console.error(
                    "FFmpeg Fehler:",
                    error
                );

                try {
                    fs.unlinkSync(input);
                } catch {}

                try {
                    if(fs.existsSync(output)){
                        fs.unlinkSync(output);
                    }
                } catch {}

                if(!res.headersSent){

                    res.status(500).json({
                        error:
                            "Video konnte nicht konvertiert werden."
                    });

                }

            })

            .on("end", () => {

                console.log(
                    "Konvertierung fertig."
                );

                try {
                    fs.unlinkSync(input);
                } catch {}

                res.download(
                    output,
                    "converted.mp4",
                    error => {

                        if(error){
                            console.error(
                                "Download-Fehler:",
                                error
                            );
                        }

                        try {
                            fs.unlinkSync(output);
                        } catch {}

                    }
                );

            })

            .save(output);
    }
);


/*
========================================
SERVER START
========================================
*/

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `GHOST Video Converter läuft auf Port ${PORT}`
        );

    }
);
