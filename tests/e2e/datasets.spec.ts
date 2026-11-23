import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openDemoPage, uploadCsv } from './support';
import { sampleDatasets } from '@dimension-lab/contracts';

test('lists all samples and runs the Wheat Seeds preset through Explore', async ({ page }) => {
  await openDemoPage(page, '/#/datasets');
  const library = page.getByRole('region', { name: 'Sample datasets' });
  await expect(library.getByRole('listitem')).toHaveCount(sampleDatasets.length);
  const wheat = library.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Wheat Seeds', exact: true }) });
  await expect(wheat).toContainText('PCA + GMM');
  await wheat.getByLabel('Actions for Wheat Seeds', { exact: true }).click();
  await wheat.getByRole('button', { name: 'Preview first 20 rows' }).click();
  await expect(page.getByRole('dialog')).toContainText('First 20 of 210 rows');
  await page.getByRole('button', { name: 'Close raw data' }).click();
  // Exercise the static CSV fallback as well as the real compute worker.
  await page.route('**/api/datasets/wheat_seeds', route => route.fulfill({ status: 503 }));
  await wheat.getByRole('button', { name: 'Use dataset' }).click();
  await expect(page).toHaveURL(/#\/explore$/);
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.locator('.workspace-viewing')).toContainText('PCA / GMM / Z-score');
  await expect(page.getByText('GMM · diagonal covariance', { exact: true })).toBeAttached();
});

test('previews, searches, downloads, renames, and deletes an imported dataset', async ({ page }) => {
  await openDemoPage(page, '/#/datasets');
  const name = 'browser-dataset-management';
  const row = await uploadCsv(page, name);
  await row.getByLabel(`Actions for ${name}`, { exact: true }).click();
  await row.getByRole('button', { name: 'Preview first 20 rows' }).click();
  const preview = page.getByRole('dialog');
  await expect(preview.getByText('First 20 of 32 rows')).toBeVisible();
  await preview.getByRole('textbox', { name: 'Search raw values' }).fill('a-value-absent-from-the-fixture');
  await expect(preview.getByText('No matching rows.')).toBeVisible();
  await preview.getByRole('button', { name: 'Close raw data' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row.getByRole('button', { name: 'Download original CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${name}.csv`);
  expect(await readFile(await download.path())).toEqual(await readFile(new URL('../fixtures/round2-demo.csv', import.meta.url)));

  await row.getByRole('button', { name: 'Rename', exact: true }).click();
  const renamed = `${name}-renamed`;
  await page.getByRole('textbox', { name: 'New dataset name' }).fill(renamed);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const actions = page.getByLabel(`Actions for ${renamed}`, { exact: true });
  await actions.click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete dataset?' });
  await expect(confirmation).toContainText(renamed);
  await confirmation.getByRole('button', { name: 'Delete dataset' }).click();
  await expect(actions).toHaveCount(0);
});

test('rejects a CSV without enough numeric features', async ({ page }) => {
  await openDemoPage(page, '/#/datasets');
  const datasets = page.getByRole('main', { name: 'Datasets' });
  await expect(datasets.getByRole('button', { name: 'Import CSV', exact: true })).toBeEnabled();
  const invalid = fileURLToPath(new URL('../fixtures/invalid.csv', import.meta.url));
  await datasets.locator('input[type="file"]').setInputFiles(invalid);
  await expect(page.getByRole('alert')).toContainText('Could not open CSV');
  await expect(datasets.getByLabel('Actions for invalid', { exact: true })).toHaveCount(0);
});

test('opens a CSV for the current demo session when storage is unavailable', async ({ page }) => {
  await openDemoPage(page, '/#/datasets');
  const datasets = page.getByRole('main', { name: 'Datasets' });
  await expect(datasets.getByRole('button', { name: 'Import CSV', exact: true })).toBeEnabled();
  await page.route('**/api/datasets/upload', route => route.fulfill({ status: 503, json: {
    success: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Storage is unavailable.' },
  } }));
  const buffer = await readFile(new URL('../fixtures/round2-demo.csv', import.meta.url));
  await datasets.locator('input[type="file"]').setInputFiles({ name: 'demo-fallback.csv', mimeType: 'text/csv', buffer });
  const row = datasets.getByRole('listitem').filter({ has: page.getByRole('heading', { name: /^demo-fallback\.csv\b/ }) });
  await expect(row).toContainText('Session only');
  await expect(datasets.getByRole('status')).toContainText('CSV opened for this session.');
});
