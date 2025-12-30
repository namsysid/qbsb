import 'dotenv/config';

import { ObjectId } from 'mongodb';
import { scienceBowl } from '../../database/databases.js';

export const BUZZ_PROMPT_VERSION = '2025-02-05';
const DEFAULT_MODEL = process.env.AI_BUZZ_MODEL || 'gpt-4o-mini';
const DEBUG = process.env.AI_BUZZ_DEBUG === 'true';

/**
 * Normalize question text to the same form that the reader uses when emitting words.
 * Mirrors the logic in client/singleplayer/ScienceBowlRoom.getNormalizedQuestionText.
 */
export function normalizeScienceBowlQuestionText(question) {
  const primary = typeof question?.question === 'string' ? question.question : '';
  const fallback = typeof question?.question_text === 'string' ? question.question_text : '';
  const raw = primary.trim().length > 0 ? primary : fallback;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const sanitized = normalized
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\s*read\s*as[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return '';
  }

  const words = sanitized.split(' ');
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(' ').trim();
    const secondHalf = words.slice(half).join(' ').trim();
    if (firstHalf && firstHalf === secondHalf) {
      return firstHalf;
    }
  }

  return sanitized;
}

function appendOptionsToQuestion(questionText, question) {
  const optionFields = [];
  if (Array.isArray(question?.options) && question.options.length > 0) {
    optionFields.push(...question.options);
  }
  // Common single-field option shapes: option_a, option_b, etc.
  ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'].forEach((key) => {
    if (question?.[key]) optionFields.push(question[key]);
  });
  if (optionFields.length === 0) {
    return questionText;
  }
  const optionsText = optionFields
    .map((opt) => opt?.toString?.().trim?.())
    .filter(Boolean)
    .join(' ');
  return `${questionText} ${optionsText}`.trim().replace(/\s+/g, ' ');
}

function buildBuzzPrompt({ questionText, category, words }) {
  const levels = [
    { id: 'beginner', description: 'newer player who needs more of the clue' },
    { id: 'intermediate', description: 'solid high-school player' },
    { id: 'advanced', description: 'strong player who can buzz early' }
  ];

  const levelsText = levels.map(
    (level) => `"${level.id}": { "buzz_last_words": "exact last 6 words that will be read before buzzing (include options if they are read, or use the reserved token AFTER to denote buzzing exactly at the end)", "prob_correct": 0.0-1.0, "text_line": "One line summary for this level" }`
  ).join(',\n');

  return `List the buzzing points in the following Science Bowl question and accuracy (including negs as wrong) for Beginner, Intermediate, and Advanced Science Bowl players. 
Take into account experience, hesitation, interrupting, and negging (interrupting before the question ends and getting it wrong), and knowledge gained.
The goal is to imitate a live player at each level. Remember, beginners buzz late into the question (most likely seconds after the end of question/answer choices) and know less, advanced players buzz early and know more, intermediates are in between.

You must return strict JSON only, nothing else, with this exact shape:
{
  "version": "${BUZZ_PROMPT_VERSION}",
  ${levelsText}
}

Field rules (follow exactly):
- buzz_last_words: exactly the last 6 words (or fewer if fewer remain) heard before buzzing; include answer choices if they would be read. Use the reserved token "AFTER" if buzzing at the exact end of the question/options.
- prob_correct: probability of answering correctly at that buzz point (0.0-1.0; include negging as incorrect).
- text_line: a single line in the format "Level: <last 6 words or AFTER> — <percent>% correct".

Sanitized question (use for word positions, include options if present): ${questionText}
Category: ${category || 'Science'}`;
}

function clampWordIndex(idx, max) {
  if (typeof idx !== 'number' || Number.isNaN(idx)) return null;
  return Math.min(Math.max(Math.round(idx), 1), max);
}

function normalizeProbability(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (value > 1) return Math.min(value / 100, 1);
  if (value < 0) return 0;
  return value;
}

function findWordIndexFromPhrase(phrase, words) {
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
      return end;
    }
  }

  return null;
}

function fallbackWordIndexForLevel(level, wordsLength) {
  const fractions = {
    beginner: 0.9,
    intermediate: 0.7,
    advanced: 0.45
  };
  const frac = fractions[level] ?? 0.7;
  return clampWordIndex(Math.floor(frac * wordsLength), wordsLength);
}

export function parseBuzzResponse({ content, words }) {
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.warn('[AI-BUZZ] Failed to parse JSON content', error);
    return null;
  }

  const result = {};
  ['beginner', 'intermediate', 'advanced'].forEach((level) => {
    const entry = parsed[level];
    if (!entry) return;
    const probCorrect = normalizeProbability(entry.prob_correct);
    const phraseRaw = typeof entry.buzz_last_words === 'string'
      ? entry.buzz_last_words.trim()
      : (typeof entry.buzz_phrase === 'string' ? entry.buzz_phrase.trim() : '');
    const isEndToken = phraseRaw?.toUpperCase?.() === 'AFTER';
    const phrase = phraseRaw;
    const derivedWordIndex = isEndToken
      ? words.length
      : (phrase ? findWordIndexFromPhrase(phrase, words) : words.length);
    const wordIndex = clampWordIndex(derivedWordIndex ?? fallbackWordIndexForLevel(level, words.length), words.length);
    if (wordIndex && probCorrect !== null) {
      result[level] = {
        wordIndex,
        phrase,
        probCorrect
      };
    }
  });

  if (Object.keys(result).length === 0) return null;
  return result;
}

export async function generateBuzzpointsForQuestion(question, { openaiApiKey = process.env.OPENAI_API_KEY, model = DEFAULT_MODEL } = {}) {
  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY for buzzpoint generation');
  }

  const baseText = normalizeScienceBowlQuestionText(question);
  const questionText = appendOptionsToQuestion(baseText, question);
  if (!questionText) {
    throw new Error('Question missing text for buzzpoint generation');
  }

  if (DEBUG) {
    const id = question?._id ?? question?.id ?? question?.question_id ?? question?.tossup_id;
    console.log('[AI-BUZZ][DEBUG] Generating for id=', id, 'text=', questionText.slice(0, 180));
  }

  const words = questionText.split(' ').filter(Boolean);
  const prompt = buildBuzzPrompt({ questionText, category: question?.category, words });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return only strict JSON. You are calibrating buzz timing for a Science Bowl AI opponent.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 400
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'OpenAI request failed for buzzpoints');
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const parsed = parseBuzzResponse({ content, words });
  if (!parsed) {
    throw new Error('AI buzzpoint response could not be parsed');
  }

  return {
    questionText,
    words,
    predictions: parsed,
    model: data.model,
    usage: data.usage,
    promptVersion: BUZZ_PROMPT_VERSION
  };
}

export async function upsertBuzzpoints({ questionId, question, force = false, promptVersion = BUZZ_PROMPT_VERSION, model = DEFAULT_MODEL }) {
  const asObjectId = ObjectId.isValid(questionId) ? new ObjectId(questionId) : null;
  const asNumber = typeof questionId === 'number' ? questionId : Number.isFinite(Number(questionId)) && !Number.isNaN(Number(questionId)) ? Number(questionId) : null;
  const asString = typeof questionId === 'string' ? questionId : questionId?.toString?.();
  if (!asObjectId && !asString && !Number.isFinite(asNumber)) {
    throw new Error('Invalid questionId for buzzpoint upsert');
  }

  const collection = scienceBowl.collection('ai_buzzpoints');
  const filter = {
    promptVersion,
    $or: [
      ...(asObjectId ? [{ questionId: asObjectId }, { questionIdObjectId: asObjectId }] : []),
      ...(Number.isFinite(asNumber) ? [{ questionId: asNumber }, { questionIdNumber: asNumber }] : []),
      ...(asString ? [{ questionId: asString }, { questionIdString: asString }] : [])
    ]
  };

  const existing = await collection.findOne(filter);
  if (existing && !force) {
    return existing;
  }

  const generated = await generateBuzzpointsForQuestion(question, { model });
  const doc = {
    questionId: asObjectId ?? (Number.isFinite(asNumber) ? asNumber : asString),
    questionIdObjectId: asObjectId || null,
    questionIdNumber: Number.isFinite(asNumber) ? asNumber : null,
    questionIdString: asString || null,
    promptVersion: generated.promptVersion,
    model: generated.model,
    usage: generated.usage,
    predictions: generated.predictions,
    questionLength: generated.words.length,
    createdAt: new Date()
  };

  await collection.updateOne(
    { $or: filter.$or },
    { $set: doc },
    { upsert: true }
  );

  return doc;
}
