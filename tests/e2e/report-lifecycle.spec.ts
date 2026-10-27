import { expect, test } from '@playwright/test';
import {
  openInQueue,
  randomNumber,
  signIn,
  signOut,
  submitReport,
  toDisplay,
  USERS,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('a report stays private until a moderator approves it', async ({ page }) => {
  const number = randomNumber();

  // 1. User submits; it is pending and not in public search.
  await signIn(page, USERS.user);
  await submitReport(page, number, 'Caller said he was from bKash and asked for my OTP and PIN.');
  await page.goto('/my-reports');
  await expect(page.getByRole('heading', { name: new RegExp(toDisplay(number)) })).toBeVisible();
  await expect(page.getByText('Pending review').first()).toBeVisible();

  await page.goto(`/search?q=${number}`);
  await expect(page.getByText(`No reviewed reports found for ${toDisplay(number)}`)).toBeVisible();
  await signOut(page);

  // 3. Another user cannot see it.
  await signIn(page, USERS.admin);
  await page.goto('/my-reports');
  await expect(page.getByRole('heading', { name: new RegExp(toDisplay(number)) })).toHaveCount(0);
  await signOut(page);

  // 2. Moderator approves with a redacted summary; now it is public.
  await signIn(page, USERS.moderator);
  await openInQueue(page, number);
  await page.getByText('Approve and publish', { exact: true }).click();
  await page
    .getByLabel('Public summary (redacted)')
    .fill('Caller claimed to be a mobile banking agent and asked for an OTP.');
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText(/Saved\. Status is now/)).toBeVisible();
  await signOut(page);

  await page.goto(`/search?q=${number}`);
  await expect(
    page.getByText(`1 reviewed community report for ${toDisplay(number)}`),
  ).toBeVisible();
  await expect(page.getByText('Caller claimed to be a mobile banking agent')).toBeVisible();
  await expect(page.getByText('Caller said he was from bKash')).toHaveCount(0);
});

test('a rejected report can be appealed and the appeal resolved', async ({ page }) => {
  const number = randomNumber();

  await signIn(page, USERS.user);
  await submitReport(page, number, 'Received a message about a lottery prize that needed a fee.');
  await signOut(page);

  await signIn(page, USERS.moderator);
  await openInQueue(page, number);
  await page.getByText('Reject', { exact: true }).click();
  await page.getByLabel('Reason (required)').fill('Not enough detail to publish.');
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText(/Saved\. Status is now/)).toBeVisible();
  await signOut(page);

  await signIn(page, USERS.user);
  await page.goto('/my-reports');
  const card = page.getByRole('article').filter({ hasText: toDisplay(number) });
  await expect(card.getByText('Not published').first()).toBeVisible();
  await expect(card.getByText('Not enough detail to publish.')).toBeVisible();
  await card.getByText('Appeal this decision').click();
  await card
    .getByLabel('Why should this decision be reviewed again?')
    .fill('The message asked for a 2,000 taka delivery fee.');
  await card.getByRole('button', { name: 'Submit appeal' }).click();
  await expect(card.getByText('Under appeal').first()).toBeVisible();
  await signOut(page);

  await signIn(page, USERS.moderator);
  await page.goto('/admin/appeals');
  const appeal = page.getByRole('article').filter({ hasText: toDisplay(number) });
  await appeal.getByLabel(/Resolution reason/).fill('Thanks, sending back for review.');
  await appeal.getByRole('button', { name: /Accept/ }).click();
  await expect(appeal).toHaveCount(0);

  await openInQueue(page, number);
  await expect(page.getByText('Pending review').first()).toBeVisible();
});

test('signed-out visitors are sent to sign in, and non-staff cannot moderate', async ({ page }) => {
  await page.goto('/report');
  await expect(page).toHaveURL(/\/login\?next=%2Freport/);

  await signIn(page, USERS.user);
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Not authorized' })).toBeVisible();
});
