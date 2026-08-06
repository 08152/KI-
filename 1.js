// Globaler Kontext-Speicher (Merkt sich das Gespräch, um beim Thema zu bleiben)
let lastContextSentence = "";
let lastAnswerContext = "";

// Berechnet die Token-Anzahl (Wort- und Zeichenfragmente)
function countTokens(text) {
    return text ? (text.match(/[a-zA-ZäöüÄÖÜß]+|\d+|[^\s\w]/g) || []).length : 0;
}

// Sucht nach der logischsten Satz-Kette unter Einbeziehung des GESAMTEN vorherigen Satzes
function findBestChainMatch(savedKnowledge, questionText) {
    const lowerQuestion = questionText.toLowerCase();
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den', 'zu', 'für', 'welche', 'welches'];
    
    // Aktuelle Suchbegriffe
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

    // Kontext-Keywords aus dem GESAMTEN letzten Satz extrahieren (Fokus-Schutz)
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
        const sentences = doc.text.split(/(?<!\bz\.\s*B)(?<!\bdr)(?<!\bprof)\.\s+/i);
        
        sentences.forEach((sentence, index) => {
            const lowerSentence = sentence.toLowerCase();
            let matches = [];
            let contextMatches = 0;
            
            keywords.forEach(word => {
                const pos = lowerSentence.indexOf(word);
                if (pos !== -1) matches.push({ word: word, pos: pos });
            });

            contextKeywords.forEach(word => {
                if (lowerSentence.includes(word)) contextMatches++;
            });

            if (matches.length > 0) {
                matches.sort((a, b) => a.pos - b.pos);
                let chainScore = matches.length * 30; 
                let correctOrderCount = 0;

                for (let i = 0; i < matches.length - 1; i++) {
                    const currentWordIndex = keywords.indexOf(matches[i].word);
                    const nextWordIndex = keywords.indexOf(matches[i+1].word);
                    
                    if (nextWordIndex > currentWordIndex) {
                        correctOrderCount++;
                        const distance = matches[i+1].pos - (matches[i].pos + matches[i].word.length);
                        if (distance < 50) chainScore += 65; 
                    }
                }

                if (correctOrderCount === keywords.length - 1 && keywords.length > 1) {
                    chainScore += 80;
                }

                // GANZ-SATZ-FOKUS-BEWERTUNG (Anti-Universum-Schokolade-Bremse)
                if (contextMatches > 0) {
                    chainScore += (contextMatches / contextKeywords.length) * 120;
                } else if (lastContextSentence && contextMatches === 0) {
                    chainScore -= 50; // Punktabzug bei unlogischem Themenwechsel
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

// GENERATIVE KI-SYNTHESE (EIGENE WORTE)
function generateSmartResponse(matchResult) {
    const { bestSentenceIndex, textSentences, highestChainScore, questionText } = matchResult;
    
    if (highestChainScore <= 0 || !textSentences || bestSentenceIndex === -1) {
        return "Ich habe meine Datenbank durchsucht, konnte aber im Kontext keinen logischen Bezug herstellen.";
    }

    // Neue Frage als Kontext für den nächsten Durchlauf merken
    lastContextSentence = questionText;

    let rawBlocks = textSentences.slice(Math.max(0, bestSentenceIndex), bestSentenceIndex + 3);
    let cleanSentences = [];
    
    rawBlocks.forEach(s => {
        let temp = s.trim();
        temp = temp.replace(/\s*\([^)]*\)/g, ""); // Entfernt Wiki-Klammern
        temp = temp.replace(/ist die Bezeichnung für|wird als.*?bezeichnet/gi, "beschreibt");
        temp = temp.replace(/ist ein[e]? von/gi, "gehört zu");
        if (temp.length > 12) cleanSentences.push(temp);
    });

    if (cleanSentences.length === 0) return "Die gelieferten Daten reichen nicht für eine eigene Formulierung aus.";

    const smartOpeners = [
        "Betrachtet man den gesamten Kontext, wird deutlich, dass ",
        "Daraus lässt sich logisch ableiten, dass ",
        "Diese Verbindung zeigt auf, dass ",
        "Das bedeutet konkret: ",
        "Analysiert man diesen Sachverhalt, beschreibt es vor allem, dass "
    ];

    const analyticalConnectors = [
        ". Ergänzend dazu verdeutlicht sich, dass ",
        ", während im selben Zuge klar wird, dass ",
        ". Dies führt folglich dazu, dass ",
        ", was wiederum untermauert, dass "
    ];

    let sentenceA = cleanSentences[0];
    sentenceA = sentenceA.replace(/^(dabei|zudem|außerdem|hierbei|jedoch|es)\s+/i, "");
    sentenceA = sentenceA.charAt(0).toLowerCase() + sentenceA.slice(1);
    if (sentenceA.endsWith('.')) sentenceA = sentenceA.slice(0, -1);

    let chosenOpener = smartOpeners[Math.floor(Math.random() * smartOpeners.length)];
    let finalAiResponse = `${chosenOpener}${sentenceA}`;

    if (cleanSentences.length > 1) {
        let sentenceB = cleanSentences[1];
        sentenceB = sentenceB.replace(/^(er|sie|es|das|der|die)\s+/i, "dieser Umstand ");
        sentenceB = sentenceB.charAt(0).toLowerCase() + sentenceB.slice(1);
        if (sentenceB.endsWith('.')) sentenceB = sentenceB.slice(0, -1);

        let chosenConnector = analyticalConnectors[Math.floor(Math.random() * analyticalConnectors.length)];
        finalAiResponse += `${chosenConnector}${sentenceB}`;
    }

    if (!finalAiResponse.endsWith('.')) finalAiResponse += '.';
    lastAnswerContext = finalAiResponse;

    return finalAiResponse;
}
