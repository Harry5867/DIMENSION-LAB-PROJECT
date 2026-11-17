import { expect, test } from '@playwright/test';
import { openDemoPage } from './support';

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
  await expect(page.getByRole('heading', { name: 'Your first exploration.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Model', exact: true }).click();
  await expect(page).toHaveURL(/#\/explore$/);
});

test('switches prepared dataset examples and downloads the source CSV', async ({ page }) => {
  await openDemoPage(page, '/#/overview');
  const shortcuts = page.getByRole('navigation', { name: 'Workspace sections' });
  await shortcuts.getByRole('link', { name: 'Datasets', exact: true }).click();
  const picker = page.getByRole('group', { name: 'Choose a prepared dataset' });
  const wholesale = picker.getByRole('button', { name: 'Wholesale Customers' });
  await wholesale.click();
  await expect(wholesale).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Wholesale Customers', exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download source CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('wholesale.csv');
});
