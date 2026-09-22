const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const {spawn} = require("child_process");

const app = express();

const PORT =
process.env.PORT || 10000;

const MAX_UPLOAD =
20 * 1024 * 1024;

const MAX_FILES =
500;

const MAX_TOTAL =
50 * 1024 * 1024;

const upload =
multer({
storage:multer.memoryStorage(),

limits:{
fileSize:MAX_UPLOAD,
files:1
}
});

const ALLOWED = new Set([
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

const BLOCKED = new Set([
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
.slice(0,80)
||"WebApp";

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
part=>
!part ||
part==="." ||
part===".."
)
){
return false;
}

return true;

}

function runCommand(command,args,options={}){

return new Promise((resolve,reject)=>{

const child=
spawn(
command,
args,
{
...options,
windowsHide:true
}
);

let stdout="";
let stderr="";

child.stdout?.on(
"data",
data=>{
stdout+=data.toString();
}
);

child.stderr?.on(
"data",
data=>{
stderr+=data.toString();
}
);

child.on(
"error",
reject
);

child.on(
"close",
code=>{

if(code===0){

resolve({
stdout,
stderr
});

}else{

reject(
new Error(
stderr ||
`Befehl fehlgeschlagen: ${code}`
)
);

}

}
);

});

}

/*
HTML ausliefern
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

/*
EXE erstellen
*/

app.post(
"/api/build",
upload.single("zip"),
async(req,res)=>{

let work=null;

try{

if(!req.file){

return res
.status(400)
.json({
error:"Keine ZIP-Datei hochgeladen."
});

}

if(
!req.file.originalname
.toLowerCase()
.endsWith(".zip")
){

return res
.status(400)
.json({
error:"Die Datei muss eine ZIP-Datei sein."
});

}

const id=
crypto
.randomBytes(12)
.toString("hex");

work=
path.join(
os.tmpdir(),
"web-exe-"+id
);

const appDir=
path.join(
work,
"app"
);

await fs.promises.mkdir(
appDir,
{
recursive:true
}
);

const zip=
new AdmZip(
req.file.buffer
);

const entries=
zip.getEntries();

if(!entries.length){

throw new Error(
"Die ZIP-Datei ist leer."
);

}

if(entries.length>MAX_FILES){

throw new Error(
"Die ZIP enthält zu viele Dateien."
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
"Unsicherer Dateipfad gefunden."
);

}

const extension=
path.extname(name)
.toLowerCase();

if(BLOCKED.has(extension)){

throw new Error(
"Ausführbare Datei blockiert: "+
extension
);

}

if(!ALLOWED.has(extension)){

throw new Error(
"Nicht erlaubter Dateityp: "+
(extension || "unbekannt")
);

}

const data=
entry.getData();

total+=data.length;

if(total>MAX_TOTAL){

throw new Error(
"Die entpackten Dateien dürfen insgesamt höchstens 50 MB groß sein."
);

}

const destination=
path.join(
appDir,
...name.split("/")
);

const root=
path.resolve(appDir)+
path.sep;

const resolved=
path.resolve(destination);

if(!resolved.startsWith(root)){

throw new Error(
"Unsicherer Dateipfad."
);

}

await fs.promises.mkdir(
path.dirname(destination),
{
recursive:true
}
);

await fs.promises.writeFile(
destination,
data
);

if(
extension===".html" ||
extension===".htm"
){

htmlFiles.push(name);

}

}

if(!htmlFiles.length){

throw new Error(
"Die ZIP enthält keine HTML-Datei."
);

}

/*
index.html bevorzugen
*/

const startPage=
htmlFiles.find(
file=>
file.toLowerCase()==="index.html"
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

const filename=
cleanName(
req.file.originalname
.replace(
/\.zip$/i,
""
)
)+".exe";

const exe=
path.join(
work,
filename
);

/*
7-Zip SFX-Konfiguration
*/

const configText=
`;!@Install@!UTF-8!
Title="Web-App"
RunProgram="cmd.exe /c start \\"\\" \\"%TEMP%\\\\WebApp_${id}\\\\${startPage.replace(/\//g,"\\\\")}\\""
;!@InstallEnd@!
`;

await fs.promises.writeFile(
config,
configText,
"utf8"
);

/*
ZIP/7Z erstellen
*/

await runCommand(
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

/*
SFX-Modul suchen
*/

const sfxCandidates=[

process.env.SFX_PATH,

"/opt/7zip/7zS.sfx",

"/usr/lib/p7zip/7zS.sfx",

"/usr/lib/7zip/7zS.sfx"

].filter(Boolean);

let sfx=null;

for(
const candidate
of sfxCandidates
){

if(
fs.existsSync(candidate)
){

sfx=candidate;
break;

}

}

if(!sfx){

throw new Error(
"7-Zip SFX-Modul fehlt. "+
"Setze SFX_PATH auf die Datei 7zS.sfx."
);

}

const sfxData=
await fs.promises.readFile(
sfx
);

const configData=
await fs.promises.readFile(
config
);

const archiveData=
await fs.promises.readFile(
archive
);

/*
EXE zusammenbauen
*/

await fs.promises.writeFile(
exe,
Buffer.concat([
sfxData,
configData,
archiveData
])
);

if(
!fs.existsSync(exe)
){

throw new Error(
"Die EXE konnte nicht erstellt werden."
);

}

/*
Datei für Download merken
*/

global.generatedFiles=
global.generatedFiles || {};

global.generatedFiles[
filename
]=exe;

res.json({

success:true,

message:
"Die ZIP wurde geprüft. "+
"Keine ausführbaren Dateien wurden übernommen.",

filename,

download:
"/api/download/"+
encodeURIComponent(filename)

});

}catch(error){

console.error(error);

if(work){

await fs.promises.rm(
work,
{
recursive:true,
force:true
}
).catch(()=>{});

}

res
.status(500)
.json({

success:false,

error:
error.message ||
"Unbekannter Serverfehler."

});

}

}
);

/*
Download
*/

app.get(
"/api/download/:file",
async(req,res)=>{

try{

const filename=
path.basename(
decodeURIComponent(
req.params.file
)
);

const files=
global.generatedFiles || {};

const file=
files[filename];

if(!file){

return res
.status(404)
.json({
error:"EXE nicht gefunden."
});

}

if(!fs.existsSync(file)){

delete files[filename];

return res
.status(404)
.json({
error:"EXE ist nicht mehr verfügbar."
});

}

res.download(
file,
filename,
err=>{

if(err){

console.error(err);

}

const directory=
path.dirname(file);

fs.promises.rm(
directory,
{
recursive:true,
force:true
}
).catch(()=>{});

delete files[filename];

});

}catch(error){

res
.status(500)
.json({
error:error.message
});

}

}
);

app.use(
(error,req,res,next)=>{

console.error(error);

if(res.headersSent){

return next(error);

}

res
.status(500)
.json({
error:
error.message ||
"Interner Serverfehler."
});

}
);

app.listen(
PORT,
"0.0.0.0",
()=>{

console.log(
`Server läuft auf Port ${PORT}`
);

}
);
