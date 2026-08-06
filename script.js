// Globaler Wissens- und Kontextspeicher
let savedKnowledge = [];

document.addEventListener('DOMContentLoaded', () => {
    const qInput = document.getElementById('questionInput');
    qInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') askQuestion();
    });
    qInput?.addEventListener('input', handleAutocomplete);
    initAutocompleteStyles();
});

// Der fehlerfreie Datei-Einleser (KORRIGIERT)
window.handleFileSelect = function(input) {
    if (!input.files || input.files.length === 0) return;
    
    // Greift exakt auf das erste Datei-Objekt zu
    const file = input.files[0]; 

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let parsedData = JSON.parse(e.target.result);
            
            // Flexiblere Datenstruktur-Validierung
            savedKnowledge = parsedData.map(doc => {
                if (typeof doc === 'string') return { text: doc, tags: [] };
                return { text: doc.text || '', tags: doc.tags || [] };
            }).filter(doc => doc.text.length > 10);

            // UI-Aktualisierung
            const uploadPrompt = document.getElementById('uploadPrompt');
            if (uploadPrompt) {
                uploadPrompt.innerHTML = `📚 <strong>KI-Brain aktiv:</strong> ${file.name} (${savedKnowledge.length} Wissenskomplexe geladen)`;
            }
            
            const qInput = document.getElementById('questionInput');
            if (qInput) {
                qInput.disabled = false;
                qInput.placeholder = "Stelle mir eine logische Frage...";
            }
            
            const askBtn = document.getElementById('askBtn');
            if (askBtn) askBtn.disabled = false;
            
            appendMsg('gemini', "Mein logisches KI-Zentrum ist bereit. Ich analysiere Zusammenhänge und antworte in meinen eigenen Worten!");
        } catch (err) {
            alert("Fehler beim Einlesen der Datei. Bitte überprüfe das JSON-Format.");
            console.error("JSON-Parsing- oder Strukturfehler:", err);
        }
    };
    reader.readAsText(file);
};

// Pipeline für die Benutzerinteraktion
window.askQuestion = function() {
    const input = document.getElementById('questionInput');
    if (!input) return;

    const questionText = input.value.trim();
    closeAutocomplete();
    if (!questionText || savedKnowledge.length === 0) return;

    appendMsg('user', questionText);
    input.value = '';

    // RUFT DIE LOGIK AUS DER 1.JS AUF:
    // Such- und Syntheseprozess triggern
    const matchResult = findBestChainMatch(savedKnowledge, questionText);
    const aiResponse = generateSmartResponse(matchResult);

    const structuredAnswer = `
        <p style="margin:0 0 6px 0; font-size:12px; font-weight:600; color:var(--accent-blue); text-transform:uppercase; letter-spacing:0.5px;">🧠 Generative Synthese:</p>
        <span style="font-size:15px; line-height:1.6; color:#e0e0e0;">${aiResponse}</span>
    `;

    appendMsg('gemini', structuredAnswer);
};

// Smart Autocomplete (Phrasen statt Wörter)
function handleAutocomplete() {
    const input = document.getElementById('questionInput');
    if (!input) return;

    const val = input.value.trim().toLowerCase();
    closeAutocomplete();
    
    if (!val || val.length < 2 || savedKnowledge.length === 0) return;

    const listDiv = document.createElement("div");
    listDiv.setAttribute("id", "questionInput-autocomplete");
    listDiv.setAttribute("class", "autocomplete-items");
    input.parentNode.appendChild(listDiv);

    let suggestions = [];
    
    for (let doc of savedKnowledge) {
        if (!doc.text) continue;
        let sentences = doc.text.split(/(?<!\bz\.\s*B)(?<!\bdr)(?<!\bprof)\.\s+/i);
        
        for (let sentence of sentences) {
            if (sentence.toLowerCase().includes(val)) {
                let cleanPhrase = sentence.trim();
                if (cleanPhrase.length > 60) cleanPhrase = cleanPhrase.substring(0, 60) + "...";
                if (!suggestions.includes(cleanPhrase)) {
                    suggestions.push(cleanPhrase);
                }
            }
            if (suggestions.length >= 4) break;
        }
        if (suggestions.length >= 4) break;
    }

    suggestions.forEach(suggestion => {
        const item = document.createElement("div");
        item.innerHTML = `🔍 <span>${suggestion}</span>`;
        item.addEventListener("click", () => {
            input.value = suggestion.replace("...", "");
            closeAutocomplete();
            askQuestion();
        });
        listDiv.appendChild(item);
    });
}

function closeAutocomplete() {
    document.getElementById("questionInput-autocomplete")?.remove();
}

function initAutocompleteStyles() {
    if (document.getElementById('autocomplete-style')) return;
    const style = document.createElement('style');
    style.id = 'autocomplete-style';
    style.innerHTML = `
        .autocomplete-items {
            position: absolute;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            z-index: 99;
            top: 100%;
            left: 0;
            right: 0;
            background: #1e1e24;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            margin-top: 5px;
            overflow: hidden;
        }
        .autocomplete-items div {
            padding: 12px;
            cursor: pointer;
            color: #cdcdcd;
            font-size: 13.5px;
            transition: background 0.2s;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .autocomplete-items div:hover {
            background-color: rgba(255,255,255,0.08);
            color: #fff;
        }
    `;
    document.head.appendChild(style);
}
