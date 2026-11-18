import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { validId } from './mobile-auth.js';

export function createShoppingList({ shoppingItems, accounts }, notify = async () => {}) {
  const listeners = new Map();
  function changed(household, actor) {
    const id = String(household._id);
    for (const send of listeners.get(id) ?? []) send();
    void notify(household, actor).catch(() => console.error('Shopping push delivery failed.'));
  }

  async function add(household, { title, quantity = '', whatsappMessageId }, actor) {
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 120 ||
        typeof quantity !== 'string' || quantity.trim().length > 40) {
      throw new HttpError(400, 'Vnesi naziv do 120 znakov in količino do 40 znakov.');
    }
    const item = { _id: new ObjectId(), householdId: household._id, title: title.trim(),
      quantity: quantity.trim(), checkedAt: null, checkedBy: null };
    if (whatsappMessageId) {
      const result = await shoppingItems.updateOne({ whatsappMessageId }, {
        $setOnInsert: { ...item, whatsappMessageId },
      }, { upsert: true });
      if (!result.upsertedCount) return;
    } else {
      await shoppingItems.insertOne(item);
    }
    changed(household, actor);
    return item;
  }

  function serialize(item, household) {
    const member = household.members.find(member => member.id === item.checkedBy);
    return { id: String(item._id), title: item.title, quantity: item.quantity,
      checkedAt: item.checkedAt, checkedByName: item.checkedBy ? member?.name ?? 'Nekdanji član' : null };
  }

  function register(router) {
    router.get('/shopping/push', (req, res) => {
      res.json({ enabled: req.account?.shoppingPush === true });
    });
    router.put('/shopping/push', async (req, res) => {
      if (!req.account) throw new HttpError(401, 'Najprej se prijavi.');
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') throw new HttpError(400, 'Izberi nastavitev obvestil.');
      await accounts.updateOne({ _id: req.account._id }, { $set: { shoppingPush: enabled } });
      res.json({ enabled });
    });
    router.get('/shopping', async (req, res) => {
      const items = await shoppingItems.find({ householdId: req.household._id, deletedAt: null })
        .sort({ checkedAt: 1, _id: -1 }).toArray();
      res.json(items.map(item => serialize(item, req.household)));
    });
    router.post('/shopping', async (req, res) => {
      const item = await add(req.household, { title: req.body.title, quantity: req.body.quantity }, req.member.id);
      res.status(201).json(serialize(item, req.household));
    });
    router.put('/shopping/:id', async (req, res) => {
      if (typeof req.body.checked !== 'boolean') throw new HttpError(400, 'Izberi stanje nakupa.');
      const filter = itemFilter(req);
      const checked = req.body.checked;
      const item = await shoppingItems.findOneAndUpdate({
        ...filter, checkedAt: checked ? null : { $ne: null },
      }, { $set: { checkedAt: checked ? new Date() : null, checkedBy: checked ? req.member.id : null } },
      { returnDocument: 'after' });
      const current = item ?? await shoppingItems.findOne(filter);
      if (!current) throw new HttpError(404, 'Izdelka ni na seznamu.');
      if (item) changed(req.household, req.member.id);
      res.json(serialize(current, req.household));
    });
    router.delete('/shopping/:id', async (req, res) => {
      const { matchedCount } = await shoppingItems.updateOne(itemFilter(req), {
        $set: { deletedAt: new Date() }, $unset: { title: '', quantity: '', checkedBy: '', checkedAt: '' },
      });
      if (!matchedCount) throw new HttpError(404, 'Izdelka ni na seznamu.');
      changed(req.household, req.member.id);
      res.json({ ok: true });
    });
    router.get('/shopping/stream', (req, res) => {
      const key = String(req.household._id);
      const subscribers = listeners.get(key) ?? new Set();
      if (subscribers.size >= 100) throw new HttpError(429, 'Preveč odprtih povezav.');
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform' });
      const send = () => {
        if (res.writableNeedDrain) res.end();
        else res.write('event: refresh\ndata: {}\n\n');
      };
      subscribers.add(send);
      listeners.set(key, subscribers);
      const heartbeat = setInterval(() => {
        if (res.writableNeedDrain) res.end();
        else res.write(': heartbeat\n\n');
      }, 15_000);
      // Reconnect periodically to recheck session and family membership.
      const reconnect = setTimeout(() => res.end(), 60_000);
      res.once('close', () => {
        clearInterval(heartbeat);
        clearTimeout(reconnect);
        subscribers.delete(send);
        if (!subscribers.size) listeners.delete(key);
      });
      send();
    });
  }
  return { add, register };
}

function itemFilter(req) {
  if (!validId(req.params.id)) throw new HttpError(404, 'Izdelka ni na seznamu.');
  return { _id: new ObjectId(req.params.id), householdId: req.household._id, deletedAt: null };
}
