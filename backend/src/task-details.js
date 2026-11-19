import { ObjectId } from 'mongodb';
import { HttpError } from './api-errors.js';
import { validId } from './mobile-auth.js';

const nameOf = (household, id) =>
  household.members.find((member) => member.id === id)?.name ?? 'Nekdanji član';
const publicState = (task, household) => ({
  checklist: (task.checklist ?? []).map(({ _id, ...item }) => ({ id: String(_id), ...item })),
  comments: (task.comments ?? []).map(({ _id, authorId, ...comment }) => ({
    id: String(_id),
    authorName: nameOf(household, authorId),
    ...comment,
  })),
});

export function registerTaskDetails(router, { entries }, commentNotice) {
  const projection = { checklist: 1, comments: 1 };
  const scope = (req) => {
    if (!validId(req.params.id)) throw new HttpError(404, 'Opravilo ne obstaja.');
    return {
      _id: new ObjectId(req.params.id),
      householdId: req.household._id,
      kind: 'task',
      archivedAt: null,
    };
  };
  const text = (value, max) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      throw new HttpError(400, 'Besedilo je prazno ali predolgo.');
    }
    return value.trim();
  };

  router.get('/tasks/:id/details', async (req, res) => {
    const task = await entries.findOne(scope(req), { projection });
    if (!task) throw new HttpError(404, 'Opravilo ne obstaja.');
    res.json(publicState(task, req.household));
  });

  for (const [list, limit] of [
    ['checklist', 50],
    ['comments', 100],
  ]) {
    router.post('/tasks/:id/' + list, async (req, res) => {
      const filter = scope(req);
      const item =
        list === 'checklist'
          ? { _id: new ObjectId(), title: text(req.body.title, 160), checked: false }
          : {
              _id: new ObjectId(),
              text: text(req.body.text, 500),
              authorId: req.member.id,
              createdAt: new Date(),
            };
      const task = await entries.findOneAndUpdate(
        {
          ...filter,
          [list + '.' + (limit - 1)]: { $exists: false },
          ...(list === 'checklist' ? { completedAt: null } : {}),
        },
        { $push: { [list]: item } },
        { projection, returnDocument: 'after' },
      );
      if (!task) {
        if (!(await entries.findOne(filter, { projection: { _id: 1 } })))
          throw new HttpError(404, 'Opravilo ne obstaja.');
        throw new HttpError(409, 'Seznam je poln ali je opravilo zaključeno.');
      }
      if (list === 'comments' && commentNotice) {
        await commentNotice(req.household, req.member.id, filter._id, item).catch(() =>
          console.error('Comment notification failed.'),
        );
      }
      res.status(201).json(publicState(task, req.household));
    });
  }

  router.put('/tasks/:id/checklist/:item', async (req, res) => {
    if (!validId(req.params.item)) throw new HttpError(404, 'Podopravilo ne obstaja.');
    if (typeof req.body.checked !== 'boolean') throw new HttpError(400, 'Izberi stanje podopravila.');
    const task = await entries.findOneAndUpdate(
      {
        ...scope(req),
        completedAt: null,
        'checklist._id': new ObjectId(req.params.item),
      },
      { $set: { 'checklist.$.checked': req.body.checked } },
      { projection, returnDocument: 'after' },
    );
    if (!task) throw new HttpError(404, 'Podopravilo ne obstaja.');
    res.json(publicState(task, req.household));
  });
}
