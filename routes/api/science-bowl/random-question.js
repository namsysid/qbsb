import getRandomQuestions from '../../../database/science-bowl/get-random-questions.js';
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  // Parse array parameters
  if (req.query.subjects) {
    req.query.subjects = req.query.subjects.split(',');
    req.query.subjects = req.query.subjects.length ? req.query.subjects : undefined;
  }

  if (req.query.competitions) {
    req.query.competitions = req.query.competitions.split(',');
    req.query.competitions = req.query.competitions.length ? req.query.competitions : undefined;
  }

  if (req.query.years) {
    req.query.years = req.query.years.split(',');
    req.query.years = req.query.years.length ? req.query.years : undefined;
  }

  // Parse numeric parameters
  req.query.number = isNaN(req.query.number) ? undefined : parseInt(req.query.number);

  // Parse boolean parameters
  req.query.isMcq = (req.query.isMcq === 'true');
  req.query.isTossup = (req.query.isTossup === 'true');

  const questions = await getRandomQuestions(req.query);

  if (questions.length === 0) {
    res.status(404);
  }

  res.json({ questions });
});

export default router; 