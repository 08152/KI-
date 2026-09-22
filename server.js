const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {spawn} = require("child_process");

const app = express();

const PORT = process.env.PORT || 10000;

const MAX_UPLOAD = 20 * 1024 * 1024;
const MAX_FILES = 500;
const MAX_TOTAL = 50 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits:{
        fileSize:MAX_UPLOAD,
        files:1
    }
});

const allowed = new Set([
    ".html",
    ".htm",
    ".css",
    ".js",
    ".mjs",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".webm"
]);

const blocked = new Set([
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".com",
    ".scr",
    ".msi",
    ".ps1",
    ".vbs",
    ".vbe",
    ".jscript",
    ".jse",
    ".wsf",
    ".wsh",
    ".jar",
    ".apk",
    ".sh",
    ".bash",
    ".so",
    ".dylib",
    ".sys",
    ".ocx"
]);

function cleanName(name){

    return path
        .basename(name)
        .replace(/[^a-zA-Z0-9._-]/g,"_")
        .slice(0,80) || "WebApp";
}

function safePath(name){

    name=name.replace(/\\/g,"/");

    if(
        name.startsWith("/") ||
        /^[A-Za-z]:/.test(name)
    ){
        return false;
    }

    const parts=name.split("/");

    if(
        parts.some(
            p=>!p || p==="." || p===".."
        )
    ){
        return false;
    }

    return true;
}

function command(cmd,args,options={}){

    return new Promise((resolve,reject)=>{

        const process=spawn(
            cmd,
            args,
            {
                ...options,
                windowsHide:true
            }
        );

        let output="";
        let error="";

        process.stdout?.on(
            "data",
            data=>output+=data
        );

        process.stderr?.on(
            "data",
            data=>error+=data
        );

        process.on(
            "error",
            reject
        );

        process.on(
            "close",
            code=>{

                if(code===0){

                    resolve({
                        output,
                        error
                    });

                }else{

                    reject(
                        new Error(
                            error ||
                            "7-Zip Fehler"
                        )
                    );

                }

            }
        );

    });
}

app.get("/",(req,res)=>{

    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );

});

app.post(
    "/api/build",
    upload.single("zip"),
    async(req,res)=>{

        let work=null;

        try{

            if(!req.file){

                return res.status(400).json({
                    error:"Keine ZIP-Datei."
                });

            }

            if(
                !req.file.originalname
                    .toLowerCase()
                    .endsWith(".zip")
            ){

                return res.status(400).json({
                    error:"Nur ZIP-Dateien sind erlaubt."
                });

            }

            const id=
                crypto
                .randomBytes(12)
                .toString("hex");

            work=path.join(
                os.tmpdir(),
                "safe-web-exe-"+id
            );

            const appDir=
                path.join(work,"app");

            await fs.promises.mkdir(
                appDir,
                {recursive:true}
            );

            const zip=
                new AdmZip(
                    req.file.buffer
                );

            const entries=
                zip.getEntries();

            if(!entries.length){

                throw new Error(
                    "Die ZIP ist leer."
                );

            }

            if(entries.length>MAX_FILES){

                throw new Error(
                    "Zu viele Dateien."
                );

            }

            let total=0;
            let htmlFiles=[];

            for(const entry of entries){

                if(entry.isDirectory)
                    continue;

                const name=
                    entry.entryName
                    .replace(/\\/g,"/");

                if(!safePath(name)){

                    throw new Error(
                        "Unsicherer Dateipfad."
                    );

                }

                const ext=
                    path.extname(name)
                    .toLowerCase();

                if(blocked.has(ext)){

                    throw new Error(
                        "Ausführbare Datei blockiert: "+
                        ext
                    );

                }

                if(!allowed.has(ext)){

                    throw new Error(
                        "Nicht erlaubter Dateityp: "+
                        (ext || "unbekannt")
                    );

                }

                const data=
                    entry.getData();

                total+=data.length;

                if(total>MAX_TOTAL){

                    throw new Error(
                        "Die entpackten Dateien sind zu groß."
                    );

                }

                const output=
                    path.join(
                        appDir,
                        ...name.split("/")
                    );

                const resolved=
                    path.resolve(output);

                const root=
                    path.resolve(appDir)+
                    path.sep;

                if(
                    !resolved.startsWith(root)
                ){

                    throw new Error(
                        "Unsicherer Pfad."
                    );

                }

                await fs.promises.mkdir(
                    path.dirname(output),
                    {recursive:true}
                );

                await fs.promises.writeFile(
                    output,
                    data
                );

                if(
                    ext===".html" ||
                    ext===".htm"
                ){

                    htmlFiles.push(name);

                }

            }

            if(!htmlFiles.length){

                throw new Error(
                    "Die ZIP benötigt mindestens eine HTML-Datei."
                );

            }

            const startPage=
                htmlFiles.find(
                    x=>x.toLowerCase()==="index.html"
                ) ||
                htmlFiles[0];

            const archive=
                path.join(
                    work,
                    "app.7z"
                );

            const config=
                path.join(
                    work,
                    "config.txt"
                );

            const output=
                path.join(
                    work,
                    cleanName(
                        req.file.originalname
                    ).replace(
                        /\.zip$/i,
                        ".exe"
                    )
                );

            const configText=
`;!@Install@!UTF-8!
Title="Web App"
RunProgram="cmd.exe /c start \\"\\" \\"%TEMP%\\\\WebApp_${id}\\\\${startPage.replace(/\//g,"\\\\")}\\""
;!@InstallEnd@!
`;

            await fs.promises.writeFile(
                config,
                configText
            );

            await command(
                "7z",
                [
                    "a",
                    "-t7z",
                    "-mx=5",
                    archive,
                    "."
                ],
                {
                    cwd:appDir
                }
            );

            const sfx=
                process.env.SFX_PATH ||
                "/opt/7zip/7zS.sfx";

            if(
                !fs.existsSync(sfx)
            ){

                throw new Error(
                    "7-Zip SFX ist auf Render nicht installiert."
                );

            }

            const sfxData=
                await fs.promises.readFile(sfx);

            const configData=
                await fs.promises.readFile(config);

            const archiveData=
                await fs.promises.readFile(archive);

            await fs.promises.writeFile(
                output,
                Buffer.concat([
                    sfxData,
                    configData,
                    archiveData
                ])
            );

            const download=
                "/api/download/"+
                path.basename(output);

            global.generatedFiles=
                global.generatedFiles || {};

            global.generatedFiles[
                path.basename(output)
            ]=output;

            res.json({

                message:
                    "Die ZIP wurde geprüft und die EXE erstellt.",

                filename:
                    path.basename(output),

                download

            });

        }catch(error){

            if(work){

                await fs.promises.rm(
                    work,
                    {
                        recursive:true,
                        force:true
                    }
                ).catch(()=>{});

            }

            res.status(400).json({
                error:
                    error.message ||
                    "Erstellung fehlgeschlagen."
            });

        }

    }
);

app.get(
    "/api/download/:file",
    (req,res)=>{

        const files=
            global.generatedFiles || {};

        const file=
            files[req.params.file];

        if(!file){

            return res.status(404).send(
                "Datei nicht gefunden."
            );

        }

        res.download(
            file,
            path.basename(file),
            ()=>{
                fs.promises.rm(
                    path.dirname(file),
                    {
                        recursive:true,
                        force:true
                    }
                ).catch(()=>{});
            }
        );

    }
);

app.listen(
    PORT,
    ()=>{
        console.log(
            "ZIP → EXE läuft auf Port "+
            PORT
        );
    }
);
