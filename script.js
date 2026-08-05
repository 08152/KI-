let urlStack = [];
let savedKnowledge = [];
let isProcessing = false;
let aiEngine = null;
let aiReady = false;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('questionInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') askQuestion();
    });
});

function addUrlsToStack() {
    const lines = document.getElementById('urlInput').value.split('\n');
    lines.forEach(line => {
        const url = line.trim();
        if (url && url.startsWith('http')) {
            if (!urlStack.some(item => item.url === url)) {
                urlStack.push({ url: url, status: 'waiting' });
            }
        }
    });
    document.getElementById('urlInput').value = '';
    renderUI();
}

// ARBEITET DIE WARTESCHLANGE DIREKT IM BROWSER AB
async function processStack() {
    if (isProcessing) return;
    isProcessing = true;
    document.getElementById('startBtn').disabled = true;

    for (let i = 0; i < urlStack.length; i++) {
        if (urlStack[i].status === 'waiting' || urlStack[i].status === 'failed') {
            urlStack[i].status = 'processing';
            renderUI();

            try {
                // Nutzung eines kostenlosen Proxy-Dienstes, um CORS-Sperren im Browser zu umgehen
                const proxyUrl = `https://allorigins.win{encodeURIComponent(urlStack[i].length ? urlStack[i] : urlStack[i].url)}`;
                const response = await fetch(proxyUrl);
                
                if (!response.ok) throw new Error();
                const data = await response.json();
                
                // HTML-Code via DOMParser bereinigen (Ersatz für Cheerio im reinen Frontend)
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                
                // Unwichtige Elemente löschen
                const scripts = doc.querySelectorAll('script, style, nav, footer, iframe, header, noscript');
                scripts.forEach(s => s.remove());
                
                const cleanText = doc.body.textContent.replace(/\s+/g, ' ').trim();

                if (cleanText.length > 10) {
                    urlStack[i].status = 'done';
                    savedKnowledge.push({
                        url: urlStack[i].url,
                        text: cleanText
                    });
                    if(!aiReady) initLocalAI();
                } else {
                    urlStack[i].status = 'failed';
                }
            } catch (e) {
                urlStack[i].status = 'failed';
            }
            renderUI();
        }
    }

    urlStack = urlStack.filter(item => item.status !== 'done');
    isProcessing = false;
    document.getElementById('startBtn').disabled = false;
    renderUI();
}

async function initLocalAI() {
    if(aiReady) return;
    const chat = document.getElementById('chatContainer');
    chat.innerHTML += `<div class="chat-message gemini-message">🤖 Initialisiere lokale WebGPU KI... Bitte warten.</div>`;
    
    try {
        const modelId = "Llama-3-8B-Instruct-q4f16_1-MLC";
        aiEngine = await window.webllm.createEngine(modelId, {
            initProgressCallback: (report) => {
                document.getElementById('questionInput').placeholder = `KI lädt: ${Math.round(report.progress * 100)}%`;
            }
        });
        document.getElementById('questionInput').disabled = false;
        document.getElementById('questionInput').placeholder = "Frage an dein Wissen stellen...";
        document.getElementById('askBtn').disabled = false;
        aiReady = true;
        chat.innerHTML += `<div class="chat-message gemini-message">✅ KI startklar! Stelle eine Frage.</div>`;
    } catch(e) {
        chat.innerHTML += `<div class="chat-message gemini-message" style="color:red">❌ WebGPU-Fehler. Bitte Chrome oder Edge nutzen!</div>`;
    }
}

async function askQuestion() {
    const input = document.getElementById('questionInput');
    const question = input.value.trim();
    if(!question || !aiReady) return;

    appendMsg('user', question);
    input.value = '';
    const loadId = appendMsg('gemini', 'KI generiert Antwort...');

    let context = savedKnowledge.map(d => `Quelle: ${d.url}\nText: ${d.text.substring(0,800)}`).join('\n\n');
    const messages = [
        { role: "system", content: "Beantworte die Frage ausschließlich basierend auf dem Kontext auf Deutsch." },
        { role: "user", content: `Kontext:\n${context}\n\nFrage: ${question}` }
    ];

    try {
        const reply = await aiEngine.chat.completions.create({ messages });
        document.getElementById(loadId).textContent = reply.choices.message.content;
    } catch(e) {
        document.getElementById(loadId).textContent = "Fehler bei der Generierung.";
    }
}

function appendMsg(sender, text) {
    const id = 'm-' + Date.now();
    document.getElementById('chatContainer').innerHTML += `<div id="${id}" class="chat-message ${sender}-message">${text}</div>`;
    return id;
}

function countTokens(text) {
    return text ? (text.match(/[a-zA-ZäöüÄÖÜß]+|\d+|[^\s\w]/g) || []).length : 0;
}

function renderUI() {
    const sList = document.getElementById('urlStackList');
    sList.innerHTML = '';
    urlStack.forEach(item => {
        sList.innerHTML += `<li><span>${item.url.substring(0,40)}...</span><span class="badge ${item.status}">${item.status}</span></li>`;
    });

    const kList = document.getElementById('knowledgeList');
    kList.innerHTML = '';
    let total = 0;
    savedKnowledge.forEach((item, index) => {
        const tkn = countTokens(item.text);
        total += tkn;
        kList.innerHTML += `<li onclick="document.getElementById('detText').value = savedKnowledge[${index}].text" style="cursor:pointer">
            <span>🌐 ${item.url.substring(0,30)}...</span><strong>${tkn} tkn</strong>
        </li>`;
    });

    document.getElementById('totalDocs').textContent = savedKnowledge.length;
    document.getElementById('totalTokens').textContent = total;
}

function downloadKnowledge() {
    if(!savedKnowledge.length) return alert("Keine Daten!");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedKnowledge, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "1.json";
    a.click();
}

function uploadKnowledge(input) {
    const file = input.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        savedKnowledge = JSON.parse(e.target.result);
        renderUI();
        initLocalAI();
    };
    reader.readAsText(file);
}
