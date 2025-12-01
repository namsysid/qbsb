import { perTossupData } from '../account-info/collections.js';
import { questions } from './collections.js';
import { SBCATEGORIES } from '../../quizbowl/categories.js';

/**
 * Gets statistics for each Science Bowl subject for a given user
 * @param {ObjectId} userId - The user ID to get statistics for
 * @returns {Promise<Array>} Array of statistics objects with subject, total, correct, and wrong counts
 */
export default async function getSubjectStats(userId) {
  try {
    // First, get all Science Bowl question IDs and their subjects
    const scienceBowlQuestions = await questions.find({}, { projection: { _id: 1, subject: 1 } }).toArray();
    const questionIds = scienceBowlQuestions.map(q => q._id);
    const questionIdToSubject = new Map();
    scienceBowlQuestions.forEach(q => {
      // Store both string and original format for lookup
      const idStr = String(q._id);
      questionIdToSubject.set(idStr, q.subject);
      // Also store the original _id if it's different from the string representation
      if (idStr !== q._id) {
        questionIdToSubject.set(q._id, q.subject);
      }
    });

    if (questionIds.length === 0) {
      // No Science Bowl questions in database
      return SBCATEGORIES.map(subject => ({
        subject,
        total: 0,
        correct: 0,
        wrong: 0
      }));
    }

    // Get all user's tossup data for Science Bowl questions
    const userData = await perTossupData.aggregate([
      {
        $match: {
          _id: { $in: questionIds }
        }
      },
      { $unwind: '$data' },
      { $match: { 'data.user_id': userId } },
      {
        $project: {
          questionId: '$_id',
          isCorrect: '$data.isCorrect'
        }
      }
    ]).toArray();

    // Group by subject
    const statsMap = new Map();
    SBCATEGORIES.forEach(subject => {
      statsMap.set(subject, { total: 0, correct: 0, wrong: 0 });
    });

    userData.forEach(entry => {
      // Try both string and original format for lookup
      const questionIdStr = String(entry.questionId);
      const subject = questionIdToSubject.get(questionIdStr) || questionIdToSubject.get(entry.questionId);
      if (subject && statsMap.has(subject)) {
        const stat = statsMap.get(subject);
        stat.total += 1;
        if (entry.isCorrect) {
          stat.correct += 1;
        } else {
          stat.wrong += 1;
        }
      }
    });

    // Convert to array format
    const allStats = Array.from(statsMap.entries()).map(([subject, stats]) => ({
      subject,
      total: stats.total,
      correct: stats.correct,
      wrong: stats.wrong
    }));

    return allStats;
  } catch (error) {
    console.error('Error getting Science Bowl subject stats:', error);
    // Return empty stats for all subjects on error
    return SBCATEGORIES.map(subject => ({
      subject,
      total: 0,
      correct: 0,
      wrong: 0
    }));
  }
}

