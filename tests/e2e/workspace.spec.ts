import { expect, test } from '@playwright/test';

const csv = [
  'id,label,x,y,z',
  ...Array.from({ length: 24 }, (_, index) => {
    const group = index < 12 ? 0 : 1;
    const offset = index % 12;
    const isOutlier = index === 23;
    const x = isOutlier ? 1000 : group * 20 + offset * 0.1;
    const y = isOutlier ? 600 : group * 5 + offset * 0.07;
    const z = isOutlier ? -800 : group * 3 + offset * 0.05;
    return `row-${index + 1},${group === 0 ? 'A' : 'B'},${x},${y},${z}`;
  }),
].join('\n');

test('workspace analyzes through API v2, tunes and filters points, then restores history', async ({ page }) => {
  test.setTimeout(120_000);
  const datasetName = `e2e-clusters-${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB' }).click();
  await page.getByLabel('Email').fill('demo@dimension.lab');
  await page.getByRole('textbox', { name: 'Password' }).fill('Dimension123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/#\/overview$/, { timeout: 15_000 });

  await page.goto('/#/explore');
  await expect(page.getByRole('button', { name: 'Run analysis' })).toBeVisible();
  const uploaded = page.waitForResponse(response =>
    response.url().includes('/api/v1/datasets') && response.request().method() === 'POST');
  await page.locator('input[type="file"]').setInputFiles({
    name: `${datasetName}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  expect((await uploaded).status()).toBe(201);

  const analysis = page.waitForResponse(response =>
    response.url().includes('/api/v2/analyses') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run analysis' }).click();
  expect((await analysis).status()).toBe(202);
  await expect(page.locator('.workspace-viewing')).toContainText('PCA', { timeout: 30_000 });

  await page.getByText('More insights', { exact: true }).scrollIntoViewIfNeeded();
  await page.getByText('More insights', { exact: true }).click();
  await expect(page.getByText('Trustworthiness')).toBeVisible();
  await expect(page.getByText('Davies–Bouldin index')).toBeVisible();

  const optimization = page.waitForResponse(response =>
    response.url().includes('/api/v2/analyses/optimize') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Optimize parameters' }).click();
  expect((await optimization).status()).toBe(202);
  await expect(page.getByText(/Best score/)).toBeVisible({ timeout: 30_000 });

  const rerun = page.waitForResponse(response =>
    response.url().includes('/api/v2/analyses') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run analysis' }).click();
  expect((await rerun).status()).toBe(202);
  await expect(page.locator('.workspace-viewing')).toContainText('PCA', { timeout: 30_000 });

  const filter = page.waitForResponse(response =>
    response.url().includes('/api/v2/analyses/') && response.url().endsWith('/points/filter'));
  await page.getByRole('button', { name: /Filter outliers/ }).click();
  expect((await filter).status()).toBe(200);
  const restore = page.waitForResponse(response =>
    response.url().includes('/api/v2/analyses/') && response.url().endsWith('/points/filter'));
  await page.getByRole('button', { name: /Restore \(/ }).click();
  expect((await restore).status()).toBe(200);

  const save = page.waitForResponse(response =>
    response.url().includes('/api/v1/experiments') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save experiment' }).click();
  expect((await save).status()).toBe(201);
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'Experiments' })).toBeVisible();
  const savedRun = page.getByRole('listitem').filter({ hasText: datasetName });
  await savedRun.getByText('Saved configuration', { exact: true }).click();
  await expect(savedRun.getByRole('button', { name: 'Restore settings' })).toBeEnabled();
  await savedRun.getByRole('button', { name: 'Restore settings' }).click();
  await expect(page).toHaveURL(/#\/explore$/, { timeout: 10_000 });
});
