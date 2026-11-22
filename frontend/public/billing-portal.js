const button = document.getElementById('portal');
const copy = {
  sl: 'Prijavi se v Sotovor in znova poskusi. Portal je na voljo samo skrbniku z naročnino.',
  en: 'Sign in to Sotovor and try again. The portal is available only to the subscribed space admin.',
  de: 'Melde dich bei Sotovor an und versuche es erneut. Das Portal steht nur dem Administrator des abonnierten Familienbereichs zur Verfügung.',
};
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const response = await fetch('/api/v1/spaces/' + button.dataset.space + '/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) throw new Error('Portal unavailable.');
    const result = await response.json();
    window.location.assign(result.url);
  } catch {
    document.getElementById('problem').textContent = copy[document.documentElement.lang] ?? copy.en;
    button.disabled = false;
  }
});
