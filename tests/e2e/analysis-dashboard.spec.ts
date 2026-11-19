import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openAnalysisDataset, openDemoPage } from './support';

test.describe.configure({ timeout: 90_000 });

test('exports a searchable 3D dashboard for a newly uploaded CSV and opens the HTML offline', async ({ page, context }, info) => {
  const dataset = 'dashboard-upload-' + info.retry;
  await openAnalysisDataset(page, dataset);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export', exact: true });
  await expect(exportDialog.getByRole('button', { name: /Analysis Dashboard/ })).toBeDisabled();
  await exportDialog.getByRole('button', { name: 'Close export' }).click();
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.locator('.workspace-viewing')).toContainText('PCA / K-Means');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await exportDialog.getByRole('button', { name: /Analysis Dashboard/ }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(exportDialog).toHaveCount(0);
  const dashboard = page.getByRole('main', { name: 'Analysis Dashboard' });
  const preview = dashboard.frameLocator('iframe');
  await expect(preview.getByRole('heading', { name: dataset, exact: true })).toBeVisible();
  await expect(preview.getByRole('heading', { name: 'PCA explained variance' })).toBeVisible();
  await expect(preview.getByRole('columnheader', { name: 'PC1', exact: true })).toBeInViewport();
  await expect(preview.locator('#row-count')).toContainText('of 32 points');
  await expect(preview.getByRole('columnheader', { name: 'Source · feature_d', exact: true })).toHaveCount(0);
  await expect(dashboard.getByLabel('Include original CSV columns')).toBeHidden();
  await preview.getByRole('button', { name: 'Point details', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Point details', exact: true })).toBeFocused();
  const cluster = preview.getByRole('button', { name: /^Cluster 0 / });
  await cluster.click();
  await expect(cluster).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.getByLabel('Filter by cluster')).toHaveValue('0');
  await preview.getByLabel('Search points').fill('no-matching-point-value');
  await expect(preview.getByText('No matching points.')).toBeVisible();

  const canvas = preview.locator('canvas');
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).width)).toBeGreaterThan(300);
  await expect(canvas).toBeVisible();
  const zoomLevel = preview.locator('#zoom-level');
  await preview.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomLevel).toHaveText('120%');
  await preview.getByRole('button', { name: 'Reset view' }).click();
  await expect(zoomLevel).toHaveText('100%');
  await canvas.focus();
  await canvas.evaluate(el => { el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, cancelable: true })); });
  await expect(zoomLevel).toHaveText('122%');
  const image = await canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
  await canvas.press('ArrowRight');
  await expect.poll(() => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL())).not.toEqual(image);
  const [download] = await Promise.all([page.waitForEvent('download'), dashboard.getByRole('button', { name: 'Download HTML' }).click()]);
  expect(download.suggestedFilename()).toBe(dataset + '_dashboard.html');
  const filename = info.outputPath(download.suggestedFilename());
  await download.saveAs(filename);
  expect(await readFile(filename, 'utf8')).not.toContain('"source":{"columns"');

  await dashboard.getByText('Export options', { exact: true }).click();
  await dashboard.getByLabel('Include original CSV columns').check();
  await expect(preview.getByRole('columnheader', { name: 'Source · feature_d', exact: true })).toHaveCount(1);
  await dashboard.getByRole('link', { name: 'Back to results' }).click();
  await expect(page).toHaveURL(/#\/explore$/);
  await expect(page.locator('.workspace-viewing')).toContainText('PCA / K-Means');

  const offline = await context.newPage();
  await context.setOffline(true);
  await offline.goto(pathToFileURL(filename).href);
  await expect(offline.getByRole('heading', { name: dataset, exact: true })).toBeVisible();
  await offline.getByLabel('Filter by cluster').selectOption('0');
  await expect(offline.getByRole('button', { name: /^Cluster 0 / })).toHaveAttribute('aria-pressed', 'true');
  await offline.close();
  await context.setOffline(false);
});

test('dashboard shows the fitted GMM metrics on a sample dataset', async ({ page }) => {
  await openDemoPage(page, '/#/explore?dataset=wheat_seeds');
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.locator('.workspace-viewing')).toContainText('PCA / GMM');
  await page.getByRole('button', { name: /^Clustering/ }).click();
  await page.getByRole('button', { name: 'No clustering', exact: true }).click();
  await page.getByRole('button', { name: 'Export previous result', exact: true }).click();
  await page.getByRole('button', { name: /Analysis Dashboard/ }).click();
  const preview = page.getByRole('main', { name: 'Analysis Dashboard' }).frameLocator('iframe');
  await expect(preview.getByRole('heading', { name: 'Wheat Seeds', exact: true })).toBeVisible();
  const projection = preview.getByRole('region', { name: '3D projection' });
  const configuration = preview.getByRole('region', { name: 'Run configuration' });
  const canvas = preview.locator('canvas');
  const plotHeight = (await canvas.boundingBox())?.height ?? 0;
  await preview.getByText('Algorithm details', { exact: true }).click();
  await expect(preview.getByText('Original GMM fit', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const plot = await projection.boundingBox(), config = await configuration.boundingBox();
    return plot && config ? Math.abs(plot.y + plot.height - config.y - config.height) : Infinity;
  }).toBeLessThan(2);
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(plotHeight);
  await expect(preview.getByRole('columnheader', { name: 'GMM confidence', exact: true })).toHaveCount(1);
  await expect(preview.locator('#row-count')).toContainText('of 210 points');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const plot = await projection.boundingBox(), config = await configuration.boundingBox();
    return Boolean(plot && config && plot.y + plot.height < config.y);
  }).toBe(true);
  await expect(page.getByRole('button', { name: 'Download HTML' })).toBeInViewport();
  await expect(preview.getByRole('button', { name: 'Point details', exact: true })).toBeInViewport();
  await preview.getByRole('button', { name: 'Point details', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'Point details', exact: true })).toBeInViewport();
});

test('a dashboard opened in a fresh session links back to Explore', async ({ page }) => {
  await openDemoPage(page, '/#/dashboard');
  await expect(page.getByRole('heading', { name: 'No analysis result in this session' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Explore', exact: true }).click();
  await expect(page).toHaveURL(/#\/explore$/);
});
