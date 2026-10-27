// Smoke tests for public pages. They need only the dev server, not a database:
// without Supabase env vars the app still renders and validates input.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('invalid numbers get a clear message', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Phone number').fill('12345');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('alert')).toContainText('valid Bangladesh mobile number');
});

for (const path of [
  '/',
  '/search?q=01712345678',
  '/safety',
  '/privacy',
  '/terms',
  '/login',
  '/signup',
]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test('no horizontal scrolling on small screens', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
