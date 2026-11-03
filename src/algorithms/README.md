# Module: Algorithms (`src/algorithms`)

Module này phụ trách toàn bộ các thuật toán tính toán khoa học dữ liệu, giảm chiều không gian và phân cụm dữ liệu đa chiều, thực thi ở cả Client (trình duyệt) và Server (Node.js).

---

## 1. Cấu trúc tệp tin

| Tệp | Mô tả | Đầu vào chính | Đầu ra |
|---|---|---|---|
| `pca.ts` | Phân tích thành phần chính (Principal Component Analysis) | `matrix: number[][]` | Tọa độ 3D `[PC1, PC2, PC3]`, explained variance, ma trận tải (biplot loadings) |
| `tsne.ts` | t-Distributed Stochastic Neighbor Embedding | `matrix`, `perplexity`, `learningRate`, `iterations` | Tọa độ 3D phi tuyến tính bảo tồn cấu trúc cục bộ |
| `umap.ts` | Uniform Manifold Approximation and Projection | `matrix`, `nNeighbors`, `minDist`, `iterations` | Tọa độ 3D bảo tồn cả cấu trúc cục bộ và toàn cục |
| `kmeans.ts` | Thuật toán phân cụm K-Means (Expectation-Maximization) | `coordinates: number[][]`, `k: number`, `maxIter` | Nhãn cụm `clusters[]`, tọa độ trọng tâm `centroids[][]`, WCSS (`inertia`) |
| `dbscan.ts` | Phân cụm dựa trên mật độ DBSCAN | `coordinates: number[][]`, `epsilon`, `minPts` | Nhãn cụm `clusters[]` (-1 là nhiễu / outlier), `noiseCount` |
| `metrics.ts` | Các chỉ số đánh giá phân cụm | `data: number[][]`, `labels: number[]` | Silhouette Score (-1 đến 1), Adjusted Rand Index (ARI) |
| `liveOptimization.ts`| Trực quan hóa quá trình hội tụ t-SNE theo thời gian thực (Step-by-step animation) | `LiveTSNEState`, `numSteps` | Cập nhật vị trí điểm sau từng bước lặp gradient descent |

---

## 2. Hướng dẫn sử dụng & Tái sử dụng

### Chạy PCA và trích xuất Biplot
```typescript
import { computePCA } from './pca';

const matrix: number[][] = [ /* n mẫu x d đặc trưng */ ];
const { coordinates, explainedVariance, components, totalVarianceExplained } = computePCA(matrix);
// coordinates: [number, number, number][]
```

### Chạy phân cụm K-Means
```typescript
import { computeKMeans } from './kmeans';

const coords: [number, number, number][] = [ /* danh sách tọa độ 3D */ ];
const result = computeKMeans(coords, 3, 50);
console.log(result.clusters); // [0, 1, 0, 2, ...]
console.log(result.centroids); // [[x, y, z], ...]
```

### Đánh giá chất lượng phân cụm
```typescript
import { computeSilhouetteScore, computeAdjustedRandIndex } from './metrics';

const score = computeSilhouetteScore(coords, result.clusters);
const ari = computeAdjustedRandIndex(groundTruthLabels, result.clusters);
```

---

## 3. Quy tắc phát triển khi thêm thuật toán mới
1. Mọi hàm thuật toán phải là hàm thuần khiết (**Pure function**), không phụ thuộc vào DOM hoặc State của React.
2. Dữ liệu đầu vào phải được ép kiểu chặt chẽ (dùng `number[][]` hoặc `Float64Array`), không dùng kiểu `any`.
3. Thuật toán phân cụm mới cần trả về cấu trúc tương thích với `ClusteringResult` trong `src/types/index.ts`.

