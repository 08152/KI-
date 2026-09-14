const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const MAX_RESULTS_PER_WORD = 100;
const MAX_PAGES_PER_SEARCH = 10;
const DELAY_BETWEEN_REQUESTS = 2500;
const BLOCK_WAIT = 15000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

function cleanURL(raw) {
    if (!raw) return null;

    let url = decodeEntities(
        String(raw).trim()
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

function isBlockedPage(html) {
    const text = String(html).toLowerCase();

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
        indicator =>
            text.includes(indicator)
    );
}

function parseResults(html) {
    const results = [];
    const seen = new Set();

    const patterns = [
        /<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,

        /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
    ];

    for (const regex of patterns) {
        let match;

        while ((match = regex.exec(html))) {
            const url = cleanURL(match[1]);
            const title = cleanText(match[2]);

            if (!url || !title) continue;

            if (
                url.includes("duckduckgo.com") &&
                !url.includes("uddg=")
            ) {
                continue;
            }

            if (seen.has(url)) continue;

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

async function requestDuckDuckGo(
    query,
    page
) {
    const offset = page * 30;

    const url =
        "https://html.duckduckgo.com/html/?" +
        "q=" +
        encodeURIComponent(query) +
        "&s=" +
        offset;

    const response = await fetch(
        url,
        {
            redirect: "follow",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                "Accept-Language":
                    "de-DE,de;q=0.9,en;q=0.8"
            }
        }
    );

    if (
        response.status === 403 ||
        response.status === 429
    ) {
        return {
            blocked: true,
            results: []
        };
    }

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    const html =
        await response.text();

    if (isBlockedPage(html)) {
        return {
            blocked: true,
            results: []
        };
    }

    return {
        blocked: false,
        results: parseResults(html)
    };
}

async function searchQuery(
    query,
    maxResults
) {
    const results = [];
    const seen = new Set();

    for (
        let page = 0;
        page < MAX_PAGES_PER_SEARCH;
        page++
    ) {
        if (
            results.length >=
            maxResults
        ) {
            break;
        }

        let response;

        try {
            response =
                await requestDuckDuckGo(
                    query,
                    page
                );
        } catch (error) {
            console.error(
                "Suchfehler:",
                error.message
            );

            await sleep(
                BLOCK_WAIT
            );

            continue;
        }

        if (response.blocked) {
            console.log(
                "DuckDuckGo blockiert momentan. Warte..."
            );

            await sleep(
                BLOCK_WAIT
            );

            page--;
            continue;
        }

        for (
            const result of response.results
        ) {
            if (
                seen.has(result.url)
            ) {
                continue;
            }

            seen.add(result.url);
            results.push(result);

            if (
                results.length >=
                maxResults
            ) {
                break;
            }
        }

        if (
            response.results.length === 0
        ) {
            await sleep(
                DELAY_BETWEEN_REQUESTS
            );
            continue;
        }

        await sleep(
            DELAY_BETWEEN_REQUESTS
        );
    }

    return results.slice(
        0,
        maxResults
    );
}

// ======================================================
// BEDEUTUNG SUCHEN
// ======================================================

async function searchMeaning(word) {
    const queries = [
        `"${word}" Bedeutung`,
        `"${word}" Definition`,
        `"${word}" Erklärung`
    ];

    const meaningResults = [];
    const seen = new Set();

    for (const query of queries) {
        console.log(
            `Bedeutungssuche: ${query}`
        );

        const results =
            await searchQuery(
                query,
                10
            );

        for (const result of results) {
            if (
                seen.has(result.url)
            ) {
                continue;
            }

            seen.add(result.url);

            meaningResults.push(
                result
            );

            if (
                meaningResults.length >= 10
            ) {
                break;
            }
        }

        if (
            meaningResults.length >= 10
        ) {
            break;
        }
    }

    return meaningResults;
}

// ======================================================
// KOMPLETTE SUCHE
// ======================================================

async function searchWord(word) {
    console.log(
        `Normale Suche: ${word}`
    );

    const results =
        await searchQuery(
            word,
            MAX_RESULTS_PER_WORD
        );

    console.log(
        `${results.length} normale Ergebnisse`
    );

    await sleep(
        DELAY_BETWEEN_REQUESTS
    );

    console.log(
        `Bedeutung: ${word}`
    );

    const meaning =
        await searchMeaning(
            word
        );

    console.log(
        `${meaning.length} Bedeutungs-Ergebnisse`
    );

    return {
        word,
        results,
        meaning
    };
}

// ======================================================
// API
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
                    "Kein Begriff angegeben."
            });
        }

        try {
            const data =
                await searchWord(
                    word
                );

            res.json({
                word: data.word,

                results:
                    data.results,

                meaning:
                    data.meaning,

                count:
                    data.results.length,

                meaningCount:
                    data.meaning.length,

                maxResults:
                    MAX_RESULTS_PER_WORD
            });

        } catch (error) {
            console.error(
                error
            );

            res.status(500).json({
                error:
                    "Suche fehlgeschlagen.",
                details:
                    error.message
            });
        }
    }
);

// ======================================================
// SEITEN
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
            maxResults:
                MAX_RESULTS_PER_WORD,
            meaningSearch: true
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
            "======================================"
        );

        console.log(
            "Ghost AI Training Server"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            "100 Ergebnisse pro Begriff"
        );

        console.log(
            "Bedeutungssuche aktiviert"
        );

        console.log(
            "======================================"
        );
    }
);
