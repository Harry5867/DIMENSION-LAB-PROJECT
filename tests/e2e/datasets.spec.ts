import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openDemoPage, uploadCsv } from './support';

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
  const invalid = fileURLToPath(new URL('../fixtures/invalid.csv', import.meta.url));
  await datasets.locator('input[type="file"]').setInputFiles(invalid);
  await expect(page.getByRole('alert')).toContainText('Could not open CSV');
  await expect(datasets.getByLabel('Actions for invalid', { exact: true })).toHaveCount(0);
});
