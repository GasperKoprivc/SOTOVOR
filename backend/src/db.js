import { MongoClient } from 'mongodb';

export async function connect() {
  const client = new MongoClient(process.env.SOTOVOR_MONGO_URI || 'mongodb://127.0.0.1:27027', {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    const db = client.db(process.env.SOTOVOR_DB || 'sotovor');
    const households = db.collection('households');
    const entries = db.collection('entries');
    await Promise.all([
      households.createIndex({ inviteCode: 1 }, { unique: true }),
      households.createIndex({ 'members.sessionHash': 1 }),
      households.createIndex({ whatsappSender: 1 }, { unique: true, sparse: true }),
      entries.createIndex({ whatsappMessageId: 1 }, { unique: true, sparse: true }),
      entries.createIndex({ householdId: 1, dueOn: 1 }),
    ]);
    return { client, households, entries };
  } catch (error) {
    await client.close();
    throw error;
  }
}
