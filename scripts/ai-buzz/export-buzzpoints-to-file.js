#!/usr/bin/env node
import 'dotenv/config';

import fs from 'fs';
import path from 'path';

import { mongoClient, scienceBowl } from '../../database/databases.js';
import { generateBuzzpointsForQuestion } from '../../server/ai/buzzpoint-service.js';

const DEFAULT_OUT = process.env.AI_BUZZ_EXPORT_PATH || './ai-buzzpoints.jsonl';
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='));
const OUT_ARG = process.argv.find(arg => arg.startsWith('--out='));
const limit = LIMIT_ARG ? Number.parseInt(LIMIT_ARG.split('=')[1], 10) : null;
const outPath = path.resolve(process.cwd(), OUT_ARG ? OUT_ARG.split('=')[1] : DEFAULT_OUT);

function pickQuestionId(question) {
  return (
    question?._id ??
    question?.id ??
    question?.question_id ??
    question?.tossup_id
  );
}

async function main() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY is required to generate buzzpoints');
  }

  const questions = scienceBowl.collection('questions');
  const cursor = questions.find({}, {
    projection: {
      question: 1,
      question_text: 1,
      answer: 1,
      category: 1,
      id: 1,
      question_id: 1,
      tossup_id: 1,
      options: 1,
      option_a: 1,
      option_b: 1,
      option_c: 1,
      option_d: 1,
      option_e: 1
    }
  });

  let processed = 0;
  const outputStream = fs.createWriteStream(outPath, { flags: 'a' });
  console.log(`[AI-BUZZ] Exporting buzzpoints to ${outPath}${limit ? ` (limit ${limit})` : ''}`);

  for await (const question of cursor) {
    if (limit && processed >= limit) break;
    processed++;

    const questionId = pickQuestionId(question);
    if (questionId === undefined || questionId === null) {
      console.warn('[AI-BUZZ] Skipping question with no usable id', question);
      continue;
    }

    try {
      const generated = await generateBuzzpointsForQuestion(question);
      const record = {
        questionId,
        category: question?.category,
        promptVersion: generated.promptVersion,
        model: generated.model,
        predictions: generated.predictions,
        questionLength: generated.words.length,
        createdAt: new Date().toISOString()
      };
      outputStream.write(JSON.stringify(record) + '\n');
      if (processed % 25 === 0) {
        console.log(`[AI-BUZZ] Exported ${processed} records (last id=${questionId})`);
      }
    } catch (error) {
      console.error(`[AI-BUZZ] Failed to generate for id=${questionId}`, error.message);
    }
  }

  outputStream.end();
  console.log(`[AI-BUZZ] Export complete. Total processed: ${processed}`);
}

main()
  .then(() => mongoClient.close())
  .catch((err) => {
    console.error('[AI-BUZZ] Export failed', err);
    mongoClient.close().finally(() => process.exit(1));
  });
