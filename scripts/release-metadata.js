import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const folder = process.argv[2] ?? 'release-assets';
const win = `Sotovor-${version}-windows-x64-setup.exe`;
const tag = 'v' + version;
const origin = URL.parse(process.env.SOTOVOR_BUILD_URL ?? '');
if (origin?.protocol !== 'https:' || origin.href !== origin.origin + '/') {
  throw new Error('A public HTTPS origin is required to generate the updater manifest.');
}

const signature = (await readFile(join(folder, win + '.sig'), 'utf8')).trim();
if (!signature) throw new Error('The NSIS detached updater signature is empty.');
const date = new Date().toISOString();
await writeFile(
  join(folder, 'latest.json'),
  JSON.stringify(
    {
      version,
      pub_date: date,
      platforms: {
        'windows-x86_64': {
          signature,
          url: new URL('/download/releases/' + tag + '/' + win, origin).href,
        },
      },
    },
    null,
    2,
  ) + '\n',
);

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const content of createReadStream(join(folder, file))) hash.update(content);
  return hash.digest('hex') + '  ' + basename(file);
}
const inputs = (await readdir(folder)).filter((file) => /\.(exe|sig|apk|aab|json)$/.test(file)).sort();
if (
  !inputs.includes(win) ||
  ![version, version + '-unsigned'].some((suffix) =>
    ['apk', 'aab'].every((ext) => inputs.includes(`Sotovor-${suffix}.${ext}`)),
  )
) {
  throw new Error('The release must contain the Windows installer and both Android outputs.');
}
await writeFile(join(folder, 'SHA256SUMS.txt'), (await Promise.all(inputs.map(checksum))).join('\n') + '\n');
