import { expect, type Page, test } from '@playwright/test';

// #427: logging a solve on a known problem takes two taps on a phone (the problem, then Save),
// and the screen does not scroll sideways at 390x844.
const key = 'zz-e2e-quick';
const title = 'E2E quick problem';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function removeProblem(page: Page) {
  const list = await page.request.get(`/api/coding/problems?q=${key}`);
  const { problems } = (await list.json()) as { problems: { id: number }[] };
  for (const problem of problems) await page.request.delete(`/api/coding/problems/${problem.id}`);
}

test('a solve on a known problem is logged with the problem and Save', async ({ page }) => {
  await removeProblem(page);
  const made = await page.request.post('/api/coding/problems', {
    data: { site: 'other', problemKey: key, title },
  });
  expect(made.status()).toBe(201);
  try {
    await page.goto('/coding');
    const quick = page.getByRole('region', { name: 'Log a solve' });
    await quick.getByRole('button', { name: `${title} (${key})` }).tap();
    await quick.getByRole('button', { name: 'Save solve' }).tap();
    await expect(
      page.getByRole('status').filter({ hasText: `Logged ${title}: Solved` }),
    ).toBeVisible();
    await expect(quick.getByRole('button', { name: 'Save solve' })).toHaveCount(0);
    await expect(quick.getByText(/Today: [1-9]\d* solves?/)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const detail = await page.request.get(`/api/coding/problems?q=${key}`);
    const { problems } = (await detail.json()) as { problems: { attemptCount: number }[] };
    expect(problems[0]?.attemptCount).toBe(1);
  } finally {
    await removeProblem(page);
  }
});
