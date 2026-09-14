const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 10000;


/* =========================================================
   EXPRESS
========================================================= */

app.use(
    express.json({
        limit: "5mb"
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/* =========================================================
   POSTGRES
========================================================= */

let pool = null;

if(process.env.DATABASE_URL){

    pool = new Pool({
        connectionString:
            process.env.DATABASE_URL,

        ssl:
            process.env.DATABASE_URL.includes(
                "localhost"
            )
            ? false
            : {
                rejectUnauthorized:false
            }
    });
}


/* =========================================================
   DATENBANK INITIALISIEREN
========================================================= */

async function initDatabase(){

    if(!pool){

        console.log(
            "DATABASE_URL nicht gesetzt."
        );

        console.log(
            "Lokaler Fallback wird verwendet."
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
        "PostgreSQL bereit."
    );
}


/* =========================================================
   LOKALER FALLBACK
========================================================= */

const memoryProjects =
    new Map();


/* =========================================================
   PROJEKT LADEN
========================================================= */

app.get(
    "/api/project/:id",
    async(req,res)=>{

        const id=
            req.params.id;


        try{

            if(pool){

                const result=
                    await pool.query(
                        `
                        SELECT data
                        FROM projects
                        WHERE id=$1
                        `,
                        [id]
                    );


                if(
                    result.rows.length===0
                ){

                    return res.status(
                        404
                    ).json({
                        error:
                            "Projekt nicht gefunden"
                    });
                }


                return res.json(
                    result.rows[0].data
                );
            }


            const data=
                memoryProjects.get(id);


            if(!data){

                return res.status(
                    404
                ).json({
                    error:
                        "Projekt nicht gefunden"
                });
            }


            res.json(data);

        }catch(error){

            console.error(error);

            res.status(
                500
            ).json({
                error:
                    "Serverfehler"
            });
        }
    }
);


/* =========================================================
   PROJEKT SPEICHERN
========================================================= */

app.put(
    "/api/project/:id",
    async(req,res)=>{

        const id=
            req.params.id;

        const data=
            req.body;


        if(
            !data ||
            !Array.isArray(data.objects)
        ){

            return res.status(
                400
            ).json({
                error:
                    "Ungültige Projektdaten"
            });
        }


        try{

            if(pool){

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
                    ON CONFLICT(id)
                    DO UPDATE SET
                        data=$2::jsonb,
                        updated_at=NOW()
                    `,
                    [
                        id,
                        JSON.stringify(data)
                    ]
                );

            }else{

                memoryProjects.set(
                    id,
                    data
                );
            }


            res.json({
                success:true,
                id:id
            });

        }catch(error){

            console.error(error);

            res.status(
                500
            ).json({
                error:
                    "Speichern fehlgeschlagen"
            });
        }
    }
);


/* =========================================================
   PROJEKT LÖSCHEN
========================================================= */

app.delete(
    "/api/project/:id",
    async(req,res)=>{

        const id=
            req.params.id;


        try{

            if(pool){

                await pool.query(
                    `
                    DELETE FROM projects
                    WHERE id=$1
                    `,
                    [id]
                );

            }else{

                memoryProjects.delete(id);
            }


            res.json({
                success:true
            });

        }catch(error){

            console.error(error);

            res.status(
                500
            ).json({
                error:
                    "Löschen fehlgeschlagen"
            });
        }
    }
);


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/health",
    async(req,res)=>{

        if(!pool){

            return res.json({
                status:"ok",
                database:"memory"
            });
        }


        try{

            await pool.query(
                "SELECT 1"
            );

            res.json({
                status:"ok",
                database:"postgres"
            });

        }catch(error){

            res.status(
                500
            ).json({
                status:"error"
            });
        }
    }
);


/* =========================================================
   FRONTEND
========================================================= */

app.get(
    "*",
    (req,res)=>{

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

async function start(){

    await initDatabase();


    app.listen(
        PORT,
        "0.0.0.0",
        ()=>{
            console.log(
                `Server läuft auf Port ${PORT}`
            );
        }
    );
}

start();
