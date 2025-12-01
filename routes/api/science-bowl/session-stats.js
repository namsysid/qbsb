import express from 'express';
import { SBCATEGORIES } from '../../../quizbowl/categories.js';

const router = express.Router();

function ensureSessionStats(session) {
  if (!session.scienceBowlStats) {
    session.scienceBowlStats = {};
  }

  for (const subject of SBCATEGORIES) {
    if (!session.scienceBowlStats[subject]) {
      session.scienceBowlStats[subject] = { total: 0, correct: 0, wrong: 0 };
    } else {
      const current = session.scienceBowlStats[subject];
      current.total = current.total ?? 0;
      current.correct = current.correct ?? 0;
      current.wrong = current.wrong ?? 0;
    }
  }

  return session.scienceBowlStats;
}

function formatStats(sessionStats) {
  return SBCATEGORIES.map((subject) => {
    const { total = 0, correct = 0, wrong = 0 } = sessionStats[subject] || {};
    return { subject, total, correct, wrong };
  });
}

router.get('/', (req, res) => {
  const stats = ensureSessionStats(req.session);
  res.json({ stats: formatStats(stats) });
});

router.post('/', (req, res) => {
  const { subject, isCorrect, adjustment } = req.body ?? {};
  const normalizedSubject = typeof subject === 'string' ? subject.toUpperCase() : null;
  console.log('[Science Bowl Session Stats] POST received', { subject, normalizedSubject, isCorrect, adjustment, sessionId: req.sessionID });
  if (!normalizedSubject || !SBCATEGORIES.includes(normalizedSubject)) {
    console.warn('[Science Bowl Session Stats] Rejecting invalid subject', { subject, normalizedSubject });
    return res.status(400).json({ error: 'Invalid subject' });
  }

  const stats = ensureSessionStats(req.session);
  const subjectStats = stats[normalizedSubject];

  if (adjustment === 'wrong-to-correct') {
    if (subjectStats.wrong > 0) {
      subjectStats.wrong -= 1;
    }
    subjectStats.correct += 1;
    const formattedAdjustment = formatStats(stats);
    console.log('[Science Bowl Session Stats] Applied wrong-to-correct adjustment', { subject: normalizedSubject, subjectStats });
    return res.json({ stats: formattedAdjustment });
  }

  const correct = (isCorrect === true) || (isCorrect === 'true') || (isCorrect === 1) || (isCorrect === '1');

  subjectStats.total += 1;
  if (correct) {
    subjectStats.correct += 1;
  } else {
    subjectStats.wrong += 1;
  }

  const formatted = formatStats(stats);
  console.log('[Science Bowl Session Stats] Updated stats', { subject: normalizedSubject, subjectStats, formatted });
  res.json({ stats: formatted });
});

export default router;
