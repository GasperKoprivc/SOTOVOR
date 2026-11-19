export function registerAppLinks(app, env = process.env) {
  const packageName = env.SOTOVOR_ANDROID_PACKAGE || 'si.sotovor.app';
  const fingerprints = (env.SOTOVOR_ANDROID_FINGERPRINTS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (
    !/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/.test(packageName) ||
    fingerprints.some((value) => !/^[A-F0-9]{2}(?::[A-F0-9]{2}){31}$/.test(value))
  ) {
    throw new Error('Invalid Android package name or SHA-256 signing fingerprint.');
  }
  app.get('/.well-known/assetlinks.json', (_req, res) =>
    res.json(
      fingerprints.length
        ? [
            {
              relation: ['delegate_permission/common.handle_all_urls'],
              target: {
                namespace: 'android_app',
                package_name: packageName,
                sha256_cert_fingerprints: [...new Set(fingerprints)],
              },
            },
          ]
        : [],
    ),
  );
  app.get('/join/:code', (req, res) => {
    const code = req.params.code.toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(code)) return res.sendStatus(404);
    res.redirect(302, '/?invite=' + code);
  });
}
