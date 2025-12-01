import getUserId from '../../../database/account-info/get-user-id.js';
import getSubjectStats from '../../../database/science-bowl/get-subject-stats.js';
import { SBCATEGORIES } from '../../../quizbowl/categories.js';
import { checkToken } from '../../../server/authentication.js';

import { Router } from 'express';

const router = Router();

function ensureSessionStats(session) {
  if (!session.scienceBowlStats) {
    session.scienceBowlStats = {};
  }

  for (const subject of SBCATEGORIES) {
    if (!session.scienceBowlStats[subject]) {
      session.scienceBowlStats[subject] = { total: 0, correct: 0, wrong: 0 };
    } else {
      const stat = session.scienceBowlStats[subject];
      stat.total = stat.total ?? 0;
      stat.correct = stat.correct ?? 0;
      stat.wrong = stat.wrong ?? 0;
    }
  }

  return session.scienceBowlStats;
}

function formatSessionStats(session) {
  const stats = ensureSessionStats(session);
  return SBCATEGORIES.map(subject => {
    const { total = 0, correct = 0, wrong = 0 } = stats[subject] || {};
    return { subject, total, correct, wrong };
  });
}

router.get('/', async (req, res) => {
  const { username, token } = req.session ?? {};
  const hasValidSession = checkToken(username, token) && checkToken(username, token, true);

  try {
    if (hasValidSession) {
      const userId = await getUserId(username);
      if (userId) {
        const stats = await getSubjectStats(userId);
        res.json({ source: 'account', stats });
        return;
      }
    }
  } catch (error) {
    console.error('Error getting Science Bowl subject stats:', error);
  }

  const sessionStats = formatSessionStats(req.session);
  res.json({ source: 'session', stats: sessionStats });
});

export default router;
