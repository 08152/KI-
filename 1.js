// Globaler Kontext-Speicher (Merkt sich den exakten Sinnzusammenhang der Konversation)
let lastContextSentence = "";
let lastAnswerContext = "";

// Berechnet die Token-Anzahl (Wort- und Zeichenfragmente)
export function countTokens(text) {
    return text ? (text.match(/[a-zA-ZäöüÄÖÜß]+|\d+|[^\s\w]/g) || []).length : 0;
}

// Sucht nach der logischsten Satz-Kette unter Einbeziehung des GESAMTEN vorherigen Satzes
export function findBestChainMatch(savedKnowledge, questionText) {
    const lowerQuestion = questionText.toLowerCase();
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den', 'zu', 'für', 'welche', 'welches'];
    
    // Fragewort-Keywords extrahieren
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

    // Kontext-Keywords aus dem GESAMTEN letzten Satz extrahieren (falls vorhanden)
    let contextKeywords = [];
    if (lastContextSentence) {
        contextKeywords = lastContextSentence.toLowerCase()
            .split(/[^a-zA-ZäöüÄÖÜß\d]/)
            .filter(w => w.length > 3 && !stopWords.includes(w));
    }

    let bestMatch = null;
    let highestChainScore = 0;
    let bestSentenceIndex = -1;
    let textSentences = [];

    savedKnowledge.forEach(doc => {
        if (!doc.text) return;
        // Text präzise in Sätze unterteilen
        const sentences = doc.text.split(/(?<!\bz\.\s*B)(?<!\bdr)(?<!\bprof)\.\s+/i);
        
        sentences.forEach((sentence, index) => {
            const lowerSentence = sentence.toLowerCase();
            let matches = [];
            let contextMatches = 0;
            
            // 1. Übereinstimmung mit der aktuellen Frage prüfen
            keywords.forEach(word => {
                const pos = lowerSentence.indexOf(word);
                if (pos !== -1) matches.push({ word: word, pos: pos });
            });

            // 2. Übereinstimmung mit dem gesamten vorherigen Kontext prüfen (Themen-Anker)
            contextKeywords.forEach(word => {
                if (lowerSentence.includes(word)) contextMatches++;
            });

            if (matches.length > 0) {
                matches.sort((a, b) => a.pos - b.pos);
                
                // Basis-Score berechnen
                let chainScore = matches.length * 30; 
                let correctOrderCount = 0;

                // Wort-Reihenfolge bewerten (Satzstruktur-Analyse)
                for (let i = 0; i < matches.length - 1; i++) {
                    const currentWordIndex = keywords.indexOf(matches[i].word);
                    const nextWordIndex = keywords.indexOf(matches[i+1].word);
                    
                    if (nextWordIndex > currentWordIndex) {
                        correctOrderCount++;
                        const distance = matches[i+1].pos - (matches[i].pos + matches[i].word.length);
                        if (distance < 50) chainScore += 65; // Sehr nah beieinander stehende logische Ketten
                    }
                }

                // Massiver Bonus für exakte Phrasen-Treffer
                if (correctOrderCount === keywords.length - 1 && keywords.length > 1) {
                    chainScore += 80;
                }

                // --- GANZEN SATZ ANALYSIEREN & BEWERTEN ---
                // Wenn der Satz inhaltlich stark zum vorherigen Gesamtsatz passt, kriegt er einen riesigen Bonus
                if (contextMatches > 0) {
                    chainScore += (contextMatches / contextKeywords.length) * 120;
                } else if (lastContextSentence && contextMatches === 0) {
                    // Strafe für unlogischen Themenwechsel (z.B. Universum -> Schokolade ohne Zusammenhang)
                    chainScore -= 50;
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

    return { bestMatch, highestChainScore, bestSentenceIndex, textSentences, questionText };
}

// DER GENERATIVE SYNTHESIZER (Baut aus dem gesamten Kontext eine völlig eigene Antwort)
export function generateSmartResponse(matchResult) {
    const { bestSentenceIndex, textSentences, highestChainScore, questionText } = matchResult;
    
    if (highestChainScore <= 0 || !textSentences || bestSentenceIndex === -1) {
        return "Ich habe die Daten analysiert, konnte jedoch keinen logischen Bezug zu dieser Frage im aktuellen Kontext herstellen.";
    }

    // Speichert die aktuelle Frage als Kontext für den nächsten Durchlauf (Gedächtnis)
    lastContextSentence = questionText;

    // Hole den Ziel-Satz und die umgebenden Sätze für maximalen Informationsgehalt
    let rawBlocks = textSentences.slice(Math.max(0, bestSentenceIndex), bestSentenceIndex + 3);
    
    let cleanSentences = [];
    rawBlocks.forEach(s => {
        let temp = s.trim();
        // Bereinigt Wikipedia-Klammern (z.B. Geburtsdaten, Abkürzungen)
        temp = temp.replace(/\s*\([^)]*\)/g, "");
        // Ersetzt steife Enzyklopädie-Phrasen durch dynamische Verben
        temp = temp.replace(/ist die Bezeichnung für|wird als.*?bezeichnet/gi, "beschreibt");
        temp = temp.replace(/ist ein[e]? von/gi, "gehört zu");
        if (temp.length > 12) cleanSentences.push(temp);
    });

    if (cleanSentences.length === 0) return "Die geladenen Informationen bieten im aktuellen Kontext keine ausreichende Basis für eine Antwort.";

    // ChatGPT-ähnliche, reflektierende Satzanfänge in eigenen Worten
    const smartOpeners = [
        "Betrachtet man den gesamten Kontext, wird deutlich, dass ",
        "Daraus lässt sich logisch ableiten, dass ",
        "Diese Verbindung zeigt auf, dass ",
        "Das bedeutet konkret: ",
        "Analysiert man diesen Sachverhalt, beschreibt es vor allem, dass "
    ];

    // Überleitungen, die Sätze flüssig miteinander verschmelzen
    const analyticalConnectors = [
        ". Ergänzend dazu verdeutlicht sich, dass ",
        ", während im selben Zuge klar wird, dass ",
        ". Dies führt folglich dazu, dass ",
        ", was wiederum untermauert, dass "
    ];

    // Ersten Satz verarbeiten und glätten
    let sentenceA = cleanSentences[0];
    // Typische Satz-Anfangsfüller entfernen
    sentenceA = sentenceA.replace(/^(dabei|zudem|außerdem|hierbei|jedoch|es)\s+/i, "");
    // Ersten Buchstaben für den Fluss klein schreiben
    sentenceA = sentenceA.charAt(0).toLowerCase() + sentenceA.slice(1);
    if (sentenceA.endsWith('.')) sentenceA = sentenceA.slice(0, -1);

    let chosenOpener = smartOpeners[Math.floor(Math.random() * smartOpeners.length)];
    let finalAiResponse = `${chosenOpener}${sentenceA}`;

    // Zweites Satzfragment aus dem Wissensblock logisch einweben
    if (cleanSentences.length > 1) {
        let sentenceB = cleanSentences[1];
        // Ersetzt harte Pronomen durch flüssige Übergänge
        sentenceB = sentenceB.replace(/^(er|sie|es|das|der|die)\s+/i, "dieser Umstand ");
        sentenceB = sentenceB.charAt(0).toLowerCase() + sentenceB.slice(1);
        if (sentenceB.endsWith('.')) sentenceB = sentenceB.slice(0, -1);

        let chosenConnector = analyticalConnectors[Math.floor(Math.random() * analyticalConnectors.length)];
        finalAiResponse += `${chosenConnector}${sentenceB}`;
    }

    // Satzzeichen-Kontrolle am Ende
    if (!finalAiResponse.endsWith('.')) finalAiResponse += '.';

    // Speichert auch die generierte Antwort im Gedächtnis
    lastAnswerContext = finalAiResponse;

    return finalAiResponse;
}
