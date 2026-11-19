import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { uploadCsv } from './support';

test('two accounts in the same browser have separate analysis history', async ({ page, baseURL }) => {
  test.skip(!process.env.LAB_E2E_HISTORY_MONGO_PORT, 'Requires the isolated local MongoDB test service.');
  test.setTimeout(90_000);
  const id = randomUUID();
  const headers = { Origin: baseURL! };
  const password = randomUUID();
  const accounts = ['first', 'second'].map(name => ({ email: `${name}-${id}@example.com`, password, displayName: name }));
  for (const data of accounts) {
    expect((await page.request.post('/api/auth/register', { headers, data })).status()).toBe(201);
  }
  const login = async (index: number) => {
    expect((await page.request.post('/api/auth/login', { headers, data: accounts[index] })).ok()).toBe(true);
    await page.goto('/#/datasets');
  };
  const logout = async () => {
    expect((await page.request.post('/api/auth/logout', { headers })).ok()).toBe(true);
    expect((await page.request.get('/api/unsupervised/history')).status()).toBe(401);
  };
  await page.goto('/api/health');
  await page.evaluate(() => localStorage.setItem('unsupervised-runs-v1', 'legacy private rows'));
  await login(0);
  const row = await uploadCsv(page, 'private-first');
  expect(await page.evaluate(() => localStorage.getItem('unsupervised-runs-v1'))).toBeNull();
  await row.getByRole('button', { name: 'Open Explore', exact: true }).click();
  await page.getByRole('button', { name: /^Anomaly Detection/ }).click();
  await page.getByRole('button', { name: 'Run Isolation Forest' }).click();
  const dialog = page.getByRole('dialog', { name: 'Anomaly Detection · Isolation Forest' });
  await dialog.getByRole('button', { name: 'Save to account' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Saved to your account.');
  await logout();
  await login(1);
  const second = await page.request.get('/api/unsupervised/history');
  expect(second.ok()).toBe(true);
  expect((await second.json()).data).toEqual([]);
  const secondDataset = await uploadCsv(page, 'private-second');
  await secondDataset.getByRole('button', { name: 'Open Explore', exact: true }).click();
  await page.getByRole('button', { name: /^Anomaly Detection/ }).click();
  await expect(page.getByText(/Analysis history \(/)).toHaveCount(0);
  await logout();
  await login(0);
  const first = await page.request.get('/api/unsupervised/history');
  expect((await first.json()).data).toMatchObject([{ dataset: expect.stringContaining('private-first') }]);
});
