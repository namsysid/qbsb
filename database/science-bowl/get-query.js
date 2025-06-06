import { questions } from './collections.js';
import { SBCATEGORIES } from '../../quizbowl/categories.js';

/**
 * Retrieves science bowl questions from the database based on a search query.
 * @param {object} options - The options for the question retrieval.
 * @param {string} options.queryString - The search query string.
 * @param {string[]} [options.subjects] - An array of subjects to filter by (must be valid SBCATEGORIES).
 * @param {string[]} [options.competitions] - An array of competitions to filter by.
 * @param {string[]} [options.years] - An array of years to filter by.
 * @param {boolean} [options.isMcq] - Filter by whether the question is multiple choice.
 * @param {boolean} [options.isTossup] - Filter by whether the question is a tossup.
 * @param {number} [options.maxReturnLength=50] - The maximum number of questions to return.
 * @param {boolean} [options.randomize=false] - Whether to randomize the order of the returned questions.
 * @param {boolean} [options.caseSensitive=false] - Whether the search should be case sensitive.
 * @returns {Promise<{count: number, questionArray: Array}>} The retrieved questions.
 */
async function getQuery(options = {}) {
  const {
    queryString = '',
    subjects,
    competitions,
    years,
    isMcq,
    isTossup,
    maxReturnLength = 50,
    randomize = false,
    caseSensitive = false
  } = options;

  const query = {};
  
  // Build text search query
  if (queryString) {
    const searchQuery = {
      $or: [
        { question: { $regex: queryString, $options: caseSensitive ? '' : 'i' } },
        { answer: { $regex: queryString, $options: caseSensitive ? '' : 'i' } }
      ]
    };
    Object.assign(query, searchQuery);
  }

  // Add filters
  if (subjects && subjects.length > 0) {
    // Validate subjects against SBCATEGORIES
    const validSubjects = subjects.filter(subject => SBCATEGORIES.includes(subject));
    if (validSubjects.length > 0) {
      query.subject = { $in: validSubjects };
    }
  }

  if (competitions && competitions.length > 0) {
    query.competition = { $in: competitions };
  }

  if (years && years.length > 0) {
    query.year = { $in: years };
  }

  // Add isMcq filter if specified
  if (typeof isMcq === 'boolean') {
    query.is_mcq = isMcq;
  }

  // Add isTossup filter if specified
  if (typeof isTossup === 'boolean') {
    query.isTossup = isTossup;
  }

  try {
    const aggregation = [
      { $match: query },
      { $sort: { year: -1, competition: 1 } }
    ];

    if (randomize) {
      aggregation.push({ $sample: { size: maxReturnLength } });
    } else {
      aggregation.push({ $limit: maxReturnLength });
    }

    const [questionArray, count] = await Promise.all([
      questions.aggregate(aggregation).toArray(),
      questions.countDocuments(query)
    ]);

    return { count, questionArray };
  } catch (error) {
    console.error('Error querying science bowl questions:', error);
    return { count: 0, questionArray: [] };
  }
}

export default getQuery; 