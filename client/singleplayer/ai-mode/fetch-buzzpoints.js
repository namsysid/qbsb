const cache = new Map();

function buildCacheKey(questionId, level) {
  return `${questionId}:${level}`;
}

/**
 * Fetch precomputed buzzpoints for a question/difficulty.
 * @param {object} params
 * @param {string} params.questionId
 * @param {'beginner'|'intermediate'|'advanced'} params.level
 * @returns {Promise<{wordIndex: number, probCorrect: number} | null>}
 */
export default async function fetchBuzzpoints({ questionId, level }) {
  if (!questionId || !level) return null;
  const key = buildCacheKey(questionId, level);
  if (cache.has(key)) return cache.get(key);

  try {
    const response = await fetch(`/api/ai-buzz/${questionId}?level=${encodeURIComponent(level)}`);
    if (!response.ok) {
      cache.set(key, null);
      return null;
    }

    const data = await response.json();
    const prediction = data.prediction || data.predictions?.[level];
    if (!prediction || !Number.isFinite(prediction.wordIndex) || !Number.isFinite(prediction.probCorrect)) {
      cache.set(key, null);
      return null;
    }

    const cleaned = {
      wordIndex: Math.max(1, Math.floor(prediction.wordIndex)),
      probCorrect: Math.min(Math.max(prediction.probCorrect, 0), 1)
    };
    cache.set(key, cleaned);
    return cleaned;
  } catch (error) {
    console.warn('Failed to fetch buzzpoints', error);
    cache.set(key, null);
    return null;
  }
}
