import buzzOverDistribution from './buzz-over-distribution.js';
import loadAiBots from './load-ai-bots.js';
import fetchBuzzpoints from './fetch-buzzpoints.js';

const getQuestionText = (tossup) => {
  if (!tossup) return '';
  if (typeof tossup.question_sanitized === 'string' && tossup.question_sanitized.trim()) {
    return tossup.question_sanitized;
  }
  if (typeof tossup.question === 'string' && tossup.question.trim()) {
    return tossup.question;
  }
  if (typeof tossup.question_text === 'string' && tossup.question_text.trim()) {
    return tossup.question_text;
  }
  return '';
};

const normalizeQuestionText = (raw) => {
  if (typeof raw !== 'string') return '';
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sanitized = normalized
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\s*read\s*as[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized;
};

const getNormalizedQuestionText = (tossup) => normalizeQuestionText(getQuestionText(tossup));
const splitWords = (text) => (text || '').split(' ').filter(Boolean);
const getQuestionWords = (tossup) => splitWords(getNormalizedQuestionText(tossup));

const getOptions = (tossup) => {
  const optionFields = [];
  if (Array.isArray(tossup?.options) && tossup.options.length > 0) {
    optionFields.push(...tossup.options);
  }
  ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'].forEach((key) => {
    if (tossup?.[key]) optionFields.push(tossup[key]);
  });
  return optionFields
    .map((opt) => opt?.toString?.().trim?.())
    .filter(Boolean);
};

const getCombinedWords = (tossup) => {
  const questionWords = getQuestionWords(tossup);
  const options = getOptions(tossup);
  const optionWordCounts = options.map((opt) => splitWords(opt).length || 1);
  const combined = [...questionWords];
  options.forEach((opt) => {
    combined.push(...splitWords(opt));
  });
  return { combined, questionWordCount: questionWords.length, optionWordCounts };
};

const findWordIndexFromPhrase = (phrase, words) => {
  if (!phrase || !Array.isArray(words)) return null;
  const phraseWords = phrase.trim().split(/\s+/).filter(Boolean);
  if (phraseWords.length === 0) return null;

  const lowerWords = words.map((w) => w.toLowerCase());
  const lowerPhrase = phraseWords.map((w) => w.toLowerCase());

  for (let end = lowerWords.length; end >= 0; end--) {
    const start = end - lowerPhrase.length;
    if (start < 0) break;
    const slice = lowerWords.slice(start, end);
    if (slice.join(' ') === lowerPhrase.join(' ')) {
      return end; // 1-based end index
    }
  }
  return null;
};

const mapWordIndexToEmissionIndex = (questionWordCount, optionWordCounts, wordIndex) => {
  if (!optionWordCounts.length) return Math.min(Math.max(1, wordIndex), Math.max(1, questionWordCount));
  if (wordIndex <= questionWordCount) return Math.max(1, wordIndex);
  let remaining = wordIndex - questionWordCount;
  for (let i = 0; i < optionWordCounts.length; i++) {
    const count = optionWordCounts[i] || 1;
    if (remaining <= count) {
      return questionWordCount + (i + 1);
    }
    remaining -= count;
  }
  return questionWordCount + optionWordCounts.length;
};

const getEmissionLength = (tossup) => {
  const questionWordCount = getQuestionWords(tossup).length;
  const options = getOptions(tossup);
  return Math.max(1, questionWordCount + options.length);
};

const mapBuzzpointToEmissionIndex = (tossup, predictionWordIndex, phrase) => {
  const { combined, questionWordCount, optionWordCounts } = getCombinedWords(tossup);
  const normalizedPhrase = typeof phrase === 'string' ? phrase.trim() : '';
  if (normalizedPhrase) {
    const endIndex = findWordIndexFromPhrase(normalizedPhrase, combined);
    if (endIndex) {
      return mapWordIndexToEmissionIndex(questionWordCount, optionWordCounts, endIndex);
    }
  }
  return mapWordIndexToEmissionIndex(questionWordCount, optionWordCounts, predictionWordIndex);
};

const averageHighSchool = ({ packetLength, oldTossup, tossup }) => {
  const { correctBuzz, celerity } = buzzOverDistribution({
    correct: [46518, 49312, 59738, 60321, 58337, 57581, 58921, 60667, 59449, 57866, 57030, 55423, 53349, 48334, 40934, 37458, 37758, 27999, 7028, 2765, 3],
    incorrect: [13627, 16145, 19896, 20840, 21156, 22286, 23431, 24927, 25800, 26522, 27485, 26590, 24989, 21843, 18291, 16705, 14712, 8616, 2715, 3560, 30]
  });

  const words = getQuestionWords(tossup);
  const buzzpoint = Math.floor((1 - celerity) * (words.length || 1));
  return { buzzpoint, correctBuzz };
};

const averageMiddleSchool = ({ packetLength, oldTossup, tossup }) => {
  const { correctBuzz, celerity } = buzzOverDistribution({
    correct: [11337, 12754, 13830, 15806, 16889, 17129, 17422, 17639, 18710, 19444, 20610, 20667, 20683, 20837, 22565, 25328, 23742, 12888, 2407, 787, 0],
    incorrect: [2897, 3526, 3983, 4645, 4866, 5218, 5427, 5587, 6084, 6139, 6429, 6462, 6217, 6416, 6400, 6360, 4971, 2368, 1037, 1581, 12]
  });

  const words = getQuestionWords(tossup);
  const buzzpoint = Math.floor((1 - celerity) * (Math.max(1, words.length - 2)));
  return { buzzpoint, correctBuzz };
};

const averageCollege = ({ packetLength, oldTossup, tossup }) => {
  const { correctBuzz, celerity } = buzzOverDistribution({
    correct: [16918, 19378, 23738, 22743, 21767, 21490, 21992, 21339, 20742, 19685, 19008, 17198, 15972, 14190, 11492, 9608, 9207, 7242, 1809, 218, 0],
    incorrect: [4133, 5332, 6744, 6869, 6890, 7650, 7942, 8229, 8429, 8418, 8396, 7742, 6826, 5653, 4623, 3802, 3291, 2073, 689, 872, 2]
  });

  const words = getQuestionWords(tossup);
  const buzzpoint = Math.floor((1 - celerity) * (Math.max(1, words.length - 1)));
  return { buzzpoint, correctBuzz };
};

const averageOpen = ({ packetLength, oldTossup, tossup }) => {
  const { correctBuzz, celerity } = buzzOverDistribution({
    correct: [3584, 3744, 4005, 3407, 3128, 2907, 2588, 2371, 2219, 2139, 1895, 1671, 1482, 1348, 1149, 958, 892, 807, 310, 94, 0],
    incorrect: [1207, 1466, 1530, 1477, 1566, 1526, 1372, 1437, 1335, 1233, 1173, 1051, 912, 751, 598, 489, 404, 326, 169, 201, 0]
  });

  const words = getQuestionWords(tossup);
  const buzzpoint = Math.floor((1 - celerity) * (Math.max(1, words.length - 1)));
  return { buzzpoint, correctBuzz };
};

const rightAfterPower = ({ packetLength, oldTossup, tossup }) => {
  const words = getQuestionWords(tossup);
  let buzzpoint = Math.max(words.indexOf('(*)'), words.indexOf('[*]')) + 1;
  if (buzzpoint === 0) {
    buzzpoint = (words.length || 1) / 2;
    buzzpoint = Math.floor(buzzpoint);
  }
  return { buzzpoint, correctBuzz: true };
};

const buzzRandomly = ({ packetLength, oldTossup, tossup }) => {
  const words = getQuestionWords(tossup);
  const buzzpoint = Math.floor(Math.random() * (words.length || 1));
  const correctBuzz = Math.random() < 0.5;
  return { buzzpoint, correctBuzz };
};

const sanitizeQuestionLength = (tossup) => {
  return getEmissionLength(tossup);
};

const buildBuzzpointBot = (level, fallback = averageHighSchool, options = {}) => async ({ packetLength, oldTossup, tossup }) => {
  const questionId = tossup?._id ?? tossup?.questionId ?? tossup?.id;
  console.debug('[AI-BUZZ][bot] buildBuzzpointBot', { level, questionId });
  const prediction = await fetchBuzzpoints({ questionId, level });
  if (!prediction) {
    console.warn('[AI-BUZZ][bot] missing prediction, using fallback', { level, questionId });
    return fallback({ packetLength, oldTossup, tossup });
  }

  const questionLength = sanitizeQuestionLength(tossup);
  const mapped = mapBuzzpointToEmissionIndex(tossup, prediction.wordIndex, prediction.phrase);
  const delayWords = Number.isFinite(options?.delayWords) ? Math.max(0, Math.floor(options.delayWords)) : 0;
  const buzzpoint = Math.min(Math.max(1, mapped + delayWords), questionLength);
  const correctBuzz = Math.random() < prediction.probCorrect;
  console.debug('[AI-BUZZ][bot] prediction', { level, buzzpoint, probCorrect: prediction.probCorrect, correctBuzz, mapped, delayWords, phrase: prediction.phrase });
  return { buzzpoint, correctBuzz };
};

const intermediateBuzzpointBot = async ({ packetLength, oldTossup, tossup }) => {
  const questionId = tossup?._id ?? tossup?.questionId ?? tossup?.id;
  const questionLength = sanitizeQuestionLength(tossup);
  const intermediateDelayWords = 6;
  if (!questionId) {
    return averageHighSchool({ packetLength, oldTossup, tossup });
  }

  const [beginnerPrediction, advancedPrediction] = await Promise.all([
    fetchBuzzpoints({ questionId, level: 'beginner' }),
    fetchBuzzpoints({ questionId, level: 'advanced' })
  ]);

  if (!beginnerPrediction && !advancedPrediction) {
    return averageHighSchool({ packetLength, oldTossup, tossup });
  }

  const beginnerMapped = beginnerPrediction
    ? mapBuzzpointToEmissionIndex(tossup, beginnerPrediction.wordIndex, beginnerPrediction.phrase)
    : null;
  const advancedMapped = advancedPrediction
    ? mapBuzzpointToEmissionIndex(tossup, advancedPrediction.wordIndex, advancedPrediction.phrase) + 2
    : null;
  const mappedValues = [beginnerMapped, advancedMapped].filter((value) => Number.isFinite(value));
  const averageMapped = mappedValues.length > 0
    ? Math.round(mappedValues.reduce((sum, value) => sum + value, 0) / mappedValues.length)
    : 1;
  const buzzpoint = Math.min(Math.max(1, averageMapped + intermediateDelayWords), questionLength);

  const beginnerProb = Number.isFinite(beginnerPrediction?.probCorrect) ? beginnerPrediction.probCorrect : null;
  const advancedProb = Number.isFinite(advancedPrediction?.probCorrect) ? advancedPrediction.probCorrect : null;
  const probValues = [beginnerProb, advancedProb].filter((value) => Number.isFinite(value));
  const blendedProb = probValues.length > 0
    ? probValues.reduce((sum, value) => sum + value, 0) / probValues.length
    : 0.6;
  const correctBuzz = Math.random() < blendedProb;

  console.debug('[AI-BUZZ][bot] intermediate prediction', {
    questionId,
    buzzpoint,
    beginnerMapped,
    advancedMapped,
    intermediateDelayWords,
    blendedProb,
    correctBuzz
  });
  return { buzzpoint, correctBuzz };
};

/**
 * Should be in the format of:
 * `[name: string]: [calculateBuzzpoint: function, description: string]`
 */
const aiBots = {
  'average-high-school': [averageHighSchool, 'Average high school player on qbreader'],
  'average-middle-school': [averageMiddleSchool, 'Average middle school player on qbreader'],
  'average-college': [averageCollege, 'Average college player on qbreader'],
  'average-open': [averageOpen, 'Average open player on qbreader'],
  'right-after-power': [rightAfterPower, 'Buzz right after the power mark'],
  'buzz-randomly': [buzzRandomly, 'Buzz at a random point in the question (50% chance of being correct)'],
  'ai-buzz-beginner': [buildBuzzpointBot('beginner'), 'Uses AI-precomputed buzzpoints (beginner)'],
  'ai-buzz-intermediate': [intermediateBuzzpointBot, 'Averages beginner and advanced AI buzzpoints'],
  'ai-buzz-advanced': [buildBuzzpointBot('advanced', averageHighSchool, { delayWords: 2 }), 'Uses AI-precomputed buzzpoints (advanced, slightly delayed)']
};

loadAiBots(aiBots);
export default aiBots;
