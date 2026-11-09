/**
 * Principal Component Analysis (PCA) Implementation in pure TypeScript.
 * Computes the Covariance Matrix and uses Power Iteration with Hotelling Deflation
 * to find the top 3 principal components and their explained variance ratios.
 */

export interface PCAResult {
  coordinates: [number, number, number][]; // 3D coordinates for each point
  explainedVariance: [number, number, number]; // Ratio for PC1, PC2, PC3
  totalExplainedVariance: number;
  components: number[][]; // 3 Eigenvectors of length d
}

export function computePCA(matrix: number[][]): PCAResult {
  const n = matrix.length;
  if (n === 0) {
    return {
      coordinates: [],
      explainedVariance: [0, 0, 0],
      totalExplainedVariance: 0,
      components: [[], [], []],
    };
  }

  const d = matrix[0].length;
  const numComponents = Math.min(3, d);

  // 1. Center the data (mean = 0)
  const means = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      means[j] += matrix[i][j];
    }
  }
  for (let j = 0; j < d; j++) {
    means[j] /= n;
  }

  const centered: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(d);
    for (let j = 0; j < d; j++) {
      row[j] = matrix[i][j] - means[j];
    }
    centered.push(row);
  }

  // 2. Compute Covariance Matrix: C = (X^T * X) / (n - 1)
  const cov: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const denom = n > 1 ? n - 1 : 1;

  for (let j1 = 0; j1 < d; j1++) {
    for (let j2 = j1; j2 < d; j2++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += centered[i][j1] * centered[i][j2];
      }
      const val = sum / denom;
      cov[j1][j2] = val;
      cov[j2][j1] = val; // Symmetric
    }
  }

  // Total variance is the trace of the covariance matrix
  let totalVariance = 0;
  for (let j = 0; j < d; j++) {
    totalVariance += cov[j][j];
  }
  const rankTolerance = totalVariance * Number.EPSILON * d * 16;

  // 3. Power Iteration with Hotelling Deflation to extract top 3 eigenvectors
  const eigenvectors: number[][] = [];
  const eigenvalues: number[] = [];

  // Deep copy cov matrix for deflation
  const deflatedCov = cov.map(row => [...row]);

  for (let comp = 0; comp < numComponents; comp++) {
    // Initialize random vector
    let v = new Float64Array(d);
    for (let j = 0; j < d; j++) {
      v[j] = Math.sin(j + comp + 1.5);
    }
    // Normalize v
    let norm = Math.hypot(...v);
    if (norm === 0) norm = 1;
    for (let j = 0; j < d; j++) v[j] /= norm;

    let lambda = 0;
    const maxIter = 100;
    const eps = 1e-8;

    for (let iter = 0; iter < maxIter; iter++) {
      // v_next = C * v
      const vNext = new Float64Array(d);
      for (let r = 0; r < d; r++) {
        let s = 0;
        for (let c = 0; c < d; c++) {
          s += deflatedCov[r][c] * v[c];
        }
        vNext[r] = s;
      }

      norm = Math.hypot(...vNext);
      if (norm <= rankTolerance) {
        lambda = 0;
        break;
      }

      lambda = norm;
      let diff = 0;
      for (let j = 0; j < d; j++) {
        const nextVal = vNext[j] / norm;
        diff += Math.abs(nextVal - v[j]);
        v[j] = nextVal;
      }

      if (diff < eps) break;
    }

    if (lambda <= rankTolerance) break;
    eigenvectors.push(Array.from(v));
    eigenvalues.push(Math.max(0, lambda));

    // Deflate: C_new = C - lambda * (v * v^T)
    for (let r = 0; r < d; r++) {
      for (let c = 0; c < d; c++) {
        deflatedCov[r][c] -= lambda * v[r] * v[c];
      }
    }
  }

  // Pad null directions with zero vectors so their scores cannot change distances.
  while (eigenvectors.length < 3) {
    const v = new Array(d).fill(0);
    eigenvectors.push(v);
    eigenvalues.push(0);
  }

  // 4. Project centered data onto top 3 eigenvectors: Y = X * V
  const coordinates: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let j = 0; j < d; j++) {
      x += centered[i][j] * eigenvectors[0][j];
      y += centered[i][j] * (d > 1 ? eigenvectors[1][j] : 0);
      z += centered[i][j] * (d > 2 ? eigenvectors[2][j] : 0);
    }
    coordinates.push([x, y, z]);
  }

  // Compute explained variance ratios
  const variance = totalVariance || 1;
  const expVar1 = eigenvalues[0] / variance;
  const expVar2 = eigenvalues[1] / variance;
  const expVar3 = eigenvalues[2] / variance;

  return {
    coordinates,
    explainedVariance: [expVar1, expVar2, expVar3],
    totalExplainedVariance: expVar1 + expVar2 + expVar3,
    components: eigenvectors,
  };
}
