import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';

const billing = process.env.E2E_BILLING === '1';
const mailUrl = process.env.E2E_MAIL_URL || 'http://127.0.0.1:3063';
const project = process.env.E2E_BILLING_PROJECT || 'sotovor-billing-quality';
const password = 'Billing-e2e-test-password';
async function member(page, name) {
  const email = randomUUID() + '@test.invalid';
  const res = await page.request.post('/api/v1/auth/register', {
    data: { firstName: name, lastName: 'Pro', email, phone: '+38640000111', password },
  });
  expect(res.status()).toBe(201);
  let message;
  await expect
    .poll(async () => {
      const inbox = await page.request.get(mailUrl + '/api/v1/messages');
      message = (await inbox.json()).messages?.find((m) => m.To.some((to) => to.Address === email));
      return Boolean(message);
    })
    .toBe(true);
  const detail = await page.request.get(mailUrl + '/api/v1/message/' + message.ID);
  const text = (await detail.json()).Text;
  const token = text.match(/verify-email=([a-f0-9]+)/)[1];
  const verified = await page.request.post('/api/v1/auth/email/verify', { data: { token } });
  expect(verified.ok()).toBe(true);
  return email;
}
async function family(page) {
  await member(page, 'Ana');
  const created = await page.request.post('/api/v1/households', {
    data: { householdName: 'Billing family', expectedMembers: 4 },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).householdId;
}
async function pro(page, id) {
  await page.goto('/pro?space=' + id);
  await expect(page.getByRole('heading', { name: 'Billing family', exact: true })).toBeVisible();
}
function transition(id, state) {
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      '-f',
      'compose.billing-test.yaml',
      'exec',
      '-T',
      'app',
      'node',
      'scripts/billing-mock.js',
      id,
      state,
    ],
    { stdio: 'pipe', timeout: 30000 },
  );
}
const nav = (page, name) =>
  page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sotovor-language', 'sl');
  });
});

test('disabled billing hides pricing links, badges, checkout and trial UI', async ({ page }) => {
  test.skip(billing, 'Uses the default billing-disabled stack.');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Prijava', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sotovor Pro', exact: true })).toHaveCount(0);
  await page.goto('/pro');
  await expect(page.getByRole('heading', { name: 'Vse možnosti so na voljo.' })).toBeVisible();
  await expect(page.locator('.pro-price, .pro-badge, .billing-profile')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nadgradi', exact: true })).toHaveCount(0);
});

test('public Pro page has translated prices, legal review sections and accessible phone layout', async ({
  page,
}) => {
  test.skip(!billing, 'Requires mock billing stack.');
  await page.goto('/pro');
  await expect(page.locator('.pro-price')).toContainText('3 EUR');
  await page.getByRole('button', { name: 'Letno', exact: true }).click();
  await expect(page.locator('.pro-price')).toContainText('30 EUR');
  await expect(page.getByRole('link', { name: 'Najprej se prijavi' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByLabel('Jezik', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'More room for life together.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in first' })).toBeVisible();
  await page.getByLabel('Language', { exact: true }).selectOption('de');
  await expect(page.getByRole('heading', { name: 'Mehr Raum für das gemeinsame Leben.' })).toBeVisible();
  for (const path of ['/pogoji', '/zasebnost', '/pogoji-narocnine']) {
    await page.goto(path);
    await expect(page.locator('main')).toContainText('TODO');
  }
});

test('admin starts a trial and sees remaining days in Pro and Profile', async ({ page }) => {
  test.skip(!billing, 'Requires mock billing stack.');
  const id = await family(page);
  await pro(page, id);
  await page.getByRole('button', { name: 'Začni 14-dnevni preizkus', exact: true }).click();
  await expect(page.getByText('Preostanek preizkusa: 14 dni.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Začni 14-dnevni preizkus', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Nazaj v Sotovor' }).click();
  await expect(page.getByRole('region', { name: 'Naročnina' })).toContainText('Sotovor Pro');
});

test('quota upsell, hosted upgrade confirmation, member permissions, portal and expiry preserve family data', async ({
  page,
  browser,
}) => {
  test.skip(!billing, 'Requires mock billing stack.');
  const id = await family(page);
  const added = await page.request.post('/api/v1/entries', {
    data: {
      kind: 'task',
      title: 'Keep this task after expiry',
      category: 'dom',
      dueOn: null,
      assigneeId: null,
    },
  });
  expect(added.ok()).toBe(true);
  await page.goto('/?profile=1');
  await nav(page, 'Razporeditev').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pripravi predlog', exact: true }).click();
  const upsell = page.getByRole('dialog', { name: 'Več pametnih predlogov', exact: true });
  await expect(upsell).toBeVisible();
  await expect(upsell).toContainText('Omejitev Free: 0. Trenutno: 0.');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await upsell.getByRole('link', { name: 'Oglej si Pro', exact: true }).click();
  await page.getByRole('button', { name: 'Nadgradi', exact: true }).click();
  await expect(page.getByText('Samo test — brez plačila', { exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Potrdi testni nakup', exact: true }).click();
  await expect(
    page.getByText('Plačilo je potrjeno. Sotovor Pro je pripravljen.', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Sotovor Pro', { exact: true }).last()).toBeVisible();
  const dashboard = await (await page.request.get('/api/v1/dashboard')).json();
  const other = await browser.newContext({ viewport: page.viewportSize() });
  try {
    const person = await other.newPage();
    await person.addInitScript(() => localStorage.setItem('sotovor-language', 'sl'));
    await member(person, 'Bor');
    expect(
      (
        await person.request.post('/api/v1/households/join', {
          data: { inviteCode: dashboard.household.inviteCode },
        })
      ).ok(),
    ).toBe(true);
    await pro(person, id);
    await expect(person.getByRole('heading', { name: 'Prosi skrbnika' })).toBeVisible();
    await expect(person.getByLabel('Sporočilo za skrbnika')).toContainText('/pro?space=' + id);
    await expect(person.getByRole('button', { name: 'Nadgradi', exact: true })).toHaveCount(0);
    await expect(person.getByRole('button', { name: 'Upravljaj naročnino', exact: true })).toHaveCount(0);
    expect(
      (
        await person.request.post('/api/v1/spaces/' + id + '/billing/checkout', { data: { plan: 'monthly' } })
      ).status(),
    ).toBe(403);
    await person.goto('/?profile=1');
    await expect(person.getByRole('region', { name: 'Naročnina' })).toContainText('Sotovor Pro');
    await expect(person.getByRole('region', { name: 'Naročnina' }).getByRole('button')).toHaveCount(0);
  } finally {
    await other.close();
  }
  await page.goto('/?profile=1');
  await page.getByRole('button', { name: 'Upravljaj naročnino', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Testni portal' })).toBeVisible();
  transition(id, 'expired');
  await pro(page, id);
  await expect(page.getByText('Sotovor Free', { exact: true })).toBeVisible();
  await expect(page.getByText('Potekla', { exact: true })).toBeVisible();
  await page.goto('/?profile=1');
  await nav(page, 'Opravila').click();
  await expect(page.getByText('Keep this task after expiry', { exact: true })).toBeVisible();
});

test('desktop checkout stays in-app and refreshes entitlements after browser focus returns', async ({
  page,
  context,
}) => {
  test.skip(!billing, 'Requires mock billing stack.');
  const id = await family(page);
  await page.addInitScript(() => {
    window.sotovorDesktop = {
      openExternal: (url) => {
        window.billingExternalUrl = url;
      },
    };
  });
  await pro(page, id);
  await page.getByRole('button', { name: 'Nadgradi', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.billingExternalUrl)).toContain('/dev/mock-checkout');
  expect(new URL(page.url()).pathname).toBe('/pro');
  const hosted = await context.newPage();
  await hosted.goto(await page.evaluate(() => window.billingExternalUrl));
  await hosted.getByRole('checkbox').check();
  await hosted.getByRole('button', { name: 'Potrdi testni nakup', exact: true }).click();
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        return page.locator('.pro-state').innerText();
      },
      { timeout: 20000 },
    )
    .toContain('Aktivna');
  await hosted.close();
});
