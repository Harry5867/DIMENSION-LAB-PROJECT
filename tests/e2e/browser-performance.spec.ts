import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openAnalysisDataset } from './support';

test('records analysis and interactive 3D frame timings', async ({ page }, info) => {
  test.skip(process.env.LAB_E2E_BROWSER_PERF !== '1', 'Opt in to measure the local Chromium and GPU.');
  await openAnalysisDataset(page, 'browser-performance');
  await page.getByRole('button', { name: /^Clustering/ }).click();
  await page.getByRole('button', { name: 'No clustering', exact: true }).click();
  const started = performance.now();
  await page.getByRole('button', { name: 'Run analysis', exact: true }).click();
  await expect(page.getByText(/Projection complete: PCA/)).toBeVisible();
  const analysisMs = Math.round(performance.now() - started);

  const canvas = page.locator('canvas').filter({ visible: true }).first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The 3D canvas was not laid out.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    const [samples] = await Promise.all([
      page.evaluate(() => new Promise<number[]>(resolve => {
        const deltas: number[] = [];
        let previous: number | undefined;
        function sample(now: number) {
          if (previous !== undefined) deltas.push(now - previous);
          previous = now;
          if (deltas.length < 60) requestAnimationFrame(sample);
          else resolve(deltas.sort((a, b) => a - b));
        }
        requestAnimationFrame(sample);
      })),
      page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.58, { steps: 60 }),
    ]);
    const durationMs = samples.reduce((sum, ms) => sum + ms, 0);
    const result = { analysisMs, frames: samples.length, averageFps: Math.round(1000 * samples.length / durationMs),
      p95FrameMs: samples[Math.ceil(samples.length * 0.95) - 1], framesAbove32Ms: samples.filter(ms => ms > 32).length };
    const path = info.outputPath('browser-performance.json');
    await writeFile(path, JSON.stringify(result, null, 2) + '\n');
    await info.attach('browser-performance.json', { path, contentType: 'application/json' });
    console.log(JSON.stringify(result));
  } finally { await page.mouse.up(); }
});
