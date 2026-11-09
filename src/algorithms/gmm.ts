import { integer, randomSource, validateMatrix } from './unsupervised';
export interface GMMOptions { k: number; maxIterations?: number; tolerance?: number; seed?: number }
export interface GMMResult { clusters: number[]; probabilities: number[][]; means: number[][]; variances: number[][]; weights: number[]; logLikelihood: number; iterations: number; converged: boolean; aic: number; bic: number }
/** EM with diagonal covariance, variance floor and log-sum-exp responsibilities. */
export function computeGMM(data: number[][], options: GMMOptions): GMMResult {
  validateMatrix(data);
  const n = data.length, d = data[0].length, { k, maxIterations = 100, tolerance = 1e-5, seed = 42 } = options;
  integer(k, 1, Math.min(n, 100), 'Components'); integer(maxIterations, 1, 1000, 'Iterations');
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Tolerance must be positive.');
  const random = randomSource(seed), mean = Array(d).fill(0) as number[];
  data.forEach(row => row.forEach((v, j) => mean[j] += v / n));
  const global = mean.map((m, j) => Math.max(1e-6, data.reduce((s, row) => s + (row[j] - m) ** 2, 0) / n));
  const floor = global.map(v => Math.max(1e-9, v * 1e-6));
  const means = [[...data[Math.floor(random() * n)]]];
  while (means.length < k) {
    const distances = data.map(row => Math.min(...means.map(m => row.reduce((s, v, j) => s + (v - m[j]) ** 2, 0))));
    let target = random() * distances.reduce((a, b) => a + b, 0), index = n - 1;
    for (let i = 0; i < n; i++) { target -= distances[i]; if (target <= 0) { index = i; break; } }
    means.push([...data[index]]);
  }
  const variances = means.map(() => [...global]), weights = means.map(() => 1 / k);
  let probabilities: number[][] = [], logLikelihood = -Infinity, previous = -Infinity, converged = false, iterations = 0;
  const expectation = () => {
    logLikelihood = 0;
    probabilities = data.map(row => {
      const logs = means.map((m, c) => Math.log(Math.max(weights[c], 1e-300)) - 0.5 * row.reduce((s, v, j) => s + Math.log(2 * Math.PI * variances[c][j]) + (v - m[j]) ** 2 / variances[c][j], 0));
      const max = Math.max(...logs), sum = logs.reduce((s, v) => s + Math.exp(v - max), 0), normalizer = max + Math.log(sum);
      logLikelihood += normalizer; return logs.map(v => Math.exp(v - normalizer));
    });
  };
  for (; iterations < maxIterations;) {
    expectation();
    if (Number.isFinite(previous) && Math.abs(logLikelihood - previous) <= tolerance * (1 + Math.abs(previous))) { converged = true; break; }
    previous = logLikelihood;
    for (let c = 0; c < k; c++) {
      const mass = probabilities.reduce((s, p) => s + p[c], 0);
      if (mass < 1e-8) { means[c] = [...data[Math.floor(random() * n)]]; variances[c] = [...global]; weights[c] = 1 / n; continue; }
      weights[c] = mass / n;
      means[c] = mean.map((_, j) => data.reduce((s, row, i) => s + probabilities[i][c] * row[j], 0) / mass);
      variances[c] = mean.map((_, j) => Math.max(floor[j], data.reduce((s, row, i) => s + probabilities[i][c] * (row[j] - means[c][j]) ** 2, 0) / mass));
    }
    const total = weights.reduce((a, b) => a + b, 0); weights.forEach((v, c) => weights[c] = v / total); iterations++;
  }
  expectation();
  const parameters = k * 2 * d + k - 1;
  return { clusters: probabilities.map(p => p.indexOf(Math.max(...p))), probabilities, means, variances, weights, logLikelihood, iterations, converged, aic: 2 * parameters - 2 * logLikelihood, bic: Math.log(n) * parameters - 2 * logLikelihood };
}
