import { expect, type Page } from '@playwright/test';

// Mailpit is bundled with local Supabase and captures auth emails.
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export const USERS = {
  user: 'user@shieldnum.test',
  moderator: 'moderator@shieldnum.test',
  admin: 'admin@shieldnum.test',
} as const;

async function clearInbox(email: string) {
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`, {
    method: 'DELETE',
  });
}

async function readCode(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const code = /\b(\d{6})\b/.exec(`${message.Text} ${message.HTML}`)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

export async function signIn(page: Page, email: string) {
  await clearInbox(email);
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click();
  await page.getByLabel('Sign-in code').fill(await readCode(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/my-reports/);
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
}

/** A random valid BD mobile number in local format, so runs do not collide. */
export function randomNumber(): string {
  return `0171${Math.floor(Math.random() * 1e7)
    .toString()
    .padStart(7, '0')}`;
}

export function toDisplay(local: string): string {
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}

export async function submitReport(page: Page, number: string, description: string) {
  await page.goto('/report');
  await page.getByLabel('Phone number that contacted you').fill(number);
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('What happened?').fill(description);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Report submitted for review')).toBeVisible();
}

export async function openInQueue(page: Page, number: string, status = 'Pending review') {
  await page.goto('/admin/reports');
  await page.getByLabel('Status').selectOption({ label: status });
  await page.getByLabel('Number').fill(number);
  await page
    .getByRole('link', { name: new RegExp(toDisplay(number)) })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: new RegExp(toDisplay(number)) })).toBeVisible();
}
