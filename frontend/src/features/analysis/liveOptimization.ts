/**
 * Live Step-by-Step Optimization for t-SNE in 3D
 * Enables real-time animation where points are seen moving and clustering dynamically in 3D space.
 */

export interface LiveTSNEState {
  matrix: number[][];
  n: number;
  d: number;
  perplexity: number;
  learningRate: number;
  currentIter: number;
  maxIter: number;
  P: Float64Array;
  Y: Float64Array; // 3D coordinates (n * 3)
  gains: Float64Array;
  uY: Float64Array; // velocity/momentum
  isCompleted: boolean;
}

export function initLiveTSNE(
  matrix: number[][],
  perplexity: number = 30,
  learningRate: number = 100,
  maxIter: number = 300
): LiveTSNEState {
  const n = matrix.length;
  const d = n > 0 ? matrix[0].length : 0;
  const perp = Math.min(perplexity, Math.floor((n - 1) / 3));

  if (n === 0) {
    return {
      matrix,
      n: 0,
      d: 0,
      perplexity: perp,
      learningRate,
      currentIter: 0,
      maxIter,
      P: new Float64Array(0),
      Y: new Float64Array(0),
      gains: new Float64Array(0),
      uY: new Float64Array(0),
      isCompleted: true,
    };
  }

  // 1. Compute Pairwise Squared Distances
  const distSq = new Float64Array(n * n);
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

  // 2. Binary search for sigma
  const P = new Float64Array(n * n);
  const targetEntropy = Math.log(perp);

  for (let i = 0; i < n; i++) {
    let betaMin = -Infinity;
    let betaMax = Infinity;
    let beta = 1.0;

    for (let tries = 0; tries < 30; tries++) {
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
        if (p > 1e-12) H -= p * Math.log(p);
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

  // Symmetrize P
  const twoN = 2 * n;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pSym = Math.max((P[i * n + j] + P[j * n + i]) / twoN, 1e-12);
      P[i * n + j] = pSym;
      P[j * n + i] = pSym;
    }
    P[i * n + i] = 0;
  }

  // Initialize positions with random scatter
  const Y = new Float64Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    Y[i] = (Math.random() - 0.5) * 20;
  }

  const gains = new Float64Array(n * 3).fill(1.0);
  const uY = new Float64Array(n * 3);

  return {
    matrix,
    n,
    d,
    perplexity: perp,
    learningRate,
    currentIter: 0,
    maxIter,
    P,
    Y,
    gains,
    uY,
    isCompleted: false,
  };
}

export function stepLiveTSNE(state: LiveTSNEState, numSteps: number = 5): [number, number, number][] {
  const { n, maxIter, P, Y, gains, uY, learningRate } = state;
  if (state.isCompleted || n === 0) return getCoordinates(Y, n);

  const qDist = new Float64Array(n * n);
  const grad = new Float64Array(n * 3);

  for (let s = 0; s < numSteps; s++) {
    if (state.currentIter >= maxIter) {
      state.isCompleted = true;
      break;
    }

    const iter = state.currentIter;
    const exaggeration = iter < 40 ? 4.0 : 1.0;
    const momentum = iter < 60 ? 0.5 : 0.8;

    // Student-t probabilities
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

    // Gradients
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

    // Adaptive Update
    for (let i = 0; i < n * 3; i++) {
      const g = grad[i];
      const u = uY[i];
      if (Math.sign(g) !== Math.sign(u)) {
        gains[i] += 0.2;
      } else {
        gains[i] = Math.max(gains[i] * 0.8, 0.01);
      }
      uY[i] = momentum * u - learningRate * gains[i] * g;
      Y[i] += uY[i];
    }

    state.currentIter++;
  }

  return getCoordinates(Y, n);
}

function getCoordinates(Y: Float64Array, n: number): [number, number, number][] {
  const res: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    res.push([Y[i * 3], Y[i * 3 + 1], Y[i * 3 + 2]]);
  }
  return res;
}
