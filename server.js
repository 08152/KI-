const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const MAX_RESULTS_PER_WORD = 100;
const RESULTS_PER_PAGE = 10;
const MAX_PAGES_PER_WORD = 12;
const DELAY_MS = 800;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// DuckDuckGo – mehrere Endpunkte ausprobieren
// =====================================================

async function fetchHTML(url) {
    const response = await fetch(url, {
        redirect: "follow",
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
}

// =====================================================
// DuckDuckGo HTML parsen
// =====================================================

function parseDuckDuckGo(html) {
    const results = [];
    const seen = new Set();

    // Methode 1: result__a
    const regex1 =
        /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = regex1.exec(html))) {
        const result = makeResult(
            match[1],
            match[2]
        );

        if (
            result &&
            !seen.has(result.url)
        ) {
            seen.add(result.url);
            results.push(result);
        }
    }

    // Methode 2: href zuerst, class danach
    const regex2 =
        /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    while ((match = regex2.exec(html))) {
        const result = makeResult(
            match[1],
            match[2]
        );

        if (
            result &&
            !seen.has(result.url)
        ) {
            seen.add(result.url);
            results.push(result);
        }
    }

    return results.slice(
        0,
        RESULTS_PER_PAGE
    );
}

// =====================================================
// Ergebnis erstellen
// =====================================================

function makeResult(rawUrl, rawTitle) {
    let url = decodeHTML(rawUrl);
    let title = stripHTML(rawTitle);

    // DuckDuckGo Redirect URL
    try {
        const parsed = new URL(
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

    // Manche DDG URLs enthalten uddg direkt
    if (url.includes("uddg=")) {
        const match =
            url.match(
                /[?&]uddg=([^&]+)/i
            );

        if (match) {
            try {
                url =
                    decodeURIComponent(
                        match[1]
                    );
            } catch {}
        }
    }

    if (
        !url.startsWith("http://") &&
        !url.startsWith("https://")
    ) {
        return null;
    }

    if (!title) {
        return null;
    }

    return {
        title,
        url
    };
}

// =====================================================
// HTML bereinigen
// =====================================================

function stripHTML(text) {
    return decodeHTML(
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

function decodeHTML(text) {
    return String(text)
        .replace(
            /&amp;/gi,
            "&"
        )
        .replace(
            /&quot;/gi,
            '"'
        )
        .replace(
            /&#39;/gi,
            "'"
        )
        .replace(
            /&#x27;/gi,
            "'"
        )
        .replace(
            /&lt;/gi,
            "<"
        )
        .replace(
            /&gt;/gi,
            ">"
        );
}

// =====================================================
// Eine DuckDuckGo-Seite
// =====================================================

async function searchPage(word, page) {
    const offset =
        page * 30;

    const urls = [
        "https://html.duckduckgo.com/html/?" +
            "q=" +
            encodeURIComponent(word) +
            "&s=" +
            offset,

        "https://html.duckduckgo.com/html/?" +
            "q=" +
            encodeURIComponent(word) +
            "&s=" +
            offset +
            "&dc=" +
            (offset + 1)
    ];

    let lastError = null;

    for (const url of urls) {
        try {
            const html =
                await fetchHTML(url);

            const results =
                parseDuckDuckGo(html);

            if (results.length > 0) {
                return results;
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    return [];
}

// =====================================================
// Bis zu 100 eindeutige Ergebnisse
// =====================================================

async function searchWord(word) {
    const results = [];
    const seen = new Set();

    for (
        let page = 0;
        page < MAX_PAGES_PER_WORD;
        page++
    ) {
        if (
            results.length >=
            MAX_RESULTS_PER_WORD
        ) {
            break;
        }

        console.log(
            `Suche "${word}" – Seite ${page + 1}/${MAX_PAGES_PER_WORD}`
        );

        try {
            const pageResults =
                await searchPage(
                    word,
                    page
                );

            console.log(
                `  Gefunden: ${pageResults.length}`
            );

            if (
                pageResults.length === 0
            ) {
                // Eine kurze Wiederholung
                await sleep(1200);

                const retry =
                    await searchPage(
                        word,
                        page
                    );

                if (
                    retry.length === 0
                ) {
                    console.log(
                        "  Keine weiteren Ergebnisse."
                    );
                    break;
                }

                pageResults.push(
                    ...retry
                );
            }

            let added = 0;

            for (const item of pageResults) {
                if (
                    seen.has(item.url)
                ) {
                    continue;
                }

                seen.add(item.url);
                results.push(item);
                added++;

                if (
                    results.length >=
                    MAX_RESULTS_PER_WORD
                ) {
                    break;
                }
            }

            console.log(
                `  Gesamt: ${results.length}/${MAX_RESULTS_PER_WORD}`
            );

            if (added === 0) {
                console.log(
                    "  Keine neuen URLs."
                );
                break;
            }

            if (
                page <
                MAX_PAGES_PER_WORD - 1
            ) {
                await sleep(
                    DELAY_MS
                );
            }

        } catch (error) {
            console.error(
                `  Fehler Seite ${page + 1}:`,
                error.message
            );

            // Nicht sofort abbrechen:
            // nächste Seite versuchen.
            await sleep(1500);
        }
    }

    return results.slice(
        0,
        MAX_RESULTS_PER_WORD
    );
}

// =====================================================
// API
// =====================================================

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
                        "Kein Suchwort angegeben."
                });
        }

        try {
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

            const results =
                await searchWord(
                    word
                );

            console.log(
                `FERTIG: ${results.length} Ergebnisse`
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
                "Suchfehler:",
                error
            );

            res
                .status(500)
                .json({
                    error:
                        "DuckDuckGo konnte nicht abgefragt werden.",
                    details:
                        error.message
                });
        }
    }
);

// =====================================================
// Seiten
// =====================================================

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

// =====================================================
// Health
// =====================================================

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

// =====================================================
// Fallback
// =====================================================

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

// =====================================================
// Start
// =====================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "======================================"
        );
        console.log(
            "Ghost AI Training Server"
        );
        console.log(
            `Port: ${PORT}`
        );
        console.log(
            "Bis zu 100 Ergebnisse pro Wort"
        );
        console.log(
            "======================================"
        );
    }
);

// =====================================================
// Hilfsfunktion
// =====================================================

function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}
