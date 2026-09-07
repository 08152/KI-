const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

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

    console.log("Starte FFmpeg");

    const args = [
      "-i",
      input,

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "26",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-movflags",
      "+faststart",

      "-y",
      output
    ];

    const ffmpeg =
      spawn("ffmpeg", args);

    let errorText = "";

    ffmpeg.stderr.on(
      "data",
      data => {

        const text =
          data.toString();

        errorText += text;

        console.log(text);
      }
    );

    ffmpeg.on(
      "error",
      error => {

        console.error(
          "FFmpeg Fehler:",
          error
        );

        cleanup(
          input,
          output
        );

        if (!res.headersSent) {
          res.status(500).json({
            error:
              "FFmpeg ist auf dem Server nicht installiert."
          });
        }
      }
    );

    ffmpeg.on(
      "close",
      code => {

        console.log(
          "FFmpeg beendet:",
          code
        );

        if (code !== 0) {

          console.error(
            errorText
          );

          cleanup(
            input,
            output
          );

          if (!res.headersSent) {
            res.status(500).json({
              error:
                "Die Konvertierung ist fehlgeschlagen."
            });
          }

          return;
        }

        if (
          !fs.existsSync(output)
        ) {

          cleanup(
            input,
            output
          );

          return res.status(500).json({
            error:
              "MP4-Datei wurde nicht erstellt."
          });
        }

        res.download(
          output,
          "converted.mp4",
          error => {

            cleanup(
              input,
              output
            );

            if (error) {
              console.error(
                "Download-Fehler:",
                error
              );
            }
          }
        );
      }
    );
  }
);

function cleanup(
  input,
  output
) {

  try {
    if (fs.existsSync(input)) {
      fs.unlinkSync(input);
    }
  } catch {}

  try {
    if (fs.existsSync(output)) {
      fs.unlinkSync(output);
    }
  } catch {}
}

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "GHOST Video Converter läuft auf Port " +
      PORT
    );

  }
);
