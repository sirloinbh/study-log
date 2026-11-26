import { expect, type Page, test } from '@playwright/test';

// #425: a goal list is imported from an Excel file, checked in a preview first, and importing the
// same file again changes nothing.
const listName = 'E2E goals';
const keys = ['9990001', '9990002', '9990003', '9990004'];

async function cleanUp(page: Page) {
  const lists = await page.request.get('/api/coding/goals');
  const { lists: found } = (await lists.json()) as { lists: { id: number; name: string }[] };
  for (const list of found.filter((l) => l.name === listName))
    await page.request.delete(`/api/coding/goals/${list.id}`);
  const problems = await page.request.get('/api/coding/problems?q=E2E goal');
  const { problems: rows } = (await problems.json()) as { problems: { id: number }[] };
  for (const row of rows) await page.request.delete(`/api/coding/problems/${row.id}`);
}

async function importFile(page: Page, importedText: RegExp) {
  const card = page.getByRole('region', { name: 'Goal lists' });
  await card.getByLabel('Excel file').setInputFiles('e2e/fixtures/coding-goals.xlsx');
  await expect(card.getByLabel('Problem number')).toHaveValue('3');
  await card.getByLabel('List name').fill(listName);
  await card.getByRole('button', { name: 'Preview the import' }).click();
  const preview = card.getByLabel('Import preview');
  await expect(preview).toContainText('4 problems');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(preview).toContainText('Row 6: The problem number is not a Baekjoon number');
  await card.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: importedText })).toBeVisible();
  return card;
}

test('a goal list is imported, a repeat changes nothing, and the list can be deleted', async ({
  page,
}) => {
  await cleanUp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto('/coding');
    await importFile(
      page,
      /Imported E2E goals: 4 added, 0 updated, 0 unchanged, 2 attempts recorded/,
    );
    const lists = page.getByRole('list', { name: 'Your goal lists' });
    await expect(lists).toContainText('E2E goals');
    await expect(lists).toContainText('4 problems, 2 in your log');

    const logged = await page.request.get('/api/coding/problems?q=E2E goal');
    const { problems } = (await logged.json()) as {
      problems: { problemKey: string; attemptCount: number; lastResult: string | null }[];
    };
    expect(problems.map((p) => p.problemKey).sort()).toEqual(keys.slice(0, 2));
    expect(problems.find((p) => p.problemKey === keys[0])?.lastResult).toBe('solved');
    expect(problems.find((p) => p.problemKey === keys[1])?.lastResult).toBe('partial');

    await page.reload();
    await importFile(page, /Imported E2E goals: 0 added, 0 updated, 4 unchanged/);
    const again = await page.request.get('/api/coding/problems?q=E2E goal');
    const counts = ((await again.json()) as { problems: { attemptCount: number }[] }).problems;
    expect(counts.reduce((sum, p) => sum + p.attemptCount, 0)).toBe(2);

    await page.getByRole('button', { name: 'E2E goals delete' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Deleted the goal list E2E goals' }),
    ).toBeVisible();
  } finally {
    await cleanUp(page);
  }
});
