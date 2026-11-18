import { readFile, mkdir, writeFile } from 'node:fs/promises';

const inventory = JSON.parse(
  await readFile('apps/android/app/build/reports/dependency-inventory.json', 'utf8'),
);
const findings = [];
for (let start = 0; start < inventory.length; start += 100) {
  const batch = inventory.slice(start, start + 100);
  const response = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: batch.map(({ name, version }) => ({ package: { name, ecosystem: 'Maven' }, version })),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error('OSV dependency check was unavailable (' + response.status + ').');
  const { results } = await response.json();
  for (const [index, result] of results.entries()) {
    for (const vulnerability of result.vulns ?? [])
      findings.push({ ...batch[index], advisory: vulnerability.id });
  }
}
await mkdir('quality-results', { recursive: true });
await writeFile(
  'quality-results/gradle-audit.json',
  JSON.stringify({ packages: inventory.length, findings }, null, 2),
);
console.log(
  `Checked ${inventory.length} resolved Maven packages against OSV. ${findings.length} advisories.`,
);
if (findings.length) {
  console.error(findings);
  process.exitCode = 1;
}
