const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Wichtig für FFmpeg.wasm: Diese Header erlauben die Nutzung von SharedArrayBuffer im Browser
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// KORREKTUR: __path entfernt, nur noch __dirname genutzt
app.use(express.static(__dirname));

// Falls die Hauptseite aufgerufen wird, sende die index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
