import { readFileSync } from 'node:fs';

import { expect, type Page, test } from '@playwright/test';

// #426: a goal list shows how far it is, a solve logged on the Coding screen moves it at once, and
// the day log shows the goals. Seeded from the same fixture as the import spec.
const listName = 'E2E progress';

async function cleanUp(page: Page) {
  const lists = await page.request.get('/api/coding/goals');
  const { lists: found } = (await lists.json()) as { lists: { id: number; name: string }[] };
  for (const list of found.filter((l) => l.name === listName))
    await page.request.delete(`/api/coding/goals/${list.id}`);
  const problems = await page.request.get('/api/coding/problems?q=E2E goal');
  const { problems: rows } = (await problems.json()) as { problems: { id: number }[] };
  for (const row of rows) await page.request.delete(`/api/coding/problems/${row.id}`);
}

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`goal progress moves when a solve is logged, at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await cleanUp(page);
    await page.setViewportSize(viewport);
    try {
      const seeded = await page.request.post('/api/coding/goals/import', {
        headers: { 'x-requested-with': 'study-log' },
        multipart: {
          file: {
            name: 'coding-goals.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: readFileSync('e2e/fixtures/coding-goals.xlsx'),
          },
          sheet: '문제목록',
          name: listName,
          site: 'baekjoon',
          targetDate: '',
          mapping: JSON.stringify({
            order: 0,
            group: 1,
            topic: 2,
            key: 3,
            title: 4,
            level: 5,
            url: 6,
            status: 7,
            solvedDate: 8,
            note: 9,
          }),
        },
      });
      expect(seeded.status()).toBe(201);

      await page.goto('/coding');
      const lists = page.getByRole('list', { name: 'Your goal lists' });
      await expect(
        lists.getByRole('progressbar', { name: `${listName} progress` }).first(),
      ).toHaveAttribute('aria-valuenow', '1');
      await lists.getByRole('button', { name: `${listName} problems` }).click();
      const items = page.getByRole('region', { name: `${listName} problems` });
      await expect(items).toContainText('1 of 4 solved (25%)');
      await expect(items.getByRole('listitem')).toHaveCount(4);
      await items.getByLabel('Show').selectOption('left');
      await expect(items.getByRole('listitem')).toHaveCount(3);
      await items.getByLabel('Show').selectOption('all');
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // Logging the next goal problem moves the bar at once.
      const quick = page.getByRole('region', { name: 'Log a solve' });
      await quick.getByRole('button', { name: 'Next: E2E goal two (9990002)' }).click();
      await quick.getByRole('button', { name: 'Save solve' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Logged E2E goal two' }),
      ).toBeVisible();
      await expect(
        lists.getByRole('progressbar', { name: `${listName} progress` }).first(),
      ).toHaveAttribute('aria-valuenow', '2');
      await expect(items).toContainText('2 of 4 solved (50%)');
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // The page shows the goal and what was solved today, at its top.
      await page.goto('/coding');
      const day = page.getByRole('region', { name: 'Algorithm goals today' });
      await expect(day).toContainText(listName);
      await expect(day).toContainText('Solved today: E2E goal two');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    } finally {
      await cleanUp(page);
    }
  });
}
