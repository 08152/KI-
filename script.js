const PASSWORD_HASH = "ca66436f568600f601f7871b693240212fbe93da6c879d7494ee09b441cb5f69"; // Standard: "Geheim123"

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkPassword() {
    const passwordInput = document.getElementById('passwordField').value;
    if ((await sha256(passwordInput)) === PASSWORD_HASH) {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('appContent').classList.remove('hidden');
    } else {
        document.getElementById('loginError').classList.remove('hidden');
    }
}

document.getElementById('passwordField')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPassword();
});

let urlStack = [];
let savedKnowledge = [];
let isProcessing = false;

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

async function processStack() {
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
                
                // Radikale Säuberung von Müll-Elementen
                doc.querySelectorAll('script, style, nav, footer, iframe, header, noscript, ads, .mw-jump-link, .navbox').forEach(s => s.remove());
                
                let cleanText = doc.body.textContent.replace(/\s+/g, ' ').trim();

                // INTELLIGENTER FILTER: Entfernt typische Wikipedia- und Web-Menüreste
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
}

// DER LINGUISTISCHE CONTEXT-SYNTHESIZER (Erweitert)
function askQuestion() {
    const input = document.getElementById('questionInput');
    const questionText = input.value.trim();
    if (!questionText || savedKnowledge.length === 0) return;

    appendMsg('user', questionText);
    input.value = '';

    const lowerQuestion = questionText.toLowerCase();
    
    // Linguistische Stoppwörter eliminieren
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den'];
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

    let bestMatch = null;
    let highestScore = 0;
    let bestSentenceIndex = -1;
    let textSentences = [];

    // 1. Dokumente scannen
    savedKnowledge.forEach(doc => {
        if (!doc.text) return;
        
        // Smarter Satz-Splitter (verhindert Fehler bei Abkürzungen wie z.B.)
        const sentences = doc.text.split(/(?<!\bz\.\s*B)(?<!\bdr)(?<!\bprof)\.\s+/i);
        
        sentences.forEach((sentence, index) => {
            let score = 0;
            const lowerSentence = sentence.toLowerCase();
            
            keywords.forEach(word => {
                if (lowerSentence.includes(word)) {
                    score += 10; // Worttreffer
                    // Bonus für exakte Wortgrenzen
                    if (new RegExp(`\\b${word}\\b`).test(lowerSentence)) score += 5;
                }
            });

            // Relevanz-Bonus, wenn Wörter nah beieinander stehen
            if (score > 10) {
                const positions = keywords.map(w => lowerSentence.indexOf(w)).filter(p => p !== -1);
                if (positions.length > 1) {
                    const distance = Math.max(...positions) - Math.min(...positions);
                    if (distance < 60) score += 8; // Dichte-Bonus
                }
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = doc;
                bestSentenceIndex = index;
                textSentences = sentences;
            }
        });
    });

    // 2. Antwort logisch formulieren und mit dem Folgesatz verknüpfen
    let structuredAnswer = "";

    if (highestScore > 0 && bestMatch && bestSentenceIndex !== -1) {
        const topic = keywords.length > 0 ? keywords.join(' & ').toUpperCase() : "Thema";
        const cleanUrl = bestMatch.url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40) + "...";

        // Hauptsatz + Folgesatz für perfekten logischen Kontext extrahieren
        let fullContext = textSentences[bestSentenceIndex].trim() + ".";
        if (bestSentenceIndex + 1 < textSentences.length) {
            fullContext += " " + textSentences[bestSentenceIndex + 1].trim() + ".";
        }

        // Intelligente Satzbausteine je nach Frageabsicht anwenden
        if (lowerQuestion.startsWith("warum") || lowerQuestion.includes("grund") || lowerQuestion.includes("weshalb")) {
            structuredAnswer = `Bezüglich der Ursache oder Begründung zu <strong>${topic}</strong> liefert die Auswertung von <em>${cleanUrl}</em> folgenden logischen Zusammenhang:<br><br>👉 „${fullContext}“`;
        } 
        else if (lowerQuestion.startsWith("wer") || lowerQuestion.includes("person") || lowerQuestion.includes("erfinder")) {
            structuredAnswer = `Die verantwortlichen Akteure, Personen oder Entitäten im Kontext von <strong>${topic}</strong> werden in den Daten wie folgt identifiziert:<br><br>👉 „${fullContext}“`;
        } 
        else if (lowerQuestion.startsWith("wie") || lowerQuestion.includes("prozess") || lowerQuestion.includes("ablauf")) {
            structuredAnswer = `Hinsichtlich der Methodik, des Ablaufs oder der Funktionsweise von <strong>${topic}</strong> dokumentiert das System diesen Prozess:<br><br>👉 „${fullContext}“`;
        } 
        else if (lowerQuestion.startsWith("wo ") || lowerQuestion.includes("ort") || lowerQuestion.includes("land")) {
            structuredAnswer = `Die geografische Verortung oder Platzierung bezüglich des Suchbegriffs <strong>${topic}</strong> lässt sich wie folgt rekonstruieren:<br><br>👉 „${fullContext}“`;
        }
        else {
            // Universelle, logische Zusammenfassung (für "Was ist...", "Definiere...")
            structuredAnswer = `Bei der strukturellen Textanalyse zum Thema <strong>${topic}</strong> konnte auf der Webseite <em>${cleanUrl}</em> diese logische Kerndefinition ermittelt werden:<br><br>👉 „${fullContext}“`;
        }
    } else {
        structuredAnswer = "❌ <strong>Logische Analyse fehlgeschlagen:</strong> Keine ausreichenden Text-Zusammenhänge oder Übereinstimmungen für diese Suchbegriffe in der Datenbank gefunden.";
    }

    appendMsg('gemini', structuredAnswer);
}

function appendMsg(sender, text) {
    const chatContainer = document.getElementById('chatContainer');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}-message`;
    msgDiv.innerHTML = text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
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
            <span>🌐 ${item.url.replace(/^https?:\/\/(www\.)?/, '').substring(0,30)}...</span><strong>${tkn} tkn</strong>
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
};
reader.readAsText(file);
}

