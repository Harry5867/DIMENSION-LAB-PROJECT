import { expect, test } from '@playwright/test';

test('reveals Welcome controls after the intro', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const welcome = page.locator('.welcome-page');
  await expect(welcome).toHaveAttribute('data-genesis', 'true');
  await expect(page.getByRole('button', { name: 'ENTER THE LAB' })).toHaveCount(0);
  await expect(welcome).not.toHaveAttribute('data-genesis', 'true', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Dimension Lab welcome' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ENTER THE LAB' })).toBeEnabled();
});

test('toggles the theme across reloads and opens a Welcome concept', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Switch to (light|dark) mode$/ });
  const before = await toggle.getAttribute('aria-label');
  const after = before === 'Switch to light mode' ? 'Switch to dark mode' : 'Switch to light mode';
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(after);
  await page.reload();
  await expect(toggle).toHaveAccessibleName(after);
  await page.getByRole('button', { name: 'Discover data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close concept' }).click();
  await expect(page.getByRole('heading', { name: 'Data', exact: true })).toBeHidden();
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

test('loads Terrain, changes elevation, and resets the visualization', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('group', { name: 'Visualization mode' }).getByRole('button', { name: 'Terrain' }).click();
  const terrain = page.getByRole('complementary', { name: 'Terrain controls' });
  const elevation = terrain.getByRole('slider', { name: 'Elevation intensity' });
  await expect(elevation).toHaveValue('0.85', { timeout: 20_000 });
  await elevation.press('Home');
  await expect(elevation).toHaveValue('0');
  await terrain.getByRole('button', { name: 'Reset visualization' }).click();
  await expect(elevation).toHaveValue('0.85');
});

test('filters Stories by topic and opens a story from the directory', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('group', { name: 'Visualization mode' }).getByRole('button', { name: 'Stories' }).click();
  const stories = page.getByRole('complementary', { name: 'Story controls' });
  await expect(stories.getByRole('status')).toContainText('21 stories');
  await stories.getByRole('combobox', { name: 'Topic' }).selectOption('Healthcare');
  await expect(stories.getByRole('status')).toContainText('3 stories');
  await stories.getByText('Browse stories', { exact: true }).click();
  const directory = stories.getByRole('combobox', { name: 'Choose a story' });
  await directory.selectOption({ index: 1 });
  await expect(stories.getByRole('region').getByRole('heading')).toBeVisible();
  await stories.getByRole('button', { name: 'Close story details' }).click();
  await expect(stories.getByRole('region')).toBeHidden();
});
