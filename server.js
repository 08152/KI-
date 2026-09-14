const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;


/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({
    limit: "10mb"
}));

app.use(express.static(
    path.join(__dirname, "public")
));


/* =========================================================
   POSTGRES
========================================================= */

let pool = null;

if (process.env.DATABASE_URL) {

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,

        ssl: {
            rejectUnauthorized: false
        }
    });

}


/* =========================================================
   DATENBANK
========================================================= */

async function initDatabase() {

    if (!pool) {

        console.log(
            "Keine DATABASE_URL gefunden."
        );

        console.log(
            "Server läuft ohne dauerhafte Datenbank."
        );

        return;
    }


    await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);


    console.log(
        "PostgreSQL erfolgreich verbunden."
    );
}


/* =========================================================
   PROJEKT LADEN
========================================================= */

app.get(
    "/api/project/:id",
    async (req, res) => {

        const id = req.params.id;

        try {

            if (!pool) {

                return res.status(404).json({
                    error: "Keine Datenbank verbunden"
                });

            }


            const result = await pool.query(
                `
                SELECT data
                FROM projects
                WHERE id = $1
                `,
                [id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    error: "Projekt nicht gefunden"
                });

            }


            res.json(
                result.rows[0].data
            );


        } catch (error) {

            console.error(
                "Ladefehler:",
                error
            );

            res.status(500).json({
                error: "Serverfehler"
            });

        }

    }
);


/* =========================================================
   PROJEKT SPEICHERN
========================================================= */

app.put(
    "/api/project/:id",
    async (req, res) => {

        const id = req.params.id;
        const data = req.body;


        if (
            !data ||
            !Array.isArray(data.objects)
        ) {

            return res.status(400).json({
                error: "Ungültige Projektdaten"
            });

        }


        try {

            if (!pool) {

                return res.status(503).json({
                    error:
                        "Keine PostgreSQL-Datenbank verbunden"
                });

            }


            await pool.query(
                `
                INSERT INTO projects
                (
                    id,
                    data,
                    updated_at
                )
                VALUES
                (
                    $1,
                    $2::jsonb,
                    NOW()
                )

                ON CONFLICT (id)

                DO UPDATE SET
                    data = $2::jsonb,
                    updated_at = NOW()
                `,
                [
                    id,
                    JSON.stringify(data)
                ]
            );


            res.json({
                success: true,
                id: id
            });


        } catch (error) {

            console.error(
                "Speicherfehler:",
                error
            );

            res.status(500).json({
                error:
                    "Projekt konnte nicht gespeichert werden"
            });

        }

    }
);


/* =========================================================
   PROJEKT LÖSCHEN
========================================================= */

app.delete(
    "/api/project/:id",
    async (req, res) => {

        const id = req.params.id;


        try {

            if (!pool) {

                return res.status(503).json({
                    error:
                        "Keine Datenbank verbunden"
                });

            }


            await pool.query(
                `
                DELETE FROM projects
                WHERE id = $1
                `,
                [id]
            );


            res.json({
                success: true
            });


        } catch (error) {

            console.error(
                "Löschfehler:",
                error
            );

            res.status(500).json({
                error:
                    "Projekt konnte nicht gelöscht werden"
            });

        }

    }
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/health",
    async (req, res) => {

        if (!pool) {

            return res.json({
                status: "ok",
                database: "not connected"
            });

        }


        try {

            await pool.query(
                "SELECT 1"
            );


            res.json({
                status: "ok",
                database: "postgres"
            });


        } catch (error) {

            res.status(500).json({
                status: "error",
                database: "postgres"
            });

        }

    }
);


/* =========================================================
   FRONTEND
========================================================= */

/*
   Express 5:
   KEIN app.get("*") verwenden.
*/

app.use(
    (req, res, next) => {

        if (
            req.path.startsWith("/api/")
        ) {

            return next();

        }


        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


/* =========================================================
   START
========================================================= */

async function start() {

    try {

        await initDatabase();


        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    "================================"
                );

                console.log(
                    "Ghost 3D Model Editor gestartet"
                );

                console.log(
                    "Port:",
                    PORT
                );

                console.log(
                    "================================"
                );

            }
        );


    } catch (error) {

        console.error(
            "STARTFEHLER:",
            error
        );

        process.exit(1);

    }

}


start();
