import { Router } from 'express';
import { scienceBowl } from '../../database/databases.js';
import { upsertBuzzpoints, normalizeScienceBowlQuestionText, BUZZ_PROMPT_VERSION } from '../../server/ai/buzzpoint-service.js';
import { ObjectId } from 'mongodb';

const router = Router();

router.get('/health/version', (_req, res) => {
  res.json({ ok: true, promptVersion: BUZZ_PROMPT_VERSION });
});

function buildLookupFilter(id) {
  const asObjectId = ObjectId.isValid(id) ? new ObjectId(id) : null;
  const asNumber = typeof id === 'number' ? id : Number.isFinite(Number(id)) && !Number.isNaN(Number(id)) ? Number(id) : null;
  const asString = typeof id === 'string' ? id : id?.toString?.();
  const ors = [];
  if (asObjectId) {
    ors.push({ questionId: asObjectId }, { questionIdObjectId: asObjectId });
  }
  if (Number.isFinite(asNumber)) {
    ors.push({ questionId: asNumber }, { questionIdNumber: asNumber });
  }
  if (asString) {
    ors.push({ questionId: asString }, { questionIdString: asString });
  }
  return ors.length ? { $or: ors } : null;
}

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const level = (req.query.level || '').toString().toLowerCase();
    const filter = buildLookupFilter(id);
    if (!filter) {
      return res.status(400).json({ error: 'Invalid question id' });
    }

    const collection = scienceBowl.collection('ai_buzzpoints');
    const doc = await collection.findOne(filter);
    if (!doc) {
      return res.status(404).json({ error: 'No buzzpoint record found for question' });
    }

    const payload = {
      questionId: doc.questionId,
      promptVersion: doc.promptVersion,
      model: doc.model,
      questionLength: doc.questionLength,
      predictions: doc.predictions
    };

    if (level && payload.predictions?.[level]) {
      payload.prediction = payload.predictions[level];
    }

    res.json(payload);
  } catch (error) {
    console.error('AI buzz GET error', error);
    res.status(500).json({ error: 'Failed to fetch buzzpoints', details: error.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { questionId, force } = req.body || {};
    const filter = buildLookupFilter(questionId);
    if (!filter) {
      return res.status(400).json({ error: 'Valid questionId is required' });
    }

    const questions = scienceBowl.collection('questions');
    const questionLookup = [];
    const asObjectId = ObjectId.isValid(questionId) ? new ObjectId(questionId) : null;
    const asNumber = typeof questionId === 'number' ? questionId : Number.isFinite(Number(questionId)) && !Number.isNaN(Number(questionId)) ? Number(questionId) : null;
    const asString = typeof questionId === 'string' ? questionId : questionId?.toString?.();
    if (asObjectId) questionLookup.push({ _id: asObjectId });
    if (Number.isFinite(asNumber)) questionLookup.push({ _id: asNumber });
    if (asString) questionLookup.push({ _id: asString });
    const question = await questions.findOne(questionLookup.length ? { $or: questionLookup } : {});
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const normalized = normalizeScienceBowlQuestionText(question);
    if (!normalized || !question.answer) {
      return res.status(400).json({ error: 'Question missing text or answer' });
    }

    const doc = await upsertBuzzpoints({ questionId, question, force: !!force });
    res.json({
      questionId: doc.questionId,
      promptVersion: doc.promptVersion,
      model: doc.model,
      questionLength: doc.questionLength,
      predictions: doc.predictions
    });
  } catch (error) {
    console.error('AI buzz generate error', error);
    res.status(500).json({ error: 'Failed to generate buzzpoints', details: error.message });
  }
});

export default router;
