import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('search accepts Bangla digits and shows seeded reviewed reports', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Phone number').fill('০১৭১২-৩৪৫৬৭৮');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/q=%2B8801712345678/);
  await expect(page.getByText(/2 reviewed community reports for 01712-345678/)).toBeVisible();
});

test('invalid numbers get a clear message', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Phone number').fill('12345');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('alert')).toContainText('valid Bangladesh mobile number');
});

for (const path of ['/', '/search?q=01712345678', '/safety', '/privacy', '/terms', '/login']) {
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
