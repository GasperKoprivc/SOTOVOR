import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { validId } from './mobile-auth.js';

export async function pageOf(collection, condition, query, { projection, map = item => item } = {}) {
  const limit = query.limit === undefined ? 30 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      (query.cursor !== undefined && !validId(query.cursor))) {
    throw new HttpError(400, 'Omejitev naj bo od 1 do 100, kazalec pa veljaven.');
  }
  const items = await collection.find({
    ...condition, ...(query.cursor ? { _id: { $lt: new ObjectId(query.cursor) } } : {}),
  }, { projection }).sort({ _id: -1 }).limit(limit + 1).toArray();
  const nextCursor = items.length > limit ? String(items[limit - 1]._id) : null;
  return { items: items.slice(0, limit).map(map), nextCursor };
}
