import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ObjectId } from 'mongodb';
import { passwordHash } from '../backend/src/accounts.js';
import { connect } from '../backend/src/db.js';

if (existsSync('.env')) process.loadEnvFile();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const month = process.argv[2] ?? today.slice(0, 7);
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Uporabi obliko LLLL-MM.');
const [year, monthNumber] = month.split('-').map(Number);
const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
const demoId = label => new ObjectId(createHash('sha256').update('sotovor-demo/' + label).digest('hex').slice(0, 24));
const seedId = 'druzina-novak';
const group = demoId(seedId);
const people = [
  ['Ana', 'Novak', 'ana'], ['Matej', 'Novak', 'matej'], ['Luka', 'Novak', 'luka'], ['Ema', 'Novak', 'ema'],
];
const members = people.map(([first, last, alias]) => ({
  id: demoId('member/' + alias).toHexString(), name: `${first} ${last}`,
  accountId: demoId('account/' + alias),
  permissions: { create: true, edit: alias === 'matej', move: alias === 'matej' || alias === 'luka', remove: false },
}));
const tasks = [
  ['dom', ['Pospravi kuhinjo po zajtrku', 'Izprazni pomivalni stroj', 'Pripravi mizo za večerjo', 'Loči in odnesi odpadke']],
  ['druzina', ['Preveri sporočila iz šole', 'Pripravi šolsko torbo', 'Preveri urnik za jutri', 'Pripravi malico za pot']],
  ['opravki', ['Preveri zalogo sadja in mleka', 'Dopolni nakupovalni seznam', 'Pripravi stvari za prevzem', 'Preveri domačo zalogo']],
  ['zdravje', ['Pripravi steklenice z vodo', 'Pojdi na družinski sprehod', 'Pripravi opremo za vadbo', 'Načrtuj čas za gibanje']],
  ['dom', ['Zloži čisto perilo', 'Pospravi dnevno sobo', 'Zalij sobne rastline', 'Pospravi predsobo']],
  ['druzina', ['Dogovori se za prevzem iz šole', 'Izberi idejo za večerjo', 'Preveri načrt za vikend', 'Pripravi družabno igro']],
  ['drugo', ['Preveri opravila za naslednji dan', 'Napolni skupne naprave', 'Dopolni tedenski načrt', 'Zapiši, kaj še manjka']],
];

mkdirSync('data', { recursive: true });
const credentials = 'data/demo-password.txt';
if (!existsSync(credentials)) {
  writeFileSync(credentials, randomBytes(12).toString('base64url'), { flag: 'wx' });
}
const password = readFileSync(credentials, 'utf8').trim();
const database = await connect();
const { accounts, households, entries, client } = database;
try {
  for (const [index, [firstName, lastName, alias]] of people.entries()) {
    const email = `${alias}@demo.sotovor.test`;
    await accounts.updateOne({ _id: members[index].accountId, demo: seedId }, { $setOnInsert: {
      firstName, lastName, email, phone: `+3864000000${index + 1}`, passwordHash: await passwordHash(password),
    } }, { upsert: true });
  }
  await households.updateOne({ _id: group, demo: seedId }, { $setOnInsert: {
    name: 'Družina Novak · Demo', ownerId: members[0].id, expectedMembers: 4,
    inviteCode: randomBytes(16).toString('hex'), members,
  } }, { upsert: true });
  const active = (await households.findOne({ _id: group })).members.filter(member => !member.inactive);
  const writes = [];
  for (let day = 1; day <= count; day++) {
    const dueOn = `${month}-${String(day).padStart(2, '0')}`;
    for (const [slot, [category, titles]] of tasks.entries()) {
      const index = (day - 1) * tasks.length + slot;
      const assignedAt = new Date(`${dueOn}T07:00:00Z`);
      const completedAt = dueOn < today && index % 6 !== 0 ? new Date(`${dueOn}T17:00:00Z`) : null;
      writes.push({ updateOne: {
        filter: { _id: demoId(`entry/${month}/${index}`), demo: seedId },
        update: { $setOnInsert: {
          householdId: group, kind: 'task', title: titles[(day + slot) % titles.length],
          dueOn, category, assigneeId: active[index % active.length].id, assignedAt,
          reminderDays: 2, repeatDays: 0, rotate: false, createdAt: assignedAt, completedAt,
        } },
        upsert: true,
      } });
    }
  }
  await entries.bulkWrite(writes);
  console.log(`${month}: ${count * tasks.length} demo opravil, ${active.length} aktivni člani.`);
  console.log('Računi: ' + people.map(([, , alias]) => alias + '@demo.sotovor.test').join(', '));
  console.log('Lokalno demo geslo: ' + credentials);
} finally {
  await client.close();
}
