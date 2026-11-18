import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

const mailUrl = process.env.E2E_MAIL_URL || 'http://127.0.0.1:3061';
const password = 'Quality-gate-password-23';

async function register(page, request, name) {
  const email = `${randomUUID()}@test.invalid`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Prijava', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ustvari račun', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Ime', { exact: true }).fill(name);
  await form.getByLabel('Priimek').fill('Test');
  await form.getByLabel('E-pošta').fill(email);
  await form.getByLabel('Telefonska številka').fill('+38640000111');
  await form.getByLabel('Geslo', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Registriraj se' }).click();
  await page.getByRole('heading', { name: `Živjo, ${name}!` }).waitFor();
  let message;
  await expect
    .poll(async () => {
      const response = await request.get(mailUrl + '/api/v1/messages');
      message = (await response.json()).messages?.find((m) => m.To.some((to) => to.Address === email));
      return Boolean(message);
    })
    .toBe(true);
  const response = await request.get(mailUrl + '/api/v1/message/' + message.ID);
  const link = (await response.json()).Text.match(/https?:\/\/\S+/)[0];
  await page.goto(link);
  await page.getByRole('button', { name: 'Potrdi e-poštni naslov', exact: true }).click();
  await expect(page.getByText('E-poštni naslov je potrjen.', { exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Odpri profil', exact: true }).first().click();
}

const nav = (page, label) =>
  page
    .getByRole('navigation', { name: 'Glavna navigacija' })
    .getByRole('button', { name: label, exact: true });

test('verified family members collaborate across separate browser sessions', async ({
  page,
  browser,
  request,
}) => {
  await register(page, request, 'Ana');
  await page.getByLabel('Ime prostora').fill('Quality family');
  await page.getByRole('button', { name: 'Ustvari prostor', exact: true }).click();
  await page.getByRole('button', { name: 'Povabi člana', exact: true }).click();
  const code = await page.getByRole('dialog').locator('input').first().inputValue();
  await page.getByRole('button', { name: 'Zapri', exact: true }).click();

  const second = await browser.newContext({ viewport: page.viewportSize() });
  try {
    const member = await second.newPage();
    await register(member, request, 'Bor');
    await member.getByRole('button', { name: 'Imam kodo povabila', exact: true }).click();
    await member.getByLabel('Koda povabila').fill(code);
    await member.getByRole('button', { name: 'Pridruži se prostoru', exact: true }).click();
    await nav(page, 'Opravila').click();
    await page.getByRole('button', { name: 'Dodaj vnos', exact: true }).click();
    await page.getByLabel('Naslov', { exact: true }).fill('Quality task');
    await page.getByRole('dialog').getByRole('button', { name: 'Dodaj opravilo', exact: true }).click();
    await member.reload();
    await member.getByRole('button', { name: 'Odpri profil', exact: true }).first().click();
    await nav(member, 'Opravila').click();
    const row = member.locator('.task-row').filter({ hasText: 'Quality task' });
    await row.getByRole('button', { name: 'Prevzemi', exact: true }).click();
    await row.getByRole('button', { name: 'Prosi za zamenjavo', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Odpri profil', exact: true }).first().click();
    await nav(page, 'Opravila').click();
    const ownerRow = page.locator('.task-row').filter({ hasText: 'Quality task' });
    await ownerRow.getByRole('button', { name: 'Prevzemi', exact: true }).click();
    await ownerRow.getByRole('button', { name: 'Zaključi Quality task', exact: true }).click();
    await expect(ownerRow).toHaveCount(0);

    await nav(page, 'Koledar').click();
    await page.getByRole('button', { name: 'Dodaj vnos', exact: true }).click();
    await page.getByLabel('Naslov', { exact: true }).fill('Quality event');
    const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    await page.locator('input[name=dueOn]').fill(today);
    await page.getByRole('dialog').getByRole('button', { name: 'Dodaj dogodek', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('.month-agenda').getByText('Quality event', { exact: true })).toBeVisible();

    await nav(page, 'Opravila').click();
    await page.getByRole('button', { name: 'Dodaj vnos', exact: true }).click();
    await page.getByLabel('Naslov', { exact: true }).fill('Planner task');
    await page.getByRole('dialog').getByRole('button', { name: 'Dodaj opravilo', exact: true }).click();
    await nav(page, 'Razporeditev').click();
    await page.getByRole('button', { name: 'Pripravi predlog', exact: true }).click();
    await page.getByRole('button', { name: /Potrdi spremembe/ }).click();
    await expect(page.getByText(/Uporabljene dodelitve: 1/)).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize().width,
    );
    await page.goto('/prenesi');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sotovor');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  } finally {
    await second.close();
  }
});

test('landing and sign-in support keyboard navigation with labelled controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'SOTOVOR', exact: true }).first().waitFor();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Prijava', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
