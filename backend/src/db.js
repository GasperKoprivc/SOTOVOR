import { MongoClient } from 'mongodb';

export async function connect() {
  const client = new MongoClient(process.env.SOTOVOR_MONGO_URI ||
    `mongodb://127.0.0.1:${process.env.SOTOVOR_MONGO_PORT || 27027}`, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    const db = client.db(process.env.SOTOVOR_DB || 'sotovor');
    const households = db.collection('households');
    const entries = db.collection('entries');
    const accounts = db.collection('accounts');
    const sessions = db.collection('sessions');
    const desktopLinks = db.collection('desktopLinks');
    const mobileSessions = db.collection('mobileSessions');
    const devices = db.collection('devices');
    const notifications = db.collection('notifications');
    await Promise.all([
      households.createIndex({ inviteCode: 1 }, { unique: true }),
      households.createIndex({ 'members.sessionHash': 1 }),
      households.createIndex({ 'members.accountId': 1 }, { unique: true, sparse: true }),
      households.createIndex({ 'members.guestAccountId': 1 }, { unique: true, sparse: true }),
      households.createIndex({ ownerAccountId: 1 }, { sparse: true }),
      accounts.createIndex({ email: 1 }, { unique: true }),
      accounts.createIndex({ 'emailVerification.hash': 1 }, { unique: true, sparse: true }),
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      desktopLinks.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      mobileSessions.createIndex({ accessHash: 1 }, { unique: true }),
      mobileSessions.createIndex({ refreshHash: 1 }, { unique: true }),
      mobileSessions.createIndex({ accountId: 1, lastUsedAt: -1 }),
      mobileSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      devices.createIndex({ token: 1 }, { unique: true }),
      devices.createIndex({ accountId: 1, sessionId: 1 }),
      devices.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      notifications.createIndex({ key: 1 }, { unique: true }),
      notifications.createIndex({ accountId: 1, householdId: 1, _id: -1 }),
      households.createIndex({ whatsappSender: 1 }, { unique: true, sparse: true }),
      entries.createIndex({ whatsappMessageId: 1 }, { unique: true, sparse: true }),
      entries.createIndex({ householdId: 1, dueOn: 1 }),
      entries.createIndex({ householdId: 1, kind: 1, archivedAt: 1, _id: -1 }),
      entries.createIndex({ householdId: 1, archivedAt: 1, createdAt: -1 }),
      entries.createIndex({ householdId: 1 }, {
        name: 'pending_occurrences',
        partialFilterExpression: { nextOccurrence: { $exists: true } },
      }),
    ]);
    return { client, households, entries, accounts, sessions, desktopLinks, mobileSessions, devices, notifications };
  } catch (error) {
    await client.close();
    throw error;
  }
}
