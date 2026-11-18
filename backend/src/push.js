import { hash } from './mobile-auth.js';
import { readFile } from 'node:fs/promises';

const titles = {
  shopping: 'Nakupovalni seznam je posodobljen',
  assignment: 'Novo opravilo', deadline: 'Bliža se rok', overdue: 'Rok je potekel', swap: 'Išče se zamenjava', member_joined: 'Nov družinski član',
};
const englishTitles = {
  shopping: 'Shopping list updated',
  assignment: 'New assignment', deadline: 'Deadline approaching', overdue: 'Task overdue', swap: 'Swap requested', member_joined: 'New family member',
};
const unregistered = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

export function pushDelivery({ accounts, devices, mobileSessions }, send, onError = () => console.error('Push delivery failed.')) {
  const delivery = {
    async shopping(household, actor) {
      if (!send) return;
      const ids = household.members.filter(member => !member.inactive && member.id !== actor)
        .map(member => member.accountId ?? member.guestAccountId).filter(Boolean);
      const people = accounts.find({ _id: { $in: ids }, shoppingPush: true, deletionFamilyIds: { $exists: false } },
        { projection: { passwordHash: 1 } });
      for await (const person of people) await delivery.send(person._id, hash(person.passwordHash), {
        type: 'shopping', target: { screen: 'shopping', householdId: String(household._id) },
      });
    },
    async send(accountId, credential, { type, target }) {
      if (!send) return;
      const now = new Date();
      const active = await mobileSessions.find({ accountId, credential, expiresAt: { $gt: now } }, { projection: { _id: 1 } }).toArray();
      if (!active.length) return;
      for await (const device of devices.find({ accountId, sessionId: { $in: active.map(session => session._id) }, expiresAt: { $gt: now } })) {
        try {
          const path = new URLSearchParams({ householdId: target.householdId, ...(target.entryId ? { entryId: target.entryId } : {}) });
          const labels = device.locale.startsWith('sl') ? titles : englishTitles;
          await send({
            token: device.token,
            notification: { title: 'Sotovor', body: labels[type] },
            data: { type, deepLink: 'sotovor://' + target.screen + '?' + path },
            android: { notification: { channelId: type === 'shopping' ? 'shopping' : type === 'swap' ? 'swaps' : ['deadline', 'overdue'].includes(type) ? 'reminders' : 'assignments' } },
          });
        } catch (error) {
          if (unregistered.has(error.code)) await devices.deleteOne({ _id: device._id, token: device.token, updatedAt: device.updatedAt });
          else onError();
        }
      }
    },
  };
  return delivery;
}

export async function configurePush(database, env = process.env) {
  const inline = env.SOTOVOR_FCM_SERVICE_ACCOUNT_JSON;
  const file = env.SOTOVOR_FCM_SERVICE_ACCOUNT_FILE;
  if (!inline && !file) {
    console.log('FCM disabled. Notifications remain available in Sotovor.');
    return pushDelivery(database);
  }
  try {
    const { cert, initializeApp } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const config = JSON.parse(inline || await readFile(file, 'utf8'));
    const messaging = getMessaging(initializeApp({ credential: cert(config) }, 'sotovor-push'));
    return pushDelivery(database, message => messaging.send(message));
  } catch {
    throw new Error('Neveljavna nastavitev poverilnic Firebase.');
  }
}
