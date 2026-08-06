// Globaler Kontext-Speicher
let lastContextSentence = "";
let lastAnswerContext = "";

// Berechnet die Token-Anzahl
function countTokens(text) {
    return text ? (text.match(/[a-zA-ZäöüÄÖÜß]+|\d+|[^\s\w]/g) || []).length : 0;
}

// Mathematische Levenshtein-Distanz zur Behebung von Rechtschreibfehlern
function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= str2.length; j += 1) {
        for (let i = 1; i <= str1.length; i += 1) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // Löschen
                track[j - 1][i] + 1, // Einfügen
                track[j - 1][i - 1] + indicator // Ersetzen
            );
        }
    }
    return track[str2.length][str1.length];
}

// Prüft fehlertolerant, ob und wie gut ein gesuchtes Wort in einem Text-Wort vorkommt
function getFuzzyScore(targetWord, queryWord) {
    if (targetWord === queryWord) return 1.0; // Exakter Treffer
    if (targetWord.includes(queryWord)) return 0.8; // Teil-Treffer (z.B. Groß/Kleinschreibung gelöst)
    
    // Wenn das Wort lang genug ist, berechnen wir die Editier-Distanz für Tippfehler
    if (queryWord.length > 4) {
        let maxDistance = Math.floor(queryWord.length * 0.3); // Erlaubt bis zu 30% Fehler im Wort
        let distance = levenshteinDistance(targetWord.substring(0, queryWord.length + 1), queryWord);
        if (distance <= maxDistance) {
            return 1.0 - (distance / queryWord.length); // Score sinkt leicht je mehr Fehler
        }
    }
    return 0;
}

// Sucht nach der logischsten Satz-Kette (Komplett fehlertolerant)
function findBestChainMatch(savedKnowledge, questionText) {
    const lowerQuestion = questionText.toLowerCase();
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den', 'zu', 'für', 'welche', 'welches', 'und', 'oder'];
    
    // Keywords der Frage
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

    // Kontext-Keywords aus dem vorherigen Satz
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
            const sentenceWords = lowerSentence.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2);
            
            let matches = [];
            let contextMatches = 0;
            
            // Fehlertolerante Keyword-Prüfung
            keywords.forEach(qWord => {
                sentenceWords.forEach((sWord, posInSentence) => {
                    let score = getFuzzyScore(sWord, qWord);
                    if (score > 0) {
                        matches.push({ word: qWord, pos: posInSentence, quality: score });
                    }
                });
            });

            // Kontext-Abgleich
            contextKeywords.forEach(cWord => {
                if (sentenceWords.some(sWord => getFuzzyScore(sWord, cWord) > 0.6)) {
                    contextMatches++;
                }
            });

            if (matches.length > 0) {
                // Sortiere nach Position im Satz
                matches.sort((a, b) => a.pos - b.pos);
                
                let chainScore = 0;
                matches.forEach(m => chainScore += (m.quality * 50)); // Bezieht Tippfehler-Qualität ein
                
                let correctOrderCount = 0;
                for (let i = 0; i < matches.length - 1; i++) {
                    const currentWordIndex = keywords.indexOf(matches[i].word);
                    const nextWordIndex = keywords.indexOf(matches[i+1].word);
                    
                    if (nextWordIndex > currentWordIndex) {
                        correctOrderCount++;
                        const distance = matches[i+1].pos - matches[i].pos;
                        if (distance < 4) chainScore += 45; // Bonus für logische Dichte im Satz
                    }
                }

                if (correctOrderCount === keywords.length - 1 && keywords.length > 1) {
                    chainScore += 50;
                }

                // Sanfter Fokus-Schutz
                if (contextKeywords.length > 0 && contextMatches > 0) {
                    chainScore += (contextMatches / contextKeywords.length) * 35;
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
        return "Ich habe mein gelerntes Wissen analysiert, konnte jedoch keinen ausreichenden Bezug im aktuellen Kontext feststellen.";
    }

    lastContextSentence = questionText;

    let rawBlocks = textSentences.slice(Math.max(0, bestSentenceIndex), bestSentenceIndex + 3);
    let cleanSentences = [];
    
    rawBlocks.forEach(s => {
        let temp = s.trim();
        temp = temp.replace(/\s*\([^)]*\)/g, ""); 
        temp = temp.replace(/ist die Bezeichnung für|wird als.*?bezeichnet/gi, "beschreibt");
        temp = temp.replace(/ist ein[e]? von/gi, "gehört zu");
        if (temp.length > 12) cleanSentences.push(temp);
    });

    if (cleanSentences.length === 0) return "Die gelieferten Daten reichen nicht für eine eigene Formulierung aus.";

    const smartOpeners = [
        "In Bezug auf deine Frage zeigt sich, dass ",
        "Daraus lässt sich logisch ableiten, dass ",
        "Diese Verbindung verdeutlicht, dass ",
        "Das bedeutet konkret: ",
        "Analysiert man diesen Sachverhalt, beschreibt es vor allem, dass "
    ];

    const analyticalConnectors = [
        ". Ergänzend dazu zeigt sich, dass ",
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
