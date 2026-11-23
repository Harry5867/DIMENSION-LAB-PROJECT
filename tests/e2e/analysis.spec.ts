import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openAnalysisDataset } from './support';

async function runClustering(page: Page, reduction: string, clustering: string) {
  await page.getByRole('button', { name: /^Reduction/ }).click();
  await page.getByRole('button', { name: reduction, exact: true }).click();
  await page.getByRole('button', { name: /^Clustering/ }).click();
  await page.getByRole('button', { name: clustering, exact: true }).click();
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.getByText(`Finished ${reduction} → ${clustering}. Select a cluster to explore.`)).toBeVisible({ timeout: 25_000 });
}

for (const { reduction, clustering, dataset } of [
  { reduction: 'UMAP', clustering: 'DBSCAN', dataset: 'browser-umap-dbscan' },
  { reduction: 't-SNE', clustering: 'GMM', dataset: 'browser-tsne-gmm' },
]) {
  test(`runs ${reduction} and ${clustering} on an imported CSV`, async ({ page }) => {
    test.setTimeout(70_000);
    await openAnalysisDataset(page, dataset);
    await runClustering(page, reduction, clustering);
  });
}

test('runs PCA and K-Means, controls the 3D view, exports points, and restores a saved experiment', async ({ page }) => {
  test.setTimeout(180_000);
  const dataset = 'browser-experiment-history';
  await openAnalysisDataset(page, dataset);
  await runClustering(page, 'PCA', 'K-Means');

  const view = page.getByRole('group', { name: '3D view controls' });
  const centroids = view.getByRole('button', { name: 'Show centroids', exact: true });
  const initial = await centroids.getAttribute('aria-pressed');
  await centroids.click();
  await expect(centroids).toHaveAttribute('aria-pressed', initial === 'true' ? 'false' : 'true');
  await view.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(view.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export', exact: true });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Point data .csv' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.trim().split(/\r?\n/)).toHaveLength(33);
  await expect(dialog).toBeHidden();

  const insights = page.getByRole('complementary', { name: 'Exploration insights' });
  await insights.getByText('More insights', { exact: true }).click();
  await insights.getByRole('button', { name: 'Save experiment', exact: true }).click();
  await expect(page.getByText('Experiment saved.', { exact: true })).toBeVisible();
  await insights.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL(/#\/experiments$/);
  await page.getByRole('textbox', { name: 'Search experiments' }).fill(dataset);
  const record = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: dataset, exact: true }) });
  await record.getByText('Saved configuration', { exact: true }).click();
  await expect(record.getByText('PCA · K-Means', { exact: true })).toBeVisible();
  await record.getByRole('button', { name: 'Restore settings', exact: true }).click();
  await expect(page).toHaveURL(/#\/explore$/);
  await expect(page.getByText('Configuration restored. Run analysis to generate new results.', { exact: true })).toBeVisible();
});

test('runs Isolation Forest and saves the anomaly analysis for the demo session', async ({ page }) => {
  test.setTimeout(70_000);
  await openAnalysisDataset(page, 'browser-anomaly');
  await page.getByRole('button', { name: /^Anomaly Detection/ }).click();
  await page.getByRole('button', { name: 'Run Isolation Forest' }).click();
  const result = page.getByRole('dialog', { name: 'Anomaly Detection · Isolation Forest' });
  await expect(result.getByRole('heading', { name: 'Anomaly score distribution' })).toBeVisible({ timeout: 25_000 });
  await expect(result.getByRole('region', { name: 'Summary statistics' })).toContainText(/Rows analyzed\s*32/);
  await result.getByRole('button', { name: 'Save for this session' }).click();
  await expect(result.getByRole('status')).toHaveText('Saved for this demo session.');
  await result.getByRole('button', { name: 'Close analysis dashboard' }).click();
  await expect(result).toBeHidden();
});

test('runs Apriori and inspects the members of a rule', async ({ page }) => {
  test.setTimeout(70_000);
  await openAnalysisDataset(page, 'browser-apriori');
  await page.getByRole('button', { name: /^Association Rules/ }).click();
  await page.getByRole('spinbutton', { name: 'Minimum confidence (0–1)' }).fill('0.3');
  await page.getByRole('button', { name: 'Run Apriori' }).click();
  const result = page.getByRole('dialog', { name: 'Association Rules · Apriori' });
  await expect(result.getByRole('region', { name: 'Summary statistics' })).toContainText(/Transactions\s*32/, { timeout: 25_000 });
  const rules = result.getByRole('table', { name: 'Association rules' });
  await rules.getByRole('button', { name: / → / }).first().click();
  await expect(result.getByRole('heading', { name: 'Selected rule' })).toBeVisible();
  await expect(result.getByRole('table', { name: 'Rule members' })).toBeVisible();
});
