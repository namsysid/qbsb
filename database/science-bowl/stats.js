import { SBCATEGORIES } from '../../quizbowl/categories.js';
import { stats } from './collections.js';

const STAT_FIELDS = ['total', 'correct', 'wrong', 'sped', 'negs'];
const emptySubjectStats = () => ({ total: 0, correct: 0, wrong: 0, sped: 0, negs: 0 });

function normalizeCount (value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildTotalStats (subjectStats) {
  const total = emptySubjectStats();
  for (const subject of SBCATEGORIES) {
    for (const field of STAT_FIELDS) {
      total[field] += subjectStats[subject]?.[field] ?? 0;
    }
  }
  return total;
}

export function normalizeScienceBowlStats (subjectStats = {}) {
  const normalized = {};
  for (const subject of SBCATEGORIES) {
    const stat = subjectStats[subject] || {};
    normalized[subject] = {
      total: normalizeCount(stat.total),
      correct: normalizeCount(stat.correct),
      wrong: normalizeCount(stat.wrong),
      sped: normalizeCount(stat.sped),
      negs: normalizeCount(stat.negs)
    };
  }
  normalized.TOTAL = buildTotalStats(normalized);
  return normalized;
}

export function formatScienceBowlStats (subjectStats = {}) {
  const normalized = normalizeScienceBowlStats(subjectStats);
  return [...SBCATEGORIES, 'TOTAL'].map(subject => ({ subject, ...normalized[subject] }));
}

export async function getLatestScienceBowlStatsSnapshot (steamcoachUserId) {
  return await stats
    .find({ steamcoachUserId: String(steamcoachUserId) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .next();
}

export async function getScienceBowlStatsForUser (steamcoachUserId) {
  const document = await getLatestScienceBowlStatsSnapshot(steamcoachUserId);
  return formatScienceBowlStats(document?.scienceBowlStats);
}

async function insertScienceBowlStatsSnapshot (steamcoachUserId, subjectStats, user = {}) {
  const steamcoachUserIdString = String(steamcoachUserId);
  const username = user.username ?? user.steamcoachUsername ?? null;
  const document = {
    steamcoachUserId: steamcoachUserIdString,
    username,
    user: {
      steamcoachUserId: steamcoachUserIdString,
      username
    },
    scienceBowlStats: normalizeScienceBowlStats(subjectStats),
    createdAt: new Date()
  };

  await stats.insertOne(document);
  return formatScienceBowlStats(document.scienceBowlStats);
}

export async function incrementScienceBowlStatsForUser (steamcoachUserId, subject, increments, user = {}) {
  const normalizedSubject = typeof subject === 'string' ? subject.toUpperCase() : null;
  if (!SBCATEGORIES.includes(normalizedSubject)) {
    throw new Error('Invalid subject');
  }

  const latest = await getLatestScienceBowlStatsSnapshot(steamcoachUserId);
  const nextStats = normalizeScienceBowlStats(latest?.scienceBowlStats);
  for (const field of STAT_FIELDS) {
    nextStats[normalizedSubject][field] = normalizeCount(
      nextStats[normalizedSubject][field] + (increments[field] ?? 0)
    );
  }

  return await insertScienceBowlStatsSnapshot(steamcoachUserId, nextStats, user);
}

export async function replaceScienceBowlStatsForUser (steamcoachUserId, subjectStats = {}, user = {}) {
  return await insertScienceBowlStatsSnapshot(steamcoachUserId, subjectStats, user);
}

export async function mergeScienceBowlStatsForUser (steamcoachUserId, subjectStats = {}, user = {}) {
  const latest = await getLatestScienceBowlStatsSnapshot(steamcoachUserId);
  const nextStats = normalizeScienceBowlStats(latest?.scienceBowlStats);
  const normalizedStatsToMerge = normalizeScienceBowlStats(subjectStats);

  for (const subject of SBCATEGORIES) {
    for (const field of STAT_FIELDS) {
      nextStats[subject][field] = normalizeCount(nextStats[subject][field] + normalizedStatsToMerge[subject][field]);
    }
  }

  return await insertScienceBowlStatsSnapshot(steamcoachUserId, nextStats, user);
}
