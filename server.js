const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

app.use(express.json({limit:"2mb"}));

app.use(
    express.static(
        path.join(__dirname,"public")
    )
);

/*
 * DuckDuckGo-Suche
 */
async function searchDuckDuckGo(word){

    const url =
        "https://html.duckduckgo.com/html/?q="+
        encodeURIComponent(word);

    const response = await fetch(
        url,
        {
            headers:{
                "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
            }
        }
    );

    if(!response.ok){
        throw new Error(
            "DuckDuckGo HTTP "+response.status
        );
    }

    const html=await response.text();

    return parseResults(html);
}


/*
 * Suchergebnisse aus DuckDuckGo HTML
 */
function parseResults(html){

    const results=[];

    const regex=
        /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while(
        (match=regex.exec(html)) &&
        results.length<10
    ){

        let url=match[1];

        let title=stripHTML(match[2]);

        try{
            url=decodeURIComponent(url);
        }catch{}

        if(url.includes("uddg=")){

            const found=
                url.match(/[?&]uddg=([^&]+)/);

            if(found){

                try{
                    url=decodeURIComponent(found[1]);
                }catch{}
            }
        }

        if(!url.startsWith("http")){
            continue;
        }

        results.push({
            title:title,
            url:url
        });
    }

    return results;
}

function stripHTML(text){

    return String(text)
        .replace(/<[^>]*>/g," ")
        .replace(/&amp;/g,"&")
        .replace(/&quot;/g,'"')
        .replace(/&#x27;/g,"'")
        .replace(/&lt;/g,"<")
        .replace(/&gt;/g,">")
        .replace(/\s+/g," ")
        .trim();
}


/*
 * Training API
 *
 * Nur training.html benutzt diese Route.
 */
app.post(
    "/api/training/search",
    async(req,res)=>{

        try{

            const word=String(
                req.body?.word || ""
            ).trim();

            if(!word){

                return res.status(400).json({
                    error:"Kein Wort angegeben."
                });
            }

            const results=
                await searchDuckDuckGo(word);

            res.json({
                word:word,
                results:results
            });

        }catch(error){

            console.error(error);

            res.status(500).json({
                error:"DuckDuckGo-Suche fehlgeschlagen."
            });
        }
    }
);


/*
 * Training-Seite
 */
app.get(
    "/training",
    (req,res)=>{

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "training.html"
            )
        );
    }
);


/*
 * Hauptseite
 */
app.get(
    "/",
    (req,res)=>{

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);


app.listen(
    PORT,
    "0.0.0.0",
    ()=>{
        console.log(
            "Ghost AI läuft auf Port "+PORT
        );
    }
);
