import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const path = (name) => fileURLToPath(new URL(name, root));
const { version } = JSON.parse(await readFile(path('package.json'), 'utf8'));
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/.test(version)) {
  throw new Error('Use a major.minor.patch version with minor and patch below 100.');
}
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
  throw new Error('Invalid Android versionCode.');
}

const check = process.argv.includes('--check');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== 'v' + version) {
  throw new Error('The pushed tag must match package.json (' + version + ').');
}
const files = [
  ['apps/desktop/src-tauri/tauri.conf.json', /("version"\s*:\s*)"[^"]+"/],
  ['apps/desktop/src-tauri/Cargo.toml', /(^version = )"[^"]+"/m],
  ['apps/desktop/src-tauri/Cargo.lock', /(\[\[package\]\]\r?\nname = "sotovor"\r?\nversion = )"[^"]+"/],
];
async function sync(name, transform) {
  const current = await readFile(path(name), 'utf8');
  const next = transform(current);
  if (current.replaceAll('\r\n', '\n') === next.replaceAll('\r\n', '\n')) return;
  if (check) throw new Error('Run npm run version:sync to update ' + name);
  await writeFile(path(name), next);
}
for (const [name, pattern] of files) {
  await sync(name, (current) => {
    if (!pattern.test(current)) throw new Error('Version field missing in ' + name);
    return current.replace(pattern, (_, prefix) => prefix + JSON.stringify(version));
  });
}
await sync('package-lock.json', (current) => {
  const lock = JSON.parse(current);
  lock.version = version;
  lock.packages[''].version = version;
  return JSON.stringify(lock, null, 2) + '\n';
});
console.log('Sotovor ' + version + ' (Android versionCode ' + versionCode + ')');
