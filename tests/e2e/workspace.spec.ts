import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../packages/contracts/src/demo';
import { openAnalysisDataset, openDemoPage } from './support';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(DEMO_EMAIL);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
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

async function expectGlass(control: Locator) {
  await control.hover();
  await expect.poll(() => control.evaluate(element => {
    const lens = getComputedStyle(element, '::after');
    return lens.content !== 'none' && lens.display !== 'none' && Number(lens.opacity) > 0
      && lens.backgroundImage.includes('radial-gradient') && parseFloat(lens.height) > 20;
  })).toBe(true);
}

test('uses the welcome rim on Google sign-in and glass on the return arrow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/api/auth/options', route => route.fulfill({
    json: { success: true, data: { mode: 'atlas', google: true, registration: true } },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB', exact: true }).click();
  const google = page.getByRole('link', { name: 'Continue with Google' });
  await google.hover();
  await expect.poll(() => google.evaluate(link => getComputedStyle(link, '::after').animationName)).toBe('welcome-pill-rim');
  await expectGlass(page.getByRole('button', { name: 'Back to welcome' }));
});

test('manual enrollment verifies a code after the password step and keeps Google on the email screen', async ({ page }) => {
  await page.route('**/api/auth/options', route => route.fulfill({ json: { success: true, data: { mode: 'atlas', google: true, registration: false } } }));
  await page.route('**/api/auth/login', route => route.fulfill({ status: 202, json: { success: true, data: { verificationRequired: true, challenge: 'test-challenge' } } }));
  await page.route('**/api/auth/verify-email', route => {
    const verified = route.request().postDataJSON().code === '123456';
    return route.fulfill({ status: verified ? 200 : 401, json: verified
      ? { success: true, data: { authenticated: true } }
      : { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid verification code.' } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  await page.getByLabel('Email address').fill('new-user@example.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('a new test password');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const code = page.getByLabel('Verification code');
  await expect(code).toBeFocused();
  await code.fill('000000');
  await code.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Invalid or expired code');
  await code.fill('123456');
  await code.press('Enter');
  await expect(page).toHaveURL(/#\/overview$/);
});

test('signs in to the workspace with the demo account', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('link', { name: 'Model', exact: true })).toBeVisible();
});

test('rejects incorrect credentials, restores a valid session, and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE LAB', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('reader@invalid');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address and try again.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email address', { exact: true }).fill(DEMO_EMAIL);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toBeFocused();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveCount(0);
  await password.fill('wrong-demo-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');

  await password.fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Workspace sections' });
  await expect(navigation).toBeVisible();
  await page.reload();
  await expect(navigation).toBeVisible();
  const enter = page.getByRole('button', { name: 'ENTER THE LAB', exact: true });
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  await page.getByRole('button', { name: 'Back to welcome', exact: true }).click();
  await expect(enter).toBeVisible();
  await expect(signOut).toBeVisible();
  await enter.click();
  await expect(navigation).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expectGlass(page.getByRole('button', { name: 'Back to welcome', exact: true }));
  await page.getByRole('button', { name: 'Back to welcome', exact: true }).click();
  await expect(enter).toBeVisible();
  await signOut.click();
  const confirm = page.getByRole('alertdialog', { name: 'Sign out?' });
  await expect(confirm).toContainText('Signed in as ' + DEMO_EMAIL);
  await expect(confirm).toHaveAccessibleDescription("You'll need to sign in again to use the workspace.");
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(confirm).toBeHidden();
  await signOut.click();
  const cancel = confirm.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeFocused();
  await expectGlass(cancel);
  await cancel.click();
  await expect(confirm).toBeHidden();
  await expect(signOut).toBeVisible();
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 503 }), { times: 1 });
  await signOut.click();
  await confirm.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not sign out');
  await expect(signOut).toBeVisible();
  await signOut.click();
  const teamLogo = await confirm.locator('img').getAttribute('src');
  let releaseLogout!: () => void;
  const pendingLogout = new Promise<void>(resolve => { releaseLogout = resolve; });
  await page.route('**/api/auth/logout', async route => {
    await pendingLogout;
    await route.continue();
  }, { times: 1 });
  const signOutStarted = performance.now();
  await confirm.getByRole('button', { name: 'Sign out', exact: true }).click();
  const veil = page.locator('.welcome-signout-veil');
  try {
    await expect(veil).toBeVisible();
    await expect(veil.locator('img')).toHaveAttribute('src', teamLogo ?? '');
    await expect(veil.locator('.welcome-signout-mark > span:last-child')).toHaveCSS('animation-duration', '1.2s');
  } finally {
    releaseLogout();
  }
  await expect(veil).toBeHidden();
  expect(performance.now() - signOutStarted).toBeGreaterThanOrEqual(3500);
  await expect(confirm).toBeHidden();
  await expect(signOut).toHaveCount(0);
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

test('updates the database status when the API health check stops succeeding', async ({ page }) => {
  await openDemoPage(page, '/#/explore');
  await page.getByRole('button', { name: 'Workspace help', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'Workspace help' });
  await expect(help.getByText('In-Memory (Ready for MongoDB)', { exact: true })).toBeVisible();

  await page.route('**/api/health', route => route.fulfill({ status: 503, json: { success: false } }));
  await help.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(help.getByText('Browser only', { exact: true })).toBeVisible();
});

test('opens a member profile from About Us', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'About us', exact: true }).click();
  await page.getByRole('link', { name: 'View the profile of Nguyen Xuan Anh Kiet', exact: true }).click();
  await expect(page).toHaveURL(/#\/about\/nguyen-xuan-anh-kiet$/);
  await expect(page.getByRole('heading', { name: 'Nguyen Xuan Anh Kiet', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Responsibilities', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to team', exact: true }).click();
  await expect(page).toHaveURL(/#\/about\?member=nguyen-xuan-anh-kiet$/);
});
