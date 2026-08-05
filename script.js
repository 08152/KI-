import { countTokens, findBestChainMatch } from './1.js';

let urlStack = [];
let savedKnowledge = [];
let isProcessing = false;

document.addEventListener('DOMContentLoaded', () => {
    const qInput = document.getElementById('questionInput');
    qInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') askQuestion();
    });
    qInput?.addEventListener('input', handleAutocomplete);
    
    // Autocomplete-Styles direkt beim Start laden, da kein Login mehr blockiert
    initAutocompleteStyles();
});

window.addUrlsToStack = function() {
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
};

window.processStack = async function() {
    if (isProcessing) return;
    isProcessing = true;
    document.getElementById('startBtn').disabled = true;

    for (let i = 0; i < urlStack.length; i++) {
        if (urlStack[i].status === 'waiting' || urlStack[i].status === 'failed') {
            urlStack[i].status = 'processing';
            renderUI();

            try {
                const proxyUrl = `https://allorigins.win{encodeURIComponent(urlStack[i].url)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error();
                const data = await response.json();
                
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                doc.querySelectorAll('script, style, nav, footer, iframe, header, noscript, ads, .mw-jump-link, .navbox').forEach(s => s.remove());
                
                let cleanText = doc.body.textContent.replace(/\s+/g, ' ').trim();
                cleanText = cleanText.replace(/(Inhaltsverzeichnis|Navigation umschalten|Suche|Hauptmenü öffnen|Zum Inhalt springen|Einzelnachweise|Weblinks|Literatur)\s?/gi, '');

                if (cleanText.length > 20) {
                    urlStack[i].status = 'done';
                    savedKnowledge.push({ url: urlStack[i].url, text: cleanText });
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
};

window.askQuestion = function() {
    const input = document.getElementById('questionInput');
    const questionText = input.value.trim();
    closeAutocomplete();
    if (!questionText || savedKnowledge.length === 0) return;

    appendMsg('user', questionText);
    input.value = '';

    const { bestMatch, highestChainScore, bestSentenceIndex, textSentences } = findBestChainMatch(savedKnowledge, questionText);

    let structuredAnswer = "";
    if (highestChainScore > 0 && bestMatch && bestSentenceIndex !== -1) {
        let fullContext = textSentences[bestSentenceIndex].trim() + ".";
        if (bestSentenceIndex + 1 < textSentences.length) {
            fullContext += " " + textSentences[bestSentenceIndex + 1].trim() + ".";
        }

        structuredAnswer = `<p style="margin:0 0 8px 0; font-weight:500; color:var(--accent-blue);">Das habe ich gefunden:</p>
                            <span style="font-size:14.5px; line-height:1.6;">„${fullContext}“</span>`;
    } else {
        structuredAnswer = "Dazu konnte ich in den eingelesenen Daten keine logische Kette finden.";
    }

    appendMsg('gemini', structuredAnswer);
};

function handleAutocomplete() {
    const input = document.getElementById('questionInput');
    const val = input.value.trim().toLowerCase();
    closeAutocomplete();
    
    if (!val || val.length < 2 || savedKnowledge.length === 0) return;

    const listDiv = document.createElement("div");
    listDiv.setAttribute("id", "autocomplete-list");
    listDiv.setAttribute("class", "autocomplete-items");
    input.parentNode.style.position = "relative";
    input.parentNode.appendChild(listDiv);

    let suggestions = [];
    
    savedKnowledge.forEach(doc => {
        if (!doc.text) return;
        const words = doc.text.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 3);
        
        for (let i = 0; i < words.length - 2; i++) {
            const w1 = words[i].toLowerCase();
            const w2 = words[i+1].toLowerCase();
            
            if (w1.startsWith(val) || (w1 + " " + w2).startsWith(val)) {
                const chain = words[i] + " " + words[i+1] + " " + words[i+2];
                if (!suggestions.includes(chain)) suggestions.push(chain);
            }
            if (suggestions.length >= 5) break;
        }
    });

    suggestions.forEach(suggestion => {
        const item = document.createElement("div");
        item.innerHTML = `<strong>${suggestion.substr(0, val.length)}</strong>${suggestion.substr(val.length)}`;
        item.addEventListener("click", () => {
            input.value = suggestion;
            closeAutocomplete();
            window.askQuestion();
        });
        listDiv.appendChild(item);
    });
}

function closeAutocomplete() {
    document.getElementById("autocomplete-list")?.remove();
}

function initAutocompleteStyles() {
    if (document.getElementById('autocomplete-css')) return;
    const style = document.createElement('style');
    style.id = 'autocomplete-css';
    style.innerHTML = `
        .autocomplete-items { position: absolute; border: 1px solid #dadce0; z-index: 99; bottom: 100%; left: 15px; right: 15px; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .autocomplete-items div { padding: 10px 16px; cursor: pointer; background-color: #fff; font-size: 14px; text-align: left; }
        .autocomplete-items div:hover { background-color: #e8f0fe; color: #1a73e8; }
    `;
    document.head.appendChild(style);
}

document.addEventListener("click", (e) => {
    if (e.target.id !== "questionInput") closeAutocomplete();
});

function appendMsg(sender, text) {
    const chatContainer = document.getElementById('chatContainer');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}-message`;
    msgDiv.innerHTML = text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
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
            <span>🌐 ${item.url.replace(/^https?:\/\/(www\.)?/, '').substring(0,30)}...</span><strong>${tkn} tkn</strong>
        </li>`;
    });

    document.getElementById('totalDocs').textContent = savedKnowledge.length;
    document.getElementById('totalTokens').textContent = total;
}

window.downloadKnowledge = function() {
    if(!savedKnowledge.length) return alert("Keine Daten!");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedKnowledge, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "1.json";
    a.click();
};

window.uploadKnowledge = function(input) {
    const file = input.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        savedKnowledge = JSON.parse(e.target.result);
        renderUI();
    };
    reader.readAsText(file);
};
