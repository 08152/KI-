import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "training");
const PROJECT_DIR = path.join(DATA_DIR, "projects");

for (const dir of [DATA_DIR, UPLOAD_DIR, PROJECT_DIR]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),

    filename: (req, file, cb) => {
        const safeName = file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, "_");

        cb(
            null,
            Date.now() + "_" + safeName
        );
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});

const datasetFile = path.join(DATA_DIR, "dataset.json");

function readDataset() {
    if (!fs.existsSync(datasetFile)) {
        return [];
    }

    try {
        return JSON.parse(
            fs.readFileSync(datasetFile, "utf8")
        );
    } catch {
        return [];
    }
}

function saveDataset(data) {
    fs.writeFileSync(
        datasetFile,
        JSON.stringify(data, null, 2)
    );
}

function getProjectFile(id) {
    return path.join(
        PROJECT_DIR,
        id + ".json"
    );
}


/* =========================
   DATASET
========================= */

app.get("/api/dataset", (req, res) => {

    res.json({
        success: true,
        items: readDataset()
    });

});


app.post(
    "/api/dataset/upload",
    upload.single("audio"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "Keine Audiodatei erhalten."
            });
        }

        const dataset = readDataset();

        const item = {
            id: Date.now().toString(),
            filename: req.file.filename,
            originalName: req.file.originalname,

            title: req.body.title || req.file.originalname,

            style: req.body.style || "Unbekannt",

            mood: req.body.mood || "Neutral",

            lyrics: req.body.lyrics || "",

            bpm: Number(req.body.bpm) || 0,

            createdAt: new Date().toISOString()
        };

        dataset.push(item);

        saveDataset(dataset);

        res.json({
            success: true,
            item
        });

    }
);


app.delete(
    "/api/dataset/:id",
    (req, res) => {

        const id = req.params.id;

        let dataset = readDataset();

        const item = dataset.find(
            x => x.id === id
        );

        if (item) {

            const filePath = path.join(
                UPLOAD_DIR,
                item.filename
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

        }

        dataset = dataset.filter(
            x => x.id !== id
        );

        saveDataset(dataset);

        res.json({
            success: true
        });

    }
);


/* =========================
   PROJECTS
========================= */

app.get("/api/projects", (req, res) => {

    const files = fs.readdirSync(PROJECT_DIR);

    const projects = [];

    for (const file of files) {

        if (!file.endsWith(".json")) {
            continue;
        }

        try {

            const project = JSON.parse(
                fs.readFileSync(
                    path.join(PROJECT_DIR, file),
                    "utf8"
                )
            );

            projects.push(project);

        } catch {}

    }

    projects.sort(
        (a, b) =>
            new Date(b.updatedAt) -
            new Date(a.updatedAt)
    );

    res.json({
        success: true,
        projects
    });

});


app.post("/api/projects", (req, res) => {

    const {
        name,
        prompt,
        lyrics,
        style
    } = req.body;

    const id =
        Date.now().toString() +
        Math.random()
            .toString(36)
            .slice(2, 7);

    const project = {

        id,

        name:
            name ||
            "Neues Risky Life Projekt",

        prompt:
            prompt || "",

        lyrics:
            lyrics || "",

        style:
            style || "",

        createdAt:
            new Date().toISOString(),

        updatedAt:
            new Date().toISOString()

    };

    fs.writeFileSync(
        getProjectFile(id),
        JSON.stringify(project, null, 2)
    );

    res.json({
        success: true,
        project
    });

});


app.put("/api/projects/:id", (req, res) => {

    const file = getProjectFile(
        req.params.id
    );

    if (!fs.existsSync(file)) {

        return res.status(404).json({
            success: false,
            error: "Projekt nicht gefunden."
        });

    }

    const oldProject = JSON.parse(
        fs.readFileSync(file, "utf8")
    );

    const project = {

        ...oldProject,

        ...req.body,

        id: oldProject.id,

        updatedAt:
            new Date().toISOString()

    };

    fs.writeFileSync(
        file,
        JSON.stringify(project, null, 2)
    );

    res.json({
        success: true,
        project
    });

});


app.delete("/api/projects/:id", (req, res) => {

    const file = getProjectFile(
        req.params.id
    );

    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }

    res.json({
        success: true
    });

});


/* =========================
   TRAINING STATUS
========================= */

let training = {

    running: false,

    progress: 0,

    epoch: 0,

    totalEpochs: 0,

    message: "Bereit"

};


app.get(
    "/api/training/status",
    (req, res) => {

        res.json({
            success: true,
            training
        });

    }
);


app.post(
    "/api/training/start",
    async (req, res) => {

        if (training.running) {

            return res.status(400).json({
                success: false,
                error: "Training läuft bereits."
            });

        }

        const dataset = readDataset();

        if (dataset.length === 0) {

            return res.status(400).json({
                success: false,
                error:
                    "Bitte füge zuerst Trainingsdaten hinzu."
            });

        }

        const epochs =
            Math.max(
                1,
                Math.min(
                    Number(req.body.epochs) || 10,
                    100
                )
            );

        training = {

            running: true,

            progress: 0,

            epoch: 0,

            totalEpochs: epochs,

            message:
                "Trainingsdaten werden vorbereitet..."

        };

        res.json({
            success: true,
            message:
                "Training gestartet."
        });


        /*
        VERSION 1 TRAINING PROTOTYPE

        Hier wird später der echte
        ML-Trainer angeschlossen.

        Aktuell simuliert dieser Teil
        die Trainings-Pipeline und
        überprüft die Dataset-Struktur.
        */

        for (
            let epoch = 1;
            epoch <= epochs;
            epoch++
        ) {

            training.epoch = epoch;

            training.progress =
                Math.round(
                    epoch / epochs * 100
                );

            training.message =
                `Training Epoch ${epoch}/${epochs}`;

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1200
                    )
            );

        }


        const model = {

            name:
                "RiskyLife-Music-v1",

            trainedAt:
                new Date().toISOString(),

            datasetSize:
                dataset.length,

            epochs,

            type:
                "Dataset Prototype",

            status:
                "training_complete"

        };

        fs.writeFileSync(
            path.join(
                DATA_DIR,
                "model-v1.json"
            ),

            JSON.stringify(
                model,
                null,
                2
            )
        );


        training = {

            running: false,

            progress: 100,

            epoch: epochs,

            totalEpochs: epochs,

            message:
                "Training abgeschlossen!"

        };

    }
);


/* =========================
   MODEL
========================= */

app.get(
    "/api/model",
    (req, res) => {

        const file = path.join(
            DATA_DIR,
            "model-v1.json"
        );

        if (!fs.existsSync(file)) {

            return res.json({
                success: true,
                model: null
            });

        }

        res.json({
            success: true,

            model:
                JSON.parse(
                    fs.readFileSync(
                        file,
                        "utf8"
                    )
                )
        });

    }
);


app.listen(PORT, () => {

    console.log(
        `Risky Life Studio läuft auf Port ${PORT}`
    );

});
