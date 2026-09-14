const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const MAX_RESULTS = 100;
const MAX_PAGES = 10;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// HTTP ABRUF
// ======================================================

async function getPage(url) {
    const response = await fetch(url, {
        redirect: "follow",
        headers: {
            "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml,application/xhtml;q=0.9,*/*;q=0.8",
            "Accept-Language":
                "de-DE,de;q=0.9,en;q=0.8"
        }
    });

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    return await response.text();
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
        .replace(/&#(\d+);/g, (_, n) =>
            String.fromCharCode(Number(n))
        );
}

// ======================================================
// TEXT BEREINIGEN
// ======================================================

function cleanText(text) {
    return decodeEntities(
        String(text)
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
    );
}

// ======================================================
// URL AUFLÖSEN
// ======================================================

function cleanURL(raw) {
    if (!raw) return null;

    let url = decodeEntities(
        raw.trim()
    );

    try {
        const parsed = new URL(
            url,
            "https://duckduckgo.com"
        );

        const uddg =
            parsed.searchParams.get("uddg");

        if (uddg) {
            url = uddg;
        }
    } catch {}

    try {
        url = decodeURIComponent(url);
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
// STANDARD DUCKDUCKGO HTML
// ======================================================

function parseStandard(html) {
    const results = [];
    const seen = new Set();

    const patterns = [
        /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,

        /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
    ];

    for (const regex of patterns) {
        let match;

        while ((match = regex.exec(html))) {
            const url =
                cleanURL(match[1]);

            const title =
                cleanText(match[2]);

            if (
                url &&
                title &&
                !seen.has(url)
            ) {
                seen.add(url);

                results.push({
                    title,
                    url
                });
            }

            if (
                results.length >=
                MAX_RESULTS
            ) {
                break;
            }
        }
    }

    return results;
}

// ======================================================
// DUCKDUCKGO LITE
// ======================================================

function parseLite(html) {
    const results = [];
    const seen = new Set();

    // Lite verwendet normale <a>-Links.
    // Wir suchen Links, die wie Suchergebnisse aussehen.
    const regex =
        /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex.exec(html))) {
        const rawURL = match[1];

        const title =
            cleanText(match[2]);

        const url =
            cleanURL(rawURL);

        if (!url || !title) {
            continue;
        }

        // DuckDuckGo-interne Navigation ignorieren
        if (
            url.includes("duckduckgo.com") &&
            !url.includes("uddg=")
        ) {
            continue;
        }

        // Offensichtlich keine Ergebnisse
        if (
            title.length < 2 ||
            title.length > 300
        ) {
            continue;
        }

        if (!seen.has(url)) {
            seen.add(url);

            results.push({
                title,
                url
            });
        }

        if (
            results.length >=
            MAX_RESULTS
        ) {
            break;
        }
    }

    return results;
}

// ======================================================
// EINE SEITE SUCHEN
// ======================================================

async function searchPage(word, page) {
    const offset =
        page * 30;

    const encoded =
        encodeURIComponent(word);

    const urls = [
        // Standard HTML
        `https://html.duckduckgo.com/html/?q=${encoded}&s=${offset}`,

        // Lite
        `https://lite.duckduckgo.com/lite/?q=${encoded}&s=${offset}`
    ];

    let bestResults = [];

    for (const url of urls) {
        try {
            console.log(
                "Abruf:",
                url
            );

            const html =
                await getPage(url);

            // Erst Standardparser
            let results =
                parseStandard(html);

            // Danach Lite-Parser
            if (
                results.length === 0
            ) {
                results =
                    parseLite(html);
            }

            console.log(
                "Gefunden:",
                results.length
            );

            if (
                results.length >
                bestResults.length
            ) {
                bestResults =
                    results;
            }

            if (
                bestResults.length >=
                10
            ) {
                break;
            }

        } catch (error) {
            console.log(
                "Suchweg fehlgeschlagen:",
                error.message
            );
        }
    }

    return bestResults;
}

// ======================================================
// BIS ZU 100 ERGEBNISSE
// ======================================================

async function searchWord(word) {
    const results = [];
    const seen = new Set();

    for (
        let page = 0;
        page < MAX_PAGES;
        page++
    ) {
        if (
            results.length >=
            MAX_RESULTS
        ) {
            break;
        }

        console.log(
            `\n"${word}" – Seite ${page + 1}`
        );

        const pageResults =
            await searchPage(
                word,
                page
            );

        if (
            pageResults.length === 0
        ) {
            console.log(
                "Keine Ergebnisse auf dieser Seite."
            );

            // Nicht sofort aufgeben.
            // Die nächste Seite versuchen.
            await sleep(1000);
            continue;
        }

        for (const result of pageResults) {
            if (
                seen.has(result.url)
            ) {
                continue;
            }

            seen.add(result.url);

            results.push(result);

            if (
                results.length >=
                MAX_RESULTS
            ) {
                break;
            }
        }

        console.log(
            `Gesamt: ${results.length}/${MAX_RESULTS}`
        );

        await sleep(800);
    }

    return results.slice(
        0,
        MAX_RESULTS
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
            return res.status(400).json({
                error:
                    "Kein Wort angegeben."
            });
        }

        console.log(
            "\n================================"
        );

        console.log(
            "TRAINING:",
            word
        );

        try {
            const results =
                await searchWord(
                    word
                );

            console.log(
                `FERTIG: ${results.length} Ergebnisse`
            );

            // Direkt als JSON senden
            return res.json({
                word,
                results,
                count: results.length
            });

        } catch (error) {
            console.error(
                "FEHLER:",
                error
            );

            return res.status(500).json({
                error:
                    "DuckDuckGo-Suche fehlgeschlagen.",
                details:
                    error.message
            });
        }
    }
);

// ======================================================
// TRAINING SEITE
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
// HAUPTSEITE
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
                "Ghost AI Training",
            maxResults:
                MAX_RESULTS
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
// START
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "================================"
        );

        console.log(
            "Ghost AI Training Server"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            "Maximal 100 Ergebnisse pro Wort"
        );

        console.log(
            "================================"
        );
    }
);

// ======================================================
// SLEEP
// ======================================================

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}
