const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// ======================================================
// EINSTELLUNGEN
// ======================================================

const MAX_RESULTS_PER_WORD = 100;

// Wenige Seiten statt sehr vieler Anfragen
const MAX_PAGES_PER_WORD = 10;

// Langsame Anfragen, damit DDG weniger wahrscheinlich blockiert
const DELAY_BETWEEN_REQUESTS = 2500;

// Wenn DDG blockiert, länger warten
const BLOCK_WAIT = 15000;

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json({ limit: "2mb" }));

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ======================================================
// WARTEN
// ======================================================

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

// ======================================================
// HTML ENTITIES
// ======================================================

function decodeEntities(text) {
    return String(text)
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&nbsp;/gi, " ")
        .replace(
            /&#(\d+);/g,
            (_, n) =>
                String.fromCharCode(
                    Number(n)
                )
        );
}

// ======================================================
// TEXT BEREINIGEN
// ======================================================

function cleanText(text) {
    return decodeEntities(
        String(text)
            .replace(
                /<script[\s\S]*?<\/script>/gi,
                ""
            )
            .replace(
                /<style[\s\S]*?<\/style>/gi,
                ""
            )
            .replace(
                /<[^>]+>/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
    );
}

// ======================================================
// URL BEREINIGEN
// ======================================================

function cleanURL(raw) {
    if (!raw) {
        return null;
    }

    let url =
        decodeEntities(
            String(raw).trim()
        );

    try {
        const parsed =
            new URL(
                url,
                "https://duckduckgo.com"
            );

        const uddg =
            parsed.searchParams.get(
                "uddg"
            );

        if (uddg) {
            url = uddg;
        }

    } catch {}

    try {
        url =
            decodeURIComponent(url);
    } catch {}

    if (
        !url.startsWith("http://") &&
        !url.startsWith("https://")
    ) {
        return null;
    }

    return url;
}

// ======================================================
// BLOCK-/FEHLERSEITE ERKENNEN
// ======================================================

function isBlockedPage(html) {
    const text =
        String(html)
            .toLowerCase();

    const indicators = [
        "captcha",
        "unusual traffic",
        "automated queries",
        "too many requests",
        "rate limit",
        "access denied",
        "temporarily blocked",
        "robot check",
        "are you a robot"
    ];

    return indicators.some(
        word =>
            text.includes(word)
    );
}

// ======================================================
// SUCHERGEBNISSE PARSEN
// ======================================================

function parseResults(html) {
    const results = [];
    const seen = new Set();

    // ----------------------------------------------
    // Normales DuckDuckGo HTML
    // ----------------------------------------------

    const patterns = [

        /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,

        /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,

        /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    ];

    for (const regex of patterns) {

        let match;

        while (
            (match =
                regex.exec(html))
        ) {

            const url =
                cleanURL(
                    match[1]
                );

            const title =
                cleanText(
                    match[2]
                );

            if (!url || !title) {
                continue;
            }

            // DuckDuckGo interne Links ignorieren
            if (
                url.includes(
                    "duckduckgo.com"
                ) &&
                !url.includes("uddg=")
            ) {
                continue;
            }

            // Sehr kurze / offensichtlich irrelevante Links
            if (
                title.length < 2 ||
                title.length > 500
            ) {
                continue;
            }

            if (
                seen.has(url)
            ) {
                continue;
            }

            seen.add(url);

            results.push({
                title,
                url
            });

            if (
                results.length >= 20
            ) {
                return results;
            }
        }
    }

    return results;
}

// ======================================================
// DUCKDUCKGO ABFRAGEN
// ======================================================

async function requestDuckDuckGo(
    word,
    page
) {

    const offset =
        page * 30;

    const url =
        "https://html.duckduckgo.com/html/?" +
        "q=" +
        encodeURIComponent(word) +
        "&s=" +
        offset;

    console.log(
        "DuckDuckGo:",
        url
    );

    const response =
        await fetch(
            url,
            {
                method: "GET",
                redirect: "follow",
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                    "Accept-Language":
                        "de-DE,de;q=0.9,en;q=0.8",

                    "Cache-Control":
                        "no-cache"
                }
            }
        );

    if (
        response.status === 429 ||
        response.status === 403
    ) {

        return {
            blocked: true,
            results: []
        };
    }

    if (!response.ok) {

        throw new Error(
            `DuckDuckGo HTTP ${response.status}`
        );
    }

    const html =
        await response.text();

    // Blockseite?
    if (
        isBlockedPage(html)
    ) {

        return {
            blocked: true,
            results: []
        };
    }

    const results =
        parseResults(html);

    return {
        blocked: false,
        results
    };
}

// ======================================================
// EIN WORT SUCHEN
// ======================================================

async function searchWord(word) {

    const allResults = [];
    const seen = new Set();

    for (
        let page = 0;
        page < MAX_PAGES_PER_WORD;
        page++
    ) {

        if (
            allResults.length >=
            MAX_RESULTS_PER_WORD
        ) {
            break;
        }

        console.log(
            `Suche "${word}" – Seite ${page + 1}/${MAX_PAGES_PER_WORD}`
        );

        let response;

        try {

            response =
                await requestDuckDuckGo(
                    word,
                    page
                );

        } catch (error) {

            console.error(
                "DuckDuckGo-Fehler:",
                error.message
            );

            // Bei einem Fehler nicht als 0 Ergebnisse
            // behandeln.
            await sleep(
                BLOCK_WAIT
            );

            continue;
        }

        // ==================================================
        // BLOCKIERUNG
        // ==================================================

        if (
            response.blocked
        ) {

            console.log(
                "DuckDuckGo hat die Anfrage momentan blockiert."
            );

            console.log(
                `Warte ${BLOCK_WAIT / 1000} Sekunden...`
            );

            await sleep(
                BLOCK_WAIT
            );

            // Danach dieselbe Seite nochmals versuchen
            page--;

            continue;
        }

        // ==================================================
        // ERGEBNISSE
        // ==================================================

        const results =
            response.results;

        console.log(
            `Seite liefert ${results.length} Ergebnisse`
        );

        if (
            results.length === 0
        ) {

            console.log(
                "Keine erkennbaren Ergebnisse auf dieser Seite."
            );

            // Nicht sofort mehrere Anfragen
            // hintereinander schicken.
            await sleep(
                DELAY_BETWEEN_REQUESTS
            );

            continue;
        }

        let added = 0;

        for (
            const result of results
        ) {

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

            if (
                allResults.length >=
                MAX_RESULTS_PER_WORD
            ) {
                break;
            }
        }

        console.log(
            `Gesamt für "${word}": ${allResults.length}/${MAX_RESULTS_PER_WORD}`
        );

        if (
            added === 0
        ) {

            console.log(
                "Keine neuen URLs."
            );

            break;
        }

        // Langsame Abfrage
        await sleep(
            DELAY_BETWEEN_REQUESTS
        );
    }

    return allResults.slice(
        0,
        MAX_RESULTS_PER_WORD
    );
}

// ======================================================
// TRAINING API
// ======================================================

app.post(
    "/api/training/search",
    async (req, res) => {

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

        console.log("");
        console.log(
            "======================================"
        );
        console.log(
            `TRAINING: ${word}`
        );
        console.log(
            "======================================"
        );

        try {

            const results =
                await searchWord(
                    word
                );

            console.log(
                `FERTIG: ${results.length} Ergebnisse`
            );

            // Immer echtes JSON
            return res.json({
                word,
                results,
                count:
                    results.length,
                maxResults:
                    MAX_RESULTS_PER_WORD
            });

        } catch (error) {

            console.error(
                "Training-Fehler:",
                error
            );

            return res
                .status(500)
                .json({
                    error:
                        "Suche fehlgeschlagen.",
                    details:
                        error.message
                });
        }
    }
);

// ======================================================
// TRAINING HTML
// ======================================================

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

// ======================================================
// INDEX
// ======================================================

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

// ======================================================
// HEALTH
// ======================================================

app.get(
    "/health",
    (req, res) => {

        res.json({
            status: "ok",
            service:
                "Ghost AI Training Server",
            maxResultsPerWord:
                MAX_RESULTS_PER_WORD
        });
    }
);

// ======================================================
// FALLBACK
// ======================================================

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

// ======================================================
// SERVER START
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "Ghost AI Training Server gestartet"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `Maximal ${MAX_RESULTS_PER_WORD} Ergebnisse pro Wort`
        );

        console.log(
            "======================================"
        );
    }
);
