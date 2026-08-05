// Berechnet die Token-Anzahl (Wort- und Zeichenfragmente)
export function countTokens(text) {
    return text ? (text.match(/[a-zA-ZäöüÄÖÜß]+|\d+|[^\s\w]/g) || []).length : 0;
}

// Sucht nach der logischsten Satz-Kette (Wort 1 -> Wort 2 -> Wort 3)
export function findBestChainMatch(savedKnowledge, questionText) {
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
                        if (distance < 30) chainScore += 35; // Höherer Bonus für dichte Wort-Ketten
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

    return { bestMatch, highestChainScore, bestSentenceIndex, textSentences };
}
