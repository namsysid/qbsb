import express from 'express';
import {
  formatScienceBowlStats,
  getScienceBowlStatsForUser,
  incrementScienceBowlStatsForUser,
  replaceScienceBowlStatsForUser
} from '../../../database/science-bowl/stats.js';
import { SBCATEGORIES } from '../../../quizbowl/categories.js';
import { checkSteamcoachToken } from '../../../server/steamcoach/authentication.js';

const router = express.Router();

function ensureSessionStats(session) {
  if (!session.scienceBowlStats) {
    session.scienceBowlStats = {};
  }

  for (const subject of SBCATEGORIES) {
    if (!session.scienceBowlStats[subject]) {
      session.scienceBowlStats[subject] = { total: 0, correct: 0, wrong: 0, sped: 0, negs: 0 };
    } else {
      const current = session.scienceBowlStats[subject];
      current.total = current.total ?? 0;
      current.correct = current.correct ?? 0;
      current.wrong = current.wrong ?? 0;
      current.sped = current.sped ?? 0;
      current.negs = current.negs ?? 0;
    }
  }

  return session.scienceBowlStats;
}

function formatStats(sessionStats) {
  return formatScienceBowlStats(sessionStats);
}

function getSteamcoachSession(req) {
  const { steamcoachUserId, steamcoachToken, username } = req.session ?? {};
  if (checkSteamcoachToken(steamcoachUserId, steamcoachToken)) {
    return { steamcoachUserId, username };
  }
  return null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') { return value; }
  if (typeof value === 'number') { return value !== 0; }
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    return lowered === 'true' || lowered === '1';
  }
  return false;
}

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const steamcoachSession = getSteamcoachSession(req);
  if (steamcoachSession) {
    const stats = await getScienceBowlStatsForUser(steamcoachSession.steamcoachUserId);
    res.json({ source: 'account', stats });
    return;
  }

  const stats = ensureSessionStats(req.session);
  res.json({ source: 'session', stats: formatStats(stats) });
});

router.post('/', async (req, res) => {
  const { subject, isCorrect, adjustment, wasNeg, shouldSped } = req.body ?? {};
  const normalizedSubject = typeof subject === 'string' ? subject.toUpperCase() : null;
  const isTossup = parseBoolean(req.body?.isTossup);
  const buzzedEarly = parseBoolean(req.body?.buzzedEarly);
  const adjustmentWasNeg = parseBoolean(wasNeg);
  const adjustmentShouldSped = parseBoolean(shouldSped);
  console.log('[Science Bowl Session Stats] POST received', { subject, normalizedSubject, isCorrect, adjustment, sessionId: req.sessionID });
  if (!normalizedSubject || !SBCATEGORIES.includes(normalizedSubject)) {
    console.warn('[Science Bowl Session Stats] Rejecting invalid subject', { subject, normalizedSubject });
    return res.status(400).json({ error: 'Invalid subject' });
  }

  const steamcoachSession = getSteamcoachSession(req);
  if (steamcoachSession) {
    const correct = (isCorrect === true) || (isCorrect === 'true') || (isCorrect === 1) || (isCorrect === '1');
    const increments = adjustment === 'wrong-to-correct'
      ? {
          correct: 1,
          wrong: -1,
          sped: adjustmentShouldSped ? 1 : 0,
          negs: adjustmentWasNeg ? -1 : 0
        }
      : {
          total: 1,
          correct: correct ? 1 : 0,
          wrong: correct ? 0 : 1,
          sped: isTossup && buzzedEarly && correct ? 1 : 0,
          negs: isTossup && buzzedEarly && !correct ? 1 : 0
        };

    const formatted = await incrementScienceBowlStatsForUser(
      steamcoachSession.steamcoachUserId,
      normalizedSubject,
      increments,
      { username: steamcoachSession.username }
    );
    res.json({ source: 'account', stats: formatted });
    return;
  }

  const stats = ensureSessionStats(req.session);
  const subjectStats = stats[normalizedSubject];

  if (adjustment === 'wrong-to-correct') {
    if (subjectStats.wrong > 0) {
      subjectStats.wrong -= 1;
    }
    subjectStats.correct += 1;
    if (adjustmentWasNeg && subjectStats.negs > 0) {
      subjectStats.negs -= 1;
    }
    if (adjustmentShouldSped) {
      subjectStats.sped += 1;
    }
    const formattedAdjustment = formatStats(stats);
    console.log('[Science Bowl Session Stats] Applied wrong-to-correct adjustment', { subject: normalizedSubject, subjectStats });
    return res.json({ source: 'session', stats: formattedAdjustment });
  }

  const correct = (isCorrect === true) || (isCorrect === 'true') || (isCorrect === 1) || (isCorrect === '1');

  subjectStats.total += 1;
  if (correct) {
    subjectStats.correct += 1;
  } else {
    subjectStats.wrong += 1;
  }
  if (isTossup && buzzedEarly) {
    if (correct) {
      subjectStats.sped += 1;
    } else {
      subjectStats.negs += 1;
    }
  }

  const formatted = formatStats(stats);
  console.log('[Science Bowl Session Stats] Updated stats', { subject: normalizedSubject, subjectStats, formatted });
  res.json({ source: 'session', stats: formatted });
});

router.delete('/', async (req, res) => {
  const steamcoachSession = getSteamcoachSession(req);
  if (steamcoachSession) {
    const stats = await replaceScienceBowlStatsForUser(
      steamcoachSession.steamcoachUserId,
      {},
      { username: steamcoachSession.username }
    );
    req.session.scienceBowlStats = {};
    res.json({ source: 'account', stats });
    return;
  }

  req.session.scienceBowlStats = {};
  const stats = ensureSessionStats(req.session);
  res.json({ source: 'session', stats: formatScienceBowlStats(stats) });
});

export default router;
