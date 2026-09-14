const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// EINSTELLUNGEN
// ==========================================

const MAX_RESULTS_PER_WORD = 100;
const RESULTS_PER_PAGE = 20;
const MAX_PAGES_PER_WORD = 10;
const DELAY_BETWEEN_PAGES = 700;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json({ limit: "2mb" }));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ==========================================
// DUCKDUCKGO
// ==========================================

async function duckDuckGoSearch(word, page) {
    const offset = page * 30;

    const url =
        "https://html.duckduckgo.com/html/?" +
        "q=" +
        encodeURIComponent(word) +
        "&s=" +
        offset;

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
            "DuckDuckGo HTTP " +
            response.status
        );
    }

    const html = await response.text();

    return parseDuckDuckGo(html);
}

// ==========================================
// HTML PARSER
// ==========================================

function parseDuckDuckGo(html) {
    const results = [];

    const regex =
        /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
        (match = regex.exec(html)) &&
        results.length < RESULTS_PER_PAGE
    ) {
        let url = match[1];

        let title = stripHTML(
            match[2]
        );

        // URL dekodieren
        try {
            url = decodeURIComponent(url);
        } catch {}

        // DuckDuckGo Redirect URL auflösen
        if (url.includes("uddg=")) {
            const found =
                url.match(
                    /[?&]uddg=([^&]+)/
                );

            if (found) {
                try {
                    url =
                        decodeURIComponent(
                            found[1]
                        );
                } catch {}
            }
        }

        // Nur echte HTTP-URLs
        if (
            !url.startsWith("http://") &&
            !url.startsWith("https://")
        ) {
            continue;
        }

        results.push({
            title,
            url
        });
    }

    return results;
}

// ==========================================
// HTML BEREINIGEN
// ==========================================

function stripHTML(text) {
    return String(text)
        .replace(
            /<[^>]*>/g,
            " "
        )
        .replace(
            /&amp;/g,
            "&"
        )
        .replace(
            /&quot;/g,
            '"'
        )
        .replace(
            /&#x27;/g,
            "'"
        )
        .replace(
            /&lt;/g,
            "<"
        )
        .replace(
            /&gt;/g,
            ">"
        )
        .replace(
            /&#39;/g,
            "'"
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

// ==========================================
// BIS ZU 100 ERGEBNISSE PRO WORT
// ==========================================

async function searchManyPages(word) {
    const allResults = [];
    const seen = new Set();

    for (
        let page = 0;
        page < MAX_PAGES_PER_WORD;
        page++
    ) {
        // Stop sobald 100 erreicht wurden
        if (
            allResults.length >=
            MAX_RESULTS_PER_WORD
        ) {
            break;
        }

        console.log(
            `DuckDuckGo: "${word}" – Seite ${page + 1}/${MAX_PAGES_PER_WORD}`
        );

        try {
            const results =
                await duckDuckGoSearch(
                    word,
                    page
                );

            // Keine weiteren Ergebnisse
            if (!results.length) {
                console.log(
                    `Keine weiteren Ergebnisse für "${word}".`
                );

                break;
            }

            let added = 0;

            for (const result of results) {
                // Schon vorhandene URL überspringen
                if (
                    seen.has(result.url)
                ) {
                    continue;
                }

                seen.add(result.url);

                allResults.push(
                    result
                );

                added++;

                // HARTE Grenze: maximal 100
                if (
                    allResults.length >=
                    MAX_RESULTS_PER_WORD
                ) {
                    break;
                }
            }

            console.log(
                `"${word}": ${allResults.length}/${MAX_RESULTS_PER_WORD} Ergebnisse`
            );

            // Wenn diese Seite keine neuen URLs
            // gebracht hat, nicht endlos weitersuchen
            if (added === 0) {
                console.log(
                    `Keine neuen Ergebnisse mehr für "${word}".`
                );

                break;
            }

            // Pause zwischen den Seiten
            if (
                page <
                    MAX_PAGES_PER_WORD - 1 &&
                allResults.length <
                    MAX_RESULTS_PER_WORD
            ) {
                await sleep(
                    DELAY_BETWEEN_PAGES
                );
            }

        } catch (error) {
            console.error(
                `Fehler bei "${word}", Seite ${page + 1}:`,
                error.message
            );

            break;
        }
    }

    // Sicherheitshalber nochmals auf exakt 100 begrenzen
    return allResults.slice(
        0,
        MAX_RESULTS_PER_WORD
    );
}

// ==========================================
// SLEEP
// ==========================================

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}

// ==========================================
// TRAINING API
// ==========================================

app.post(
    "/api/training/search",
    async (req, res) => {
        try {
            const word =
                String(
                    req.body?.word || ""
                ).trim();

            if (!word) {
                return res
                    .status(400)
                    .json({
                        error:
                            "Kein Wort angegeben."
                    });
            }

            console.log(
                "======================================"
            );

            console.log(
                `TRAINING: ${word}`
            );

            console.log(
                `Ziel: ${MAX_RESULTS_PER_WORD} Ergebnisse`
            );

            const results =
                await searchManyPages(
                    word
                );

            console.log(
                `FERTIG: ${word} → ${results.length} Ergebnisse`
            );

            console.log(
                "======================================"
            );

            res.json({
                word,
                results,
                count: results.length,
                maxResults:
                    MAX_RESULTS_PER_WORD
            });

        } catch (error) {
            console.error(
                "Training-Fehler:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "Die DuckDuckGo-Suche ist fehlgeschlagen."
                });
        }
    }
);

// ==========================================
// TRAINING HTML
// ==========================================

app.get(
    "/training",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "training.html"
            )
        );
    }
);

// ==========================================
// HAUPTSEITE
// ==========================================

app.get(
    "/",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
    "/health",
    (req, res) => {
        res.json({
            status: "ok",
            service:
                "Ghost AI Training Server",
            maxResultsPerWord:
                MAX_RESULTS_PER_WORD,
            resultsPerPage:
                RESULTS_PER_PAGE,
            maxPagesPerWord:
                MAX_PAGES_PER_WORD
        });
    }
);

// ==========================================
// FALLBACK
// ==========================================

app.use(
    (req, res, next) => {
        if (
            req.path.startsWith(
                "/api/"
            )
        ) {
            return next();
        }

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);

// ==========================================
// SERVER START
// ==========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "======================================"
        );

        console.log(
            "Ghost AI Server gestartet"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `Max. Ergebnisse pro Wort: ${MAX_RESULTS_PER_WORD}`
        );

        console.log(
            `Max. Seiten pro Wort: ${MAX_PAGES_PER_WORD}`
        );

        console.log(
            "======================================"
        );
    }
);
