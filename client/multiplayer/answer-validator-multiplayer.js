// Answer validation utility functions

/**
 * Processes the answer to extract the main answer and any ACCEPT directives
 * @param {string} answer - The answer text to process
 * @returns {Object} Object containing the main answer and alternate answers
 */
function processAnswer(answer) {
    if (!answer) return { mainAnswer: '', alternateAnswers: [] };

    // Extract ACCEPT directives from parentheses
    const acceptRegex = /\(ACCEPT:\s*([^)]+)\)/gi;
    const alternateAnswers = [];
    let match;
    
    // Find all ACCEPT directives
    while ((match = acceptRegex.exec(answer)) !== null) {
        alternateAnswers.push(match[1].trim());
    }

    // Remove all ACCEPT directives from the main answer
    const mainAnswer = answer.replace(/\(ACCEPT:\s*[^)]+\)/gi, '').trim();

    return {
        mainAnswer,
        alternateAnswers
    };
}

/**
 * Normalizes text for comparison by:
 * - Converting to lowercase
 * - Removing punctuation
 * - Removing extra whitespace
 * - Removing articles (a, an, the)
 * @param {string} text - The text to normalize
 * @returns {string} The normalized text
 */
function normalizeText(text) {
    if (!text) return '';
    
    return text
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .replace(/\b(a|an|the)\b/g, '') // Remove articles
        .trim();
}

/**
 * Checks if the user's answer matches the correct answer
 * @param {string} userAnswer - The answer provided by the user
 * @param {string} correctAnswer - The correct answer from the database
 * @param {number} strictness - Level of strictness in matching (0-20)
 * @returns {Object} Result object containing match status and details
 */
function validateAnswer(userAnswer, correctAnswer, strictness = 7) {
    if (!userAnswer || !correctAnswer) {
        return {
            isCorrect: false,
            reason: 'Missing answer'
        };
    }

    // Process the correct answer to get main answer and alternates
    const { mainAnswer, alternateAnswers } = processAnswer(correctAnswer);

    // Handle special case for single character/letter answers
    if (userAnswer.length === 1 && mainAnswer.length === 1) {
        const isCorrect = userAnswer.toLowerCase() === mainAnswer.toLowerCase() ||
            alternateAnswers.some(alt => alt.length === 1 && userAnswer.toLowerCase() === alt.toLowerCase());
        return {
            isCorrect,
            matchType: isCorrect ? 'exact' : 'none',
            userAnswer: userAnswer,
            correctAnswer: correctAnswer
        };
    }

    // Handle special case for numeric answers
    if (!isNaN(userAnswer) && !isNaN(mainAnswer)) {
        const isCorrect = userAnswer === mainAnswer ||
            alternateAnswers.some(alt => !isNaN(alt) && userAnswer === alt);
        return {
            isCorrect,
            matchType: isCorrect ? 'exact' : 'none',
            userAnswer: userAnswer,
            correctAnswer: correctAnswer
        };
    }

    const normalizedUserAnswer = normalizeText(userAnswer);
    const normalizedMainAnswer = normalizeText(mainAnswer);
    const normalizedAlternates = alternateAnswers.map(alt => normalizeText(alt));

    // Check against main answer
    if (normalizedUserAnswer === normalizedMainAnswer) {
        return {
            isCorrect: true,
            matchType: 'exact',
            userAnswer: userAnswer,
            correctAnswer: correctAnswer
        };
    }

    // Check against alternate answers
    for (const alt of normalizedAlternates) {
        if (normalizedUserAnswer === alt) {
            return {
                isCorrect: true,
                matchType: 'exact',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer
            };
        }
    }

    // Handle multiple correct answers (separated by semicolons)
    const correctAnswers = normalizedMainAnswer.split(';').map(ans => ans.trim());
    
    // Check if user's answer matches any of the correct answers
    for (const answer of correctAnswers) {
        if (normalizedUserAnswer === answer) {
            return {
                isCorrect: true,
                matchType: 'exact',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer
            };
        }
    }

    // If strictness is very low, try word-by-word matching
    if (strictness < 5) {
        const userWords = new Set(normalizedUserAnswer.split(' '));
        const correctWords = new Set(normalizedMainAnswer.split(' '));
        
        // Calculate word overlap
        const commonWords = [...userWords].filter(word => correctWords.has(word));
        const overlapRatio = commonWords.length / Math.max(userWords.size, correctWords.size);
        
        if (overlapRatio > 0.7) { // 70% word overlap threshold
            return {
                isCorrect: true,
                matchType: 'word-overlap',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                overlapRatio: overlapRatio
            };
        }
    }

    return {
        isCorrect: false,
        matchType: 'none',
        userAnswer: userAnswer,
        correctAnswer: correctAnswer
    };
}

/**
 * Formats the validation result for display
 * @param {Object} result - The validation result object
 * @returns {string} Formatted result message
 */
function formatValidationResult(result) {
    if (result.isCorrect) {
        switch (result.matchType) {
            case 'exact':
                return 'Correct!';
            case 'word-overlap':
                return `Correct (${Math.round(result.overlapRatio * 100)}% match)!`;
            default:
                return 'Correct!';
        }
    } else {
        return `Incorrect. The correct answer was: ${result.correctAnswer}`;
    }
}

// Export the functions
export {
    validateAnswer,
    formatValidationResult,
    normalizeText,
    processAnswer
};