const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;


const uploadFolder = path.join(__dirname, "uploads");


if (!fs.existsSync(uploadFolder)) {

    fs.mkdirSync(uploadFolder);

}


const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        cb(null, uploadFolder);

    },

    filename: (req, file, cb) => {

        const randomName = crypto.randomBytes(16).toString("hex");

        const extension = path.extname(file.originalname);

        cb(null, randomName + extension.toLowerCase());

    }

});


const upload = multer({

    storage: storage,

    limits: {

        fileSize: 100 * 1024 * 1024

    },

    fileFilter: (req, file, cb) => {

        if (
            file.mimetype.startsWith("image/") ||
            file.mimetype.startsWith("video/")
        ) {

            cb(null, true);

        }

        else {

            cb(new Error("Nur Bilder und Videos sind erlaubt."));

        }

    }

});


app.use(express.static(__dirname));


app.use("/files", express.static(uploadFolder, {

    setHeaders: (res, filePath) => {

        res.setHeader("Content-Disposition", "inline");

    }

}));


app.post("/upload", upload.single("file"), (req, res) => {

    if (!req.file) {

        return res.status(400).json({

            error: "Keine Datei erhalten."

        });

    }


    const protocol = req.headers["x-forwarded-proto"] || req.protocol;

    const host = req.get("host");


    const directLink =
        protocol +
        "://" +
        host +
        "/files/" +
        req.file.filename;


    res.json({

        success: true,

        filename: req.file.filename,

        directLink: directLink

    });

});


app.use((error, req, res, next) => {

    console.error(error);

    res.status(400).json({

        error: error.message || "Ein Fehler ist aufgetreten."

    });

});


app.listen(PORT, () => {

    console.log("Server läuft auf Port " + PORT);

});
