import { formatScienceBowlStats, getScienceBowlStatsForUser } from '../../../database/science-bowl/stats.js';
import { SBCATEGORIES } from '../../../quizbowl/categories.js';
import { checkSteamcoachToken } from '../../../server/steamcoach/authentication.js';

import { Router } from 'express';

const router = Router();

function ensureSessionStats(session) {
  if (!session.scienceBowlStats) {
    session.scienceBowlStats = {};
  }

  for (const subject of SBCATEGORIES) {
    if (!session.scienceBowlStats[subject]) {
      session.scienceBowlStats[subject] = { total: 0, correct: 0, wrong: 0, sped: 0, negs: 0 };
    } else {
      const stat = session.scienceBowlStats[subject];
      stat.total = stat.total ?? 0;
      stat.correct = stat.correct ?? 0;
      stat.wrong = stat.wrong ?? 0;
      stat.sped = stat.sped ?? 0;
      stat.negs = stat.negs ?? 0;
    }
  }

  return session.scienceBowlStats;
}

function formatSessionStats(session) {
  const stats = ensureSessionStats(session);
  return formatScienceBowlStats(stats);
}

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { steamcoachUserId, steamcoachToken } = req.session ?? {};
  const hasValidSession = checkSteamcoachToken(steamcoachUserId, steamcoachToken);

  try {
    if (hasValidSession) {
      const stats = await getScienceBowlStatsForUser(steamcoachUserId);
      res.json({ source: 'account', stats });
      return;
    }
  } catch (error) {
    console.error('Error getting Science Bowl subject stats:', error);
  }

  const sessionStats = formatSessionStats(req.session);
  res.json({ source: 'session', stats: sessionStats });
});

export default router;
