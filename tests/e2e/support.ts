import { expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getApiDataRecord } from '../../frontend/src/shared/api/typeGuards';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../packages/contracts/src/demo';

export async function openDemoPage(page: Page, route: string) {
  const response = await page.request.post('/api/auth/login', {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(response.ok()).toBe(true);
  const token = getApiDataRecord(await response.json())?.token;
  if (typeof token !== 'string') throw new Error('Demo login did not return a token');
  // The app restores demo sessions from sessionStorage on navigation.
  await page.goto('/api/health');
  await page.evaluate(token => sessionStorage.setItem('dimension-lab-workspace-session', token), token);
  await page.goto(route);
}

export async function uploadCsv(page: Page, name: string): Promise<Locator> {
  const datasets = page.getByRole('main', { name: 'Datasets' });
  await expect(datasets).toBeVisible();
  const buffer = await readFile(new URL('../fixtures/round2-demo.csv', import.meta.url));
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/datasets/upload'
      && response.request().method() === 'POST'),
    datasets.locator('input[type="file"]').setInputFiles({ name: `${name}.csv`, mimeType: 'text/csv', buffer }),
  ]);
  expect(response.status()).toBe(201);
  const row = datasets.getByRole('listitem').filter({ has: page.getByLabel(`Actions for ${name}`, { exact: true }) });
  await expect(row).toBeVisible();
  return row;
}

export async function openAnalysisDataset(page: Page, name: string) {
  await openDemoPage(page, '/#/datasets');
  const row = await uploadCsv(page, name);
  await row.getByRole('button', { name: 'Open Explore', exact: true }).click();
  await expect(page).toHaveURL(/#\/explore$/);
}
