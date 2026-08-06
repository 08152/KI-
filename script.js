let savedKnowledge = [];

document.addEventListener('DOMContentLoaded', () => {
    const qInput = document.getElementById('questionInput');
    qInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') askQuestion();
    });
    qInput?.addEventListener('input', handleAutocomplete);
    initAutocompleteStyles();
});

// Der fehlerfreie Datei-Einleser
window.handleFileSelect = function(input) {
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0]; 

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            savedKnowledge = JSON.parse(e.target.result);
            
            document.getElementById('uploadPrompt').innerHTML = `📚 <strong>Generator aktiv:</strong> ${file.name} (${savedKnowledge.length} Seiten gelernt)`;
            
            const qInput = document.getElementById('questionInput');
            qInput.disabled = false;
            qInput.placeholder = "Stelle eine Frage, um eine neue Antwort zu generieren...";
            document.getElementById('askBtn').disabled = false;
            
            appendMsg('gemini', "Ich habe das Wissen analysiert. Ich werde nun Antworten in meinen eigenen Worten für dich formulieren!");
        } catch (err) {
            alert("Fehler beim Einlesen der Datei.");
            console.error(err);
        }
    };
    reader.readAsText(file);
};

// DER GENERATIVE KI-ALGORITHMUS (Eigene Worte & Logik-Synthesizer)
function generateNewSentence(contextBlock, keywords) {
    if (!contextBlock) return "";

    // Sätze bereinigen und zerlegen
    let sentences = contextBlock.split(/(?<!\bz\.\s*B)(?<!\bdr)(?<!\bprof)\.\s+/i)
                                .map(s => s.trim())
                                .filter(s => s.length > 10);

    if (sentences.length === 0) return "Hierzu liegen mir keine formulierbaren Daten vor.";

    // Wikipedia-Kopier-Muster entfernen
    const patternsToRemove = [
        /^[A-ZÄÖÜ][a-zäöüß]+\s+\(\*.*?\)\s+ist/g, // Entfernt Geburtsdaten-Klammern "Name (* 1990) ist..."
        /ist ein[e]? von/gi,
        /wird als.*?bezeichnet/gi
    ];

    let cleanSentences = sentences.map(s => {
        let temp = s;
        patternsToRemove.forEach(p => temp = temp.replace(p, ""));
        return temp.trim();
    });

    // Startformulierungen für eigene Worte
    const openers = [
        "Basierend auf den Daten lässt sich sagen, dass ",
        "Es ist bekannt, dass ",
        "Die Dokumente zeigen: ",
        "Dazu lässt sich erklären, dass ",
        "Interessant ist, dass "
    ];
    
    let chosenOpener = openers[Math.floor(Math.random() * openers.length)];
    
    // Kern-Informationen (Subjekt und Prädikat) dynamisch extrahieren
    let primarySentence = cleanSentences[0];
    
    // Satz umstellen: Falls der Satz mit "Dabei" oder "Zudem" beginnt, glätten
    primarySentence = primarySentence.replace(/^(dabei|zudem|außerdem|hierbei|jedoch)\s+/i, "");
    
    // Ersten Buchstaben klein schreiben, wenn ein Opener davor steht
    if (chosenOpener.endsWith("dass ")) {
        primarySentence = primarySentence.charAt(0).toLowerCase() + primarySentence.slice(1);
    }

    // Punkt am Ende garantieren
    if (!primarySentence.endsWith('.')) primarySentence += '.';

    // Verknüpfung mit einem zweiten logischen Aspekt, falls vorhanden (für tiefere Logik)
    if (cleanSentences.length > 1) {
        let secondarySentence = cleanSentences[1];
        secondarySentence = secondarySentence.replace(/^(er|sie|es|das|der|die)\s+/i, "dies ");
        secondarySentence = secondarySentence.charAt(0).toLowerCase() + secondarySentence.slice(1);
        
        const connectors = [" – hierbei wird deutlich, dass ", " und ergänzend zeigt sich, dass ", ". Zudem ist wichtig, dass "];
        let connector = connectors[Math.floor(Math.random() * connectors.length)];
        
        return chosenOpener + primarySentence.slice(0, -1) + connector + secondarySentence;
    }

    return chosenOpener + primarySentence;
}

window.askQuestion = function() {
    const input = document.getElementById('questionInput');
    const questionText = input.value.trim();
    closeAutocomplete();
    if (!questionText || savedKnowledge.length === 0) return;

    appendMsg('user', questionText);
    input.value = '';

    const lowerQuestion = questionText.toLowerCase();
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den', 'zu', 'für', 'mit', 'nach'];
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

    let bestMatch = null;
    let highestChainScore = 0;
    let bestSentenceIndex = -1;
    let textSentences = [];

    // Finde das exakteste Wissens-Segment
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
                let chainScore = matches.length * 20; // Höhere Gewichtung für Übereinstimmungen

                for (let i = 0; i < matches.length - 1; i++) {
                    const currentWordIndex = keywords.indexOf(matches[i].word);
                    const nextWordIndex = keywords.indexOf(matches[i+1].word);
                    
                    if (nextWordIndex > currentWordIndex) {
                        chainScore += 40; // Bonus für richtige Reihenfolge im Satz
                        const distance = matches[i+1].pos - (matches[i].pos + matches[i].word.length);
                        if (distance < 40) chainScore += 50; // Massiver Bonus für dichte Wortketten
                    }
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
        // Relevantes Inhalts-Fenster isolieren
        let contextBlock = textSentences.slice(Math.max(0, bestSentenceIndex), bestSentenceIndex + 3).join(" ");
        
        // EIGENE NEUFORMULIERUNG STARTEN
        let newGeneratedResponse = generateNewSentence(contextBlock, keywords);

        structuredAnswer = `<p style="margin:0 0 8px 0; font-weight:500; color:var(--accent-blue);">Meine eigene Formulierung dazu:</p>
                            <span style="font-size:14.5px; line-height:1.6; font-style: italic;">„${newGeneratedResponse}“</span>`;
    } else {
        structuredAnswer = "Entschuldigung, zu diesem Thema konnte ich keine logischen Verknüpfungen in meinen gelernten Daten finden.";
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
    if (document.getElementById('autocomplete-style')) return;
    const style = document.createElement('style');
    style.id = 'autocomplete-style';
    style.innerHTML = `
        .autocomplete-items {
            position: absolute;
            border: 1px solid #d4d4d4;
            border-bottom: none;
            border-top: none;
            z-index: 99;
            top: 100%;
            left: 0;
            right: 0;
            background: #fff;
            color: #000;
        }
        .autocomplete-items div {
            padding: 10px;
            cursor: pointer;
            border-bottom: 1px solid #d4d4d4;
        }
        .autocomplete-items div:hover {
            background-color: #e9e9e9;
        }
    `;
    document.head.appendChild(style);
}
