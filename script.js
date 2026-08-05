let savedKnowledge = [];

document.addEventListener('DOMContentLoaded', () => {
    const qInput = document.getElementById('questionInput');
    qInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') askQuestion();
    });
    qInput?.addEventListener('input', handleAutocomplete);
    initAutocompleteStyles();
});

// KORRIGIERT: Liest nun die Datei [0] korrekt aus der Liste ein
window.handleFileSelect = function(input) {
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0]; // Holt die erste ausgewählte Datei

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            savedKnowledge = JSON.parse(e.target.result);
            
            // Text im Upload-Feld aktualisieren
            document.getElementById('uploadPrompt').innerHTML = `📚 <strong>Datenbank aktiv:</strong> ${file.name} (${savedKnowledge.length} Seiten geladen)`;
            
            // Chat und Button freischalten
            const qInput = document.getElementById('questionInput');
            qInput.disabled = false;
            qInput.placeholder = "Stelle eine Frage an dein hochgeladenes Wissen...";
            document.getElementById('askBtn').disabled = false;
            
            appendMsg('gemini', "Ich habe dein Wissen gelernt! Stelle mir eine Frage.");
        } catch (err) {
            alert("Fehler beim Einlesen: Die Datei ist kein gültiges JSON. Hast du die richtige 1.json ausgewählt?");
            console.error(err);
        }
    };
    reader.readAsText(file); // Lädt die Datei nun fehlerfrei
};

window.askQuestion = function() {
    const input = document.getElementById('questionInput');
    const questionText = input.value.trim();
    closeAutocomplete();
    if (!questionText || savedKnowledge.length === 0) return;

    appendMsg('user', questionText);
    input.value = '';

    const lowerQuestion = questionText.toLowerCase();
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den', 'zu'];
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

    let bestMatch = null;
    let highestChainScore = 0;
    let bestSentenceIndex = -1;
    let textSentences = [];

    savedKnowledge.forEach(doc => {
        if (!doc.text) return;
        const sentences = doc.text.split(/(?<!\bz\.\s*B)(?<!\bdr)(?<!\bprof)\.\s+/i);
        
        sentences.forEach((sentence, index) => {
            const lowerSentence = sentence.toLowerCase();
            let matches = [];
            
            keywords.forEach(word => {
                const pos = lowerSentence.indexOf(word);
                if (pos !== -1) matches.push({ word: word, pos: pos });
            });

            if (matches.length > 0) {
                matches.sort((a, b) => a.pos - b.pos);
                let chainScore = matches.length * 15;
                let correctOrderCount = 0;

                for (let i = 0; i < matches.length - 1; i++) {
                    const currentWordIndex = keywords.indexOf(matches[i].word);
                    const nextWordIndex = keywords.indexOf(matches[i+1].word);
                    
                    if (nextWordIndex > currentWordIndex) {
                        correctOrderCount++;
                        const distance = matches[i+1].pos - (matches[i].pos + matches[i].word.length);
                        if (distance < 30) chainScore += 35;
                        else if (distance < 100) chainScore += 15;
                    }
                }

                if (correctOrderCount === keywords.length - 1 && keywords.length > 1) {
                    chainScore += 50;
                }

                if (chainScore > highestChainScore) {
                    highestChainScore = chainScore;
                    bestMatch = doc;
                    bestSentenceIndex = index;
                    textSentences = sentences;
                }
            }
        });
    });

    let structuredAnswer = "";
    if (highestChainScore > 0 && bestMatch && bestSentenceIndex !== -1) {
        let fullContext = textSentences[bestSentenceIndex].trim() + ".";
        if (bestSentenceIndex + 1 < textSentences.length) {
            fullContext += " " + textSentences[bestSentenceIndex + 1].trim() + ".";
        }

        structuredAnswer = `<p style="margin:0 0 8px 0; font-weight:500; color:var(--accent-blue);">Das habe ich gefunden:</p>
                            <span style="font-size:14.5px; line-height:1.6;">„${fullContext}“</span>`;
    } else {
        structuredAnswer = "Dazu konnte ich leider keine passenden Zusammenhänge in den hochgeladenen Dokumenten finden.";
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
            askQuestion();
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
