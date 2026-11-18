import { expect, test } from '@playwright/test';

test('reveals Welcome controls after the intro', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const welcome = page.locator('.welcome-page');
  await expect(welcome).toHaveAttribute('data-genesis', 'true');
  const ribbons = welcome.locator('.welcome-brand .team-logo-ribbon');
  await expect(ribbons).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'ENTER THE LAB' })).toHaveCount(0);
  await expect(welcome).not.toHaveAttribute('data-genesis', 'true', { timeout: 30_000 });
  await expect(ribbons).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Dimension Lab welcome' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ENTER THE LAB' })).toBeEnabled();
});

test('persists the theme across reloads on the simplified Welcome header', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Switch to (light|dark) mode$/ });
  const before = await toggle.getAttribute('aria-label');
  const after = before === 'Switch to light mode' ? 'Switch to dark mode' : 'Switch to light mode';
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(after);
  await page.reload();
  await expect(toggle).toHaveAccessibleName(after);
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Dimension Lab welcome' })).toBeVisible();
  await expect(header.getByRole('button')).toHaveCount(1);
});

test('searches for a capital and opens its Atlas details', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Find a capital', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Search capitals' }).fill('Hanoi');
  await page.getByRole('button', { name: /^Hanoi.*Vietnam$/i }).click();
  await expect(page.getByRole('heading', { name: 'Hanoi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close capital details' }).click();
  await expect(page.getByRole('heading', { name: 'Hanoi', exact: true })).toBeHidden();
});

test('changes an Atlas layer and keeps the selection when the menu reopens', async ({ page }) => {
  await page.goto('/');
  const layers = page.getByLabel('Layers', { exact: true });
  await layers.click();
  const grid = page.getByRole('checkbox', { name: 'Geographic Grid' });
  await expect(grid).toBeChecked();
  await grid.uncheck();
  await layers.click();
  await layers.click();
  await expect(grid).not.toBeChecked();
  await grid.check();
  await expect(grid).toBeChecked();
});

test('lets visitors skip the intro and focus the entrance to the lab', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.welcome-page')).toHaveAttribute('data-genesis', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'ENTER THE LAB' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Dimension Lab welcome' })).toBeVisible();
});
