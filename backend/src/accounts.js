import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
export const emailPattern = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/u;
export const sessionSeconds = 90 * 24 * 60 * 60;

export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt] = stored.split(':');
  return timingSafeEqual(Buffer.from(await passwordHash(password, salt)), Buffer.from(stored));
}

export function publicProfile({ firstName, lastName, email, phone, appearance }) {
  return { firstName, lastName, email, phone, ...(appearance ? { appearance } : {}) };
}
