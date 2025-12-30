#!/usr/bin/env node
import 'dotenv/config';

import { ObjectId } from 'mongodb';
import { scienceBowl, mongoClient } from '../../database/databases.js';
import { BUZZ_PROMPT_VERSION, upsertBuzzpoints, normalizeScienceBowlQuestionText } from '../../server/ai/buzzpoint-service.js';

const BATCH_SIZE = Number.parseInt(process.env.AI_BUZZ_BATCH_SIZE || '25', 10);
const FORCE = process.argv.includes('--force');
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number.parseInt(LIMIT_ARG.split('=')[1], 10) : null;

async function main() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY is required to generate buzzpoints');
  }

  const questions = scienceBowl.collection('questions');
  const buzzpoints = scienceBowl.collection('ai_buzzpoints');

  const totalToProcess = LIMIT ?? await questions.countDocuments();
  console.log(`[AI-BUZZ] Starting backfill. Target=${totalToProcess} force=${FORCE} version=${BUZZ_PROMPT_VERSION}`);

  const cursor = questions.find({}, { projection: { question: 1, question_text: 1, answer: 1, category: 1 } });
  let processed = 0;
  for await (const question of cursor) {
    if (LIMIT && processed >= LIMIT) break;
    processed++;

    const asObjectId = ObjectId.isValid(question._id) ? new ObjectId(question._id) : null;
    const asNumber = typeof question._id === 'number' ? question._id : Number.isFinite(Number(question._id)) && !Number.isNaN(Number(question._id)) ? Number(question._id) : null;
    const asString = question._id?.toString?.();
    const orClauses = [
      { questionId: question._id },
      { questionIdString: asString }
    ];
    if (asObjectId) orClauses.push({ questionIdObjectId: asObjectId });
    if (Number.isFinite(asNumber)) orClauses.push({ questionIdNumber: asNumber });

    const existing = await buzzpoints.findOne({
      promptVersion: BUZZ_PROMPT_VERSION,
      $or: orClauses
    });
    if (existing && !FORCE) {
      if (processed % 50 === 0) {
        console.log(`[AI-BUZZ] Skipping existing (${processed}/${totalToProcess}) questionId=${question._id.toString()}`);
      }
      continue;
    }

    const normalized = normalizeScienceBowlQuestionText(question);
    if (!normalized || !question.answer) {
      console.warn('[AI-BUZZ] Skipping question missing text/answer', question?._id?.toString?.());
      continue;
    }

    try {
      const doc = await upsertBuzzpoints({ questionId: question._id, question, force: FORCE });
      console.log(`[AI-BUZZ] Stored buzzpoints for questionId=${question._id.toString()} (len=${doc.questionLength})`);
    } catch (error) {
      console.error(`[AI-BUZZ] Error processing questionId=${question._id.toString()}`, error.message);
    }

    if (processed % BATCH_SIZE === 0) {
      console.log(`[AI-BUZZ] Processed ${processed}/${totalToProcess} so far...`);
    }
  }
}

main()
  .then(() => {
    console.log('[AI-BUZZ] Backfill finished');
    return mongoClient.close();
  })
  .catch((error) => {
    console.error('[AI-BUZZ] Backfill failed', error);
    mongoClient.close().finally(() => process.exit(1));
  });
