/**
 * t-Distributed Stochastic Neighbor Embedding (t-SNE) in 3D
 * Pure TypeScript implementation optimized for client-side exploration.
 */

export interface TSNEConfig {
  perplexity: number;
  learningRate: number;
  iterations: number;
}

export function computeTSNE(
  matrix: number[][],
  config: TSNEConfig,
  onProgress?: (iter: number, total: number) => void
): [number, number, number][] {
  const n = matrix.length;
  if (n === 0) return [];
  if (n <= 3) {
    return matrix.map(row => [row[0] || 0, row[1] || 0, row[2] || 0]);
  }

  const d = matrix[0].length;
  const perp = Math.min(config.perplexity || 30, Math.floor((n - 1) / 3));
  const eta = config.learningRate || 100;
  const maxIter = Math.min(config.iterations || 250, 500);

  // 1. Compute Pairwise Squared Euclidean Distances
  const distSq: Float64Array = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < d; k++) {
        const diff = matrix[i][k] - matrix[j][k];
        sum += diff * diff;
      }
      distSq[i * n + j] = sum;
      distSq[j * n + i] = sum;
    }
  }

  // 2. Binary search for sigma to match target perplexity
  const P = new Float64Array(n * n);
  const targetEntropy = Math.log(perp);

  for (let i = 0; i < n; i++) {
    let betaMin = -Infinity;
    let betaMax = Infinity;
    let beta = 1.0; // beta = 1 / (2 * sigma^2)
    const maxTries = 40;

    for (let tries = 0; tries < maxTries; tries++) {
      let sumPi = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const p = Math.exp(-distSq[i * n + j] * beta);
        P[i * n + j] = p;
        sumPi += p;
      }

      if (sumPi === 0) sumPi = 1e-12;

      let H = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const p = P[i * n + j] / sumPi;
        P[i * n + j] = p;
        if (p > 1e-12) {
          H -= p * Math.log(p);
        }
      }

      const hDiff = H - targetEntropy;
      if (Math.abs(hDiff) < 1e-4) break;

      if (hDiff > 0) {
        betaMin = beta;
        beta = betaMax === Infinity ? beta * 2 : (beta + betaMax) / 2;
      } else {
        betaMax = beta;
        beta = betaMin === -Infinity ? beta / 2 : (beta + betaMin) / 2;
      }
    }
  }

  // 3. Symmetrize P: P_ij = (p_j|i + p_i|j) / (2 * n)
  const twoN = 2 * n;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pSym = Math.max((P[i * n + j] + P[j * n + i]) / twoN, 1e-12);
      P[i * n + j] = pSym;
      P[j * n + i] = pSym;
    }
    P[i * n + i] = 0;
  }

  // 4. Initialize 3D positions with small random values
  const Y = new Float64Array(n * 3);
  const gains = new Float64Array(n * 3).fill(1.0);
  const uY = new Float64Array(n * 3); // velocity/momentum

  for (let i = 0; i < n * 3; i++) {
    Y[i] = (Math.random() - 0.5) * 1e-3;
  }

  // 5. Optimization Loop (Gradient Descent)
  const qDist = new Float64Array(n * n);
  const grad = new Float64Array(n * 3);

  for (let iter = 0; iter < maxIter; iter++) {
    // Early exaggeration for first 50 iterations
    const exaggeration = iter < 50 ? 4.0 : 1.0;
    const momentum = iter < 100 ? 0.5 : 0.8;

    // Compute Q matrix (Student-t distribution, degree of freedom = 1)
    let sumQ = 0;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < n; j++) {
        const j3 = j * 3;
        const dx = Y[i3] - Y[j3];
        const dy = Y[i3 + 1] - Y[j3 + 1];
        const dz = Y[i3 + 2] - Y[j3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const q = 1 / (1 + d2);
        qDist[i * n + j] = q;
        qDist[j * n + i] = q;
        sumQ += 2 * q;
      }
    }
    if (sumQ === 0) sumQ = 1e-12;

    // Compute Gradients
    grad.fill(0);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const j3 = j * 3;
        const p = P[i * n + j] * exaggeration;
        const q = qDist[i * n + j] / sumQ;
        const mult = 4 * (p - q) * qDist[i * n + j];

        grad[i3] += mult * (Y[i3] - Y[j3]);
        grad[i3 + 1] += mult * (Y[i3 + 1] - Y[j3 + 1]);
        grad[i3 + 2] += mult * (Y[i3 + 2] - Y[j3 + 2]);
      }
    }

    // Adaptive gradient update with momentum (Jacobs method)
    for (let i = 0; i < n * 3; i++) {
      const g = grad[i];
      const u = uY[i];
      // Adapt gains
      if (Math.sign(g) !== Math.sign(u)) {
        gains[i] += 0.2;
      } else {
        gains[i] = Math.max(gains[i] * 0.8, 0.01);
      }
      uY[i] = momentum * u - eta * gains[i] * g;
      Y[i] += uY[i];
    }

    if (onProgress && iter % 25 === 0) {
      onProgress(iter, maxIter);
    }
  }

  // Format result as array of [x, y, z]
  const result: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    result.push([Y[i * 3], Y[i * 3 + 1], Y[i * 3 + 2]]);
  }

  return result;
}
