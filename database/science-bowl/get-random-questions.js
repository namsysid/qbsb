import { questions } from './collections.js';
import { SBCATEGORIES } from '../../quizbowl/categories.js';

/**
 * Get an array of random science bowl questions. This method is optimized for random selection.
 * @param {Object} object - an object containing the parameters
 * @param {string[]} [object.subjects] - an array of allowed subjects. Pass a 0-length array, null, or undefined to select any subject.
 * @param {string[]} [object.competitions] - an array of allowed competitions. Pass a 0-length array, null, or undefined to select any competition.
 * @param {string[]} [object.years] - an array of allowed years. Pass a 0-length array, null, or undefined to select any year.
 * @param {boolean} [object.isMcq] - filter by whether the question is multiple choice
 * @param {boolean} [object.isTossup] - filter by whether the question is a tossup
 * @param {number} [object.number=1] - how many random questions to return. Default: 1.
 * @returns {Promise<Array>} Array of random questions
 */
async function getRandomQuestions({
  subjects = SBCATEGORIES,
  competitions = [],
  years = [],
  isMcq,
  isTossup,
  number = 1
} = {}) {
  const aggregation = [
    { $match: {} },
    { $sample: { size: number } }
  ];

  if (subjects?.length) {
    aggregation[0].$match.subject = { $in: subjects };
  }

  if (competitions?.length) {
    aggregation[0].$match.competition = { $in: competitions };
  }

  if (years?.length) {
    aggregation[0].$match.year = { $in: years };
  }

  if (typeof isMcq === 'boolean') {
    aggregation[0].$match.is_mcq = isMcq;
  }

  if (typeof isTossup === 'boolean') {
    aggregation[0].$match.isTossup = isTossup;
  }

  return await questions.aggregate(aggregation).toArray();
}

export default getRandomQuestions; 