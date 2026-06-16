import { MongoClient } from 'mongodb';

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.hmromcl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
console.log('Database: Attempting to connect to MongoDB...');
export const mongoClient = new MongoClient(uri);

try {
  await mongoClient.connect();
  console.log('Database: Successfully connected to MongoDB');
  
  // Test the connection by listing all databases
  const dbs = await mongoClient.db().admin().listDatabases();
  console.log('Database: Available databases:', dbs.databases.map(db => db.name));
  
  // Test the science_bowl database specifically
  const scienceBowlDb = mongoClient.db('science_bowl');
  const collections = await scienceBowlDb.listCollections().toArray();
  console.log('Database: Collections in science_bowl:', collections.map(c => c.name));
  
  // Test the questions collection
  const questions = scienceBowlDb.collection('questions');
  const count = await questions.countDocuments();
  console.log('Database: Number of questions in science_bowl.questions:', count);
} catch (error) {
  console.error('Database: Error connecting to MongoDB:', error);
  throw error;
}

export const qbreader = mongoClient.db('qbreader');
export const accountInfo = mongoClient.db('account-info');
export const geoword = mongoClient.db('geoword');
export const scienceBowl = mongoClient.db('science_bowl');
export const steamcoach = mongoClient.db('steamcoach');
