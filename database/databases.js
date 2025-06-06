import { MongoClient } from 'mongodb';

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.hmromcl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
export const mongoClient = new MongoClient(uri);

await mongoClient.connect();
console.log('connected to mongodb');

export const qbreader = mongoClient.db('qbreader');
export const accountInfo = mongoClient.db('account-info');
export const geoword = mongoClient.db('geoword');
export const scienceBowl = mongoClient.db('science_bowl');
