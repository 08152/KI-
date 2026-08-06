// Globaler Kontext-Speicher
let lastContextSentence = "";
let lastAnswerContext = "";

// Berechnet die Token-Anzahl
function countTokens(text) {
    return text ? (text.match(/[a-zA-ZäöüÄÖÜß]+|\d+|[^\s\w]/g) || []).length : 0;
}

// Levenshtein-Distanz für Tippfehler-Resistenz
function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) track[i] = i;
    for (let j = 0; j <= str2.length; j += 1) track[j] = j;
    for (let j = 1; j <= str2.length; j += 1) {
        for (let i = 1; i <= str1.length; i += 1) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + indicator
            );
        }
    }
    return track[str2.length][str1.length];
}

function getFuzzyScore(targetWord, queryWord) {
    if (targetWord === queryWord) return 1.0;
    if (targetWord.includes(queryWord)) return 0.8;
    if (queryWord.length > 4) {
        let maxDistance = Math.floor(queryWord.length * 0.3);
        let distance = levenshteinDistance(targetWord.substring(0, queryWord.length + 1), queryWord);
        if (distance <= maxDistance) {
            return 1.0 - (distance / queryWord.length);
        }
    }
    return 0;
}

// Sucht fehlertolerant nach passenden Sätzen
function findBestChainMatch(savedKnowledge, questionText) {
    const lowerQuestion = questionText.toLowerCase();
    const stopWords = ['wie', 'was', 'wer', 'warum', 'wo', 'ist', 'sind', 'ein', 'eine', 'der', 'die', 'das', 'ich', 'du', 'er', 'sie', 'es', 'in', 'auf', 'mit', 'von', 'den', 'zu', 'für', 'welche', 'welches', 'und', 'oder'];
    const keywords = lowerQuestion.split(/[^a-zA-ZäöüÄÖÜß\d]/).filter(w => w.length > 2 && !stopWords.includes(w));

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
            
            keywords.forEach(qWord => {
                sentenceWords.forEach((sWord, posInSentence) => {
                    let score = getFuzzyScore(sWord, qWord);
                    if (score > 0) {
                        matches.push({ word: qWord, pos: posInSentence, quality: score });
                    }
                });
            });

            contextKeywords.forEach(cWord => {
                if (sentenceWords.some(sWord => getFuzzyScore(sWord, cWord) > 0.6)) {
                    contextMatches++;
                }
            });

            if (matches.length > 0) {
                matches.sort((a, b) => a.pos - b.pos);
                let chainScore = 0;
                matches.forEach(m => chainScore += (m.quality * 50));
                
                let correctOrderCount = 0;
                for (let i = 0; i < matches.length - 1; i++) {
                    const currentWordIndex = keywords.indexOf(matches[i].word);
                    const nextWordIndex = keywords.indexOf(matches[i+1].word);
                    if (nextWordIndex > currentWordIndex) {
                        correctOrderCount++;
                        const distance = matches[i+1].pos - matches[i].pos;
                        if (distance < 4) chainScore += 45;
                    }
                }

                if (correctOrderCount === keywords.length - 1 && keywords.length > 1) {
                    chainScore += 50;
                }

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

// NEUE GENERATIVE KI-SYNTHESE (ERZEUGT JEDES MAL EINEN NEUEN TEXTFLUSS)
function generateSmartResponse(matchResult) {
    const { bestSentenceIndex, textSentences, highestChainScore, questionText } = matchResult;
    
    if (highestChainScore <= 0 || !textSentences || bestSentenceIndex === -1) {
        return "Ich habe mein gelerntes Wissen analysiert, konnte jedoch keinen ausreichenden Bezug im aktuellen Kontext feststellen.";
    }

    lastContextSentence = questionText;

    // Hole ein breiteres Informationsfenster (bis zu 4 Sätze für mehr Kombinationsfreiheit)
    let rawBlocks = textSentences.slice(Math.max(0, bestSentenceIndex - 1), bestSentenceIndex + 3);
    let cleanSentences = [];
    
    rawBlocks.forEach(s => {
        let temp = s.trim();
        temp = temp.replace(/\s*\([^)]*\)/g, ""); // Filtert Wiki-Klammern
        temp = temp.replace(/ist die Bezeichnung für|wird als.*?bezeichnet/gi, "beschreibt");
        temp = temp.replace(/ist ein[e]? von/gi, "gehört zu");
        temp = temp.replace(/^(dabei|zudem|außerdem|hierbei|jedoch|es|nun)\s+/i, ""); // Entfernt feste Satzanfänge
        if (temp.length > 15) cleanSentences.push(temp);
    });

    if (cleanSentences.length === 0) return "Die gelieferten Daten reichen nicht für eine eigene Formulierung aus.";

    // 1. ZUFÄLLIGE AUSWAHL DES HAUPTSATZES (Wechselt die Faktenreihenfolge)
    // Wir mischen die Sätze durch, damit nicht immer derselbe Satz zuerst genannt wird
    let randomIndex = Math.floor(Math.random() * cleanSentences.length);
    let sentenceA = cleanSentences[randomIndex];
    cleanSentences.splice(randomIndex, 1); // Verhindert Dopplung im selben Text

    // Satzanfang glätten
    sentenceA = sentenceA.charAt(0).toLowerCase() + sentenceA.slice(1);
    if (sentenceA.endsWith('.')) sentenceA = sentenceA.slice(0, -1);

    // 2. STRUKTUR-TYP ZUFÄLLIG WÜRFELN (Ändert das grammatikalische Gerüst komplett)
    const structureTemplates = [
        {
            openers: ["Betrachtet man das Ganze im Detail, zeigt sich, dass ", "Im Kern lässt sich folgern, dass ", "Untersuchungen der Fakten verdeutlichen: ", "Daraus geht hervor, dass "],
            connectors: [", während parallel dazu gilt, dass ", ". Zudem untermauert sich hierbei, dass ", ", was im nächsten Schritt bedeutet, dass "]
        },
        {
            openers: ["Interessanterweise beschreibt der Kontext, dass ", "Es ist logisch anzunehmen, dass ", "Die Daten weisen darauf hin: ", "Zusammenfassend lässt sich sagen, dass "],
            connectors: [". Ergänzend dazu lässt sich anführen, dass ", ", woraus sich gleichermaßen ableiten lässt, dass ", ". Eng damit verknüpft ist, dass "]
        },
        {
            openers: ["Analysiert man diesen Aspekt, wird klar, dass ", "Hierbei manifestiert sich, dass ", "Konkret verhält es sich so, dass ", "Die vorliegenden Dokumente zeigen: "],
            connectors: [", was wiederum untermauert, dass ", ". Auf der anderen Seite zeigt sich, dass ", ", wohingegen ebenso auffällt, dass "]
        }
    ];

    // Zufälliges Template-Paket wählen
    let currentTemplate = structureTemplates[Math.floor(Math.random() * structureTemplates.length)];
    let chosenOpener = currentTemplate.openers[Math.floor(Math.random() * currentTemplate.openers.length)];
    let chosenConnector = currentTemplate.connectors[Math.floor(Math.random() * currentTemplate.connectors.length)];

    let finalAiResponse = `${chosenOpener}${sentenceA}`;

    // 3. EINEN ZWEITEN, ZUFÄLLIGEN FAKT ANKNÜPFEN (Falls vorhanden)
    if (cleanSentences.length > 0) {
        let secondRandomIndex = Math.floor(Math.random() * cleanSentences.length);
        let sentenceB = cleanSentences[secondRandomIndex];
        
        // Pronomen-Variationen zufällig bestimmen
        const pronouns = ["dieser Umstand ", "dieses System ", "dieser Sachverhalt ", " jener Faktor "];
        let randomPronoun = pronouns[Math.floor(Math.random() * pronouns.length)];

        // Ersetzt steife Artikel am Satzanfang durch das Pronomen
        sentenceB = sentenceB.replace(/^(er|sie|es|das|der|die)\s+/i, randomPronoun);
        sentenceB = sentenceB.charAt(0).toLowerCase() + sentenceB.slice(1);
        if (sentenceB.endsWith('.')) sentenceB = sentenceB.slice(0, -1);

        finalAiResponse += `${chosenConnector}${sentenceB}`;
    }

    // Satzzeichen-Garantie
    if (!finalAiResponse.endsWith('.')) finalAiResponse += '.';
    lastAnswerContext = finalAiResponse;

    return finalAiResponse;
}
s
