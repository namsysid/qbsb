import getQuery from '../../../database/science-bowl/get-query.js';
import { SBCATEGORIES } from '../../../quizbowl/categories.js';
import { Router } from 'express';

const router = Router();

/**
 * Validates the parameters for the science bowl query API endpoint.
 * @param {object} params - The parameters to validate
 * @returns {object|null} The validated parameters or null if validation fails
 */
function validateParams(params) {
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
  } = params;

  // Validate maxReturnLength
  const parsedMaxReturnLength = parseInt(maxReturnLength);
  if (isNaN(parsedMaxReturnLength) || parsedMaxReturnLength < 1) {
    return null;
  }

  // Validate arrays
  if (subjects && !Array.isArray(subjects)) return null;
  if (competitions && !Array.isArray(competitions)) return null;
  if (years && !Array.isArray(years)) return null;

  // Validate subjects against SBCATEGORIES
  if (subjects && subjects.some(subject => !SBCATEGORIES.includes(subject))) {
    return null;
  }

  // Validate isMcq
  if (isMcq !== undefined && isMcq !== 'true' && isMcq !== 'false') {
    return null;
  }

  // Validate isTossup
  if (isTossup !== undefined && isTossup !== 'true' && isTossup !== 'false') {
    return null;
  }

  // Validate boolean parameters
  if (typeof randomize !== 'boolean') return null;
  if (typeof caseSensitive !== 'boolean') return null;

  return {
    queryString,
    subjects,
    competitions,
    years,
    isMcq: isMcq === 'true',
    isTossup: isTossup === 'true',
    maxReturnLength: parsedMaxReturnLength,
    randomize,
    caseSensitive
  };
}

router.get('/', async (req, res) => {
  const params = validateParams(req.query);
  if (!params) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  try {
    const result = await getQuery(params);
    res.json(result);
  } catch (error) {
    console.error('Error in science bowl query:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 