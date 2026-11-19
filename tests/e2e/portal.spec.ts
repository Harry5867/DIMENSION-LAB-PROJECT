import { expect, test } from '@playwright/test';
import { openDemoPage, uploadCsv } from './support';
import { readFile } from 'node:fs/promises';

test('navigates Theory chapters and the User Guide from Workspace', async ({ page }) => {
  await openDemoPage(page, '/#/overview');
  const shortcuts = page.getByRole('navigation', { name: 'Workspace sections' });
  await shortcuts.getByRole('link', { name: 'Theory', exact: true }).click();
  await page.getByRole('link', { name: 'Open Clustering chapter' }).click();
  const methods = page.getByRole('navigation', { name: 'Algorithms in this chapter' });
  const gmm = methods.getByRole('link', { name: 'GMM', exact: true });
  await gmm.click();
  await expect(gmm).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: /How it works/ })).toBeVisible();
  await page.getByRole('link', { name: 'All chapters' }).click();
  await expect(page.getByRole('link', { name: 'Open Clustering chapter' })).toBeVisible();
  await page.getByRole('link', { name: 'Go back', exact: true }).click();
  await shortcuts.getByRole('link', { name: 'User Guide', exact: true }).click();
  await page.getByRole('link', { name: 'Quick Start with Wholesale Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Open Datasets', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open Model', exact: true }).click();
  await expect(page).toHaveURL(/#\/explore$/);
});

test('switches prepared dataset examples and downloads the source CSV', async ({ page }) => {
  await openDemoPage(page, '/#/overview');
  const shortcuts = page.getByRole('navigation', { name: 'Workspace sections' });
  await shortcuts.getByRole('link', { name: 'Datasets', exact: true }).click();
  const picker = page.getByRole('group', { name: 'Choose a prepared dataset' });
  await expect(picker.getByRole('button')).toHaveCount(7);
  const wholesale = picker.getByRole('button', { name: 'Wholesale Customers' });
  await wholesale.click();
  await expect(wholesale).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Wholesale Customers', exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download source CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('wholesale.csv');
  await picker.getByRole('button', { name: 'Handwritten Digits' }).click();
  await expect(page.getByRole('article', { name: 'Handwritten Digits' })).toContainText('900 ROWS');
  await page.getByRole('link', { name: 'Open in Model' }).click();
  await expect(page).toHaveURL(/#\/explore\?dataset=handwritten_digits$/);
  await expect(page.getByRole('button', { name: 'Run analysis', exact: true })).toBeEnabled();
});

test('syncs imported CSVs between the Datasets library and Model', async ({ page }) => {
  await openDemoPage(page, '/#/library');
  const imports = page.getByRole('region', { name: 'Imported datasets' });
  const name = 'library-csv-' + test.info().retry;
  const buffer = await readFile(new URL('../fixtures/round2-demo.csv', import.meta.url));
  await expect(imports.getByRole('button', { name: 'Import CSV' })).toBeEnabled();
  await imports.locator('input[type="file"]').setInputFiles({ name: name + '.csv', mimeType: 'text/csv', buffer });
  const entry = imports.getByRole('listitem').filter({ hasText: name });
  await expect(entry).toContainText('32 rows');
  await entry.getByRole('button', { name: 'Open Explore' }).click();
  await expect(page).toHaveURL(/#\/explore$/);

  await page.evaluate(() => { window.location.hash = '/datasets'; });
  const secondName = 'model-csv-' + test.info().retry;
  await uploadCsv(page, secondName);
  await page.evaluate(() => { window.location.hash = '/library'; });
  await expect(imports.getByRole('listitem').filter({ hasText: secondName })).toBeVisible();
  await expect(entry).toBeVisible();

  await page.reload();
  await expect(imports.getByRole('listitem').filter({ hasText: secondName })).toBeVisible();
});
