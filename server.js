const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const MAX_RESULTS_PER_QUERY = 20;
const MAX_PAGES_PER_WORD = 5;

app.use(express.json({ limit: "2mb" }));

/* public/training.html */
app.use(express.static(path.join(__dirname, "public")));

/* --------------------------------------------------
   DuckDuckGo
-------------------------------------------------- */

async function duckDuckGoSearch(word, page) {
    const offset = page * 30;

    const url =
        "https://html.duckduckgo.com/html/?" +
        "q=" + encodeURIComponent(word) +
        "&s=" + offset;

    const response = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml"
        }
    });

    if (!response.ok) {
        throw new Error(
            "DuckDuckGo HTTP " + response.status
        );
    }

    const html = await response.text();

    return parseDuckDuckGo(html);
}

/* --------------------------------------------------
   Ergebnisse auslesen
-------------------------------------------------- */

function parseDuckDuckGo(html) {
    const results = [];

    const regex =
        /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
        (match = regex.exec(html)) &&
        results.length < MAX_RESULTS_PER_QUERY
    ) {
        let url = match[1];
        let title = stripHTML(match[2]);

        try {
            url = decodeURIComponent(url);
        } catch {}

        /*
         * DuckDuckGo verwendet teilweise:
         * //duckduckgo.com/l/?uddg=...
         */

        if (url.includes("uddg=")) {
            const found =
                url.match(/[?&]uddg=([^&]+)/);

            if (found) {
                try {
                    url = decodeURIComponent(found[1]);
                } catch {}
            }
        }

        if (!url.startsWith("http")) {
            continue;
        }

        results.push({
            title,
            url
        });
    }

    return results;
}

/* --------------------------------------------------
   HTML reinigen
-------------------------------------------------- */

function stripHTML(text) {
    return String(text)
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/* --------------------------------------------------
   Mehrere Seiten durchsuchen
-------------------------------------------------- */

async function searchManyPages(word) {
    const all = [];
    const seen = new Set();

    for (
        let page = 0;
        page < MAX_PAGES_PER_WORD;
        page++
    ) {
        console.log(
            `DuckDuckGo: "${word}" – Seite ${page + 1}`
        );

        try {
            const results =
                await duckDuckGoSearch(word, page);

            if (!results.length) {
                break;
            }

            let added = 0;

            for (const result of results) {
                if (seen.has(result.url)) {
                    continue;
                }

                seen.add(result.url);
                all.push(result);
                added++;
            }

            /*
             * Wenn eine Seite keine neuen Treffer
             * mehr bringt, abbrechen.
             */

            if (added === 0) {
                break;
            }

            /*
             * Kleine Pause zwischen den Anfragen,
             * damit nicht sofort viele Anfragen
             * hintereinander gesendet werden.
             */

            if (page < MAX_PAGES_PER_WORD - 1) {
                await sleep(700);
            }

        } catch (error) {
            console.error(
                `Fehler bei "${word}", Seite ${page + 1}:`,
                error.message
            );

            /*
             * Bei einem Fehler nicht alles verlieren.
             * Bereits gefundene Ergebnisse werden
             * zurückgegeben.
             */
            break;
        }
    }

    return all;
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

/* --------------------------------------------------
   Training API
-------------------------------------------------- */

app.post(
    "/api/training/search",
    async (req, res) => {

        try {
            const word =
                String(req.body?.word || "").trim();

            if (!word) {
                return res.status(400).json({
                    error: "Kein Wort angegeben."
                });
            }

            const results =
                await searchManyPages(word);

            res.json({
                word,
                pages: MAX_PAGES_PER_WORD,
                results
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Die DuckDuckGo-Suche ist fehlgeschlagen."
            });
        }
    }
);

/* --------------------------------------------------
   Training HTML
-------------------------------------------------- */

app.get("/training", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "training.html"
        )
    );
});

/* --------------------------------------------------
   Hauptseite
-------------------------------------------------- */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );
});

/* --------------------------------------------------
   Health Check
-------------------------------------------------- */

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Ghost AI Training Server"
    });
});

/* --------------------------------------------------
   Express 5 Fallback
-------------------------------------------------- */

app.use((req, res, next) => {

    if (req.path.startsWith("/api/")) {
        return next();
    }

    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );
});

/* --------------------------------------------------
   Server
-------------------------------------------------- */

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Ghost AI Server läuft auf Port ${PORT}`
        );
    }
);
