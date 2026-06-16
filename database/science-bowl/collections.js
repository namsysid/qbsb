import { scienceBowl } from '../databases.js';

const questions = scienceBowl.collection('questions');
const stats = scienceBowl.collection('stats');

stats.createIndex({ steamcoachUserId: 1, createdAt: -1 }).catch(error => {
  console.error('Database: Failed to create science_bowl.stats index:', error);
});

export {
  questions,
  stats
}; 
