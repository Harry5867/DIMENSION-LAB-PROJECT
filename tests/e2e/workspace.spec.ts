import { expect, test, type Page } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../packages/contracts/src/demo';
import { openAnalysisDataset } from './support';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(DEMO_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login'
      && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page).toHaveURL(/#\/overview$/);
  await expect(page.getByRole('navigation', { name: 'Workspace sections' })).toBeVisible();
}

test('signs in to the workspace with the demo account', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('link', { name: 'Model', exact: true })).toBeVisible();
});

test('rejects incorrect credentials, restores a valid session, and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(DEMO_EMAIL);
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('wrong-demo-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');

  await page.getByRole('button', { name: 'Use demo account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Workspace sections' });
  await expect(navigation).toBeVisible();
  await page.reload();
  await expect(navigation).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const enter = page.getByRole('button', { name: 'ENTER THE LAB', exact: true });
  await expect(enter).toBeVisible();
  await page.goto('/#/datasets');
  await expect(enter).toBeVisible();
  await expect(page.getByRole('main', { name: 'Datasets' })).toBeHidden();
});

test('imports a CSV through the API and runs a PCA projection', async ({ page }) => {
  await openAnalysisDataset(page, 'browser-pca-only');
  await page.getByRole('button', { name: /^Reduction.*PCA/i }).click();
  await expect(page.getByRole('button', { name: 'PCA', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Clustering/ }).click();
  await page.getByRole('button', { name: 'No clustering', exact: true }).click();
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.getByText(/Projection complete: PCA/)).toBeVisible();
});

test('opens a member profile from About Us', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'About us', exact: true }).click();
  await page.getByRole('link', { name: 'View the profile of Nguyen Xuan Anh Kiet', exact: true }).click();
  await expect(page).toHaveURL(/#\/about\/nguyen-xuan-anh-kiet$/);
  await expect(page.getByRole('heading', { name: 'Nguyen Xuan Anh Kiet', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Interests', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to team', exact: true }).click();
  await expect(page).toHaveURL(/#\/about\?member=nguyen-xuan-anh-kiet$/);
});
