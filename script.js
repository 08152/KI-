import { findBestChainMatch } from './1.js';

let savedKnowledge = [];

document.addEventListener('DOMContentLoaded', () => {
    const qInput = document.getElementById('questionInput');
    qInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') window.askQuestion();
    });
    qInput?.addEventListener('input', handleAutocomplete);
    
    initAutocompleteStyles();
    setupDragAndDrop();
});

function setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(name => {
        dropZone.addEventListener(name, (e) => { e.preventDefault(); dropZone.style.background = "#f1f7fe"; });
    });
    ['dragleave', 'drop'].forEach(name => {
        dropZone.addEventListener(name, (e) => { e.preventDefault(); dropZone.style.background = "#ffffff"; });
    });
    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length) {
            document.getElementById('uploadInput').files = files;
            processJsonData(files[0]);
        }
    });
}

window.uploadKnowledge = function(input) {
    if (input.files && input.files[0]) {
        processJsonData(input.files[0]);
    }
};

function processJsonData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            savedKnowledge = JSON.parse(e.target.result);
            document.getElementById('uploadPrompt').innerHTML = `📚 Datenbank erfolgreich aktiv: <strong>${file.name}</strong> (${savedKnowledge.length} Seiten geladen)`;
            
            // Chat aktivieren
            const qInput = document.getElementById('questionInput');
            qInput.disabled = false;
            qInput.placeholder = "Stelle eine Frage an dein hochgeladenes Wissen...";
            document.getElementById('askBtn').disabled = false;
            
            appendMsg('gemini', "Wissen erfolgreich gelernt! Du kannst mir jetzt freie Fragen stellen.");
        } catch (err) {
            alert("Fehler beim Lesen der Datei. Bitte lade eine gültige 1.json hoch.");
        }
    };
    reader.readAsText(file);
}

window.askQuestion = function() {
    const input = document.getElementById('questionInput');
    const questionText = input.value.trim();
    closeAutocomplete();
    if (!questionText || savedKnowledge.length === 0) return;

    appendMsg('user', questionText);
    input.value = '';

    // Logik aus der 1.js Datei triggern
    const { bestMatch, highestChainScore, bestSentenceIndex, textSentences } = findBestChainMatch(savedKnowledge, questionText);

    let structuredAnswer = "";
    if (highestChainScore > 0 && bestMatch && bestSentenceIndex !== -1) {
        let fullContext = textSentences[bestSentenceIndex].trim() + ".";
        if (bestSentenceIndex + 1 < textSentences.length) {
            fullContext += " " + textSentences[bestSentenceIndex + 1].trim() + ".";
        }

        // Reine Gemini-Antwortstruktur ohne Meta-Gequatsche
        structuredAnswer = `<p style="margin:0 0 6px 0; font-weight:500; color:var(--accent-blue);">Das habe ich gefunden:</p>
                            <span>„${fullContext}“</span>`;
    } else {
        structuredAnswer = "Dazu konnte ich leider keine logischen Zusammenhänge in den hochgeladenen Dokumenten finden.";
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
        .autocomplete-items { position: absolute; border: 1px solid #dadce0; z-index: 99; bottom: 100%; left: 20px; right: 120px; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
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
