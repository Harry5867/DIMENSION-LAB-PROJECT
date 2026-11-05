# Module: Components (`src/components`)

Module này chứa toàn bộ các thành phần giao diện người dùng (UI Components) của hệ thống, bao gồm khung đồ họa 3D Three.js, thanh điều khiển thông số, bảng thống kê và các hộp thoại chức năng.

---

## 1. Cấu trúc các thành phần

| Thành phần | Vai trò & Trách nhiệm |
|---|---|
| `ThreeCanvas.tsx` | Viewport WebGL tương tác 3D: render hàng ngàn điểm dữ liệu bằng `InstancedMesh`, hỗ trợ xoay/phóng to (`OrbitControls`), hover/click chọn điểm qua Raycasting, hiển thị véc-tơ PCA Biplot và trọng tâm cụm (Centroids). |
| `ControlSidebar.tsx` | Thanh điều hướng bên trái: chọn bộ dữ liệu, bật/tắt đặc trưng số, cấu hình tham số giảm chiều (PCA, t-SNE, UMAP), phân cụm (K-Means, DBSCAN) và chế độ hiển thị màu sắc. |
| `MetricsPanel.tsx` | Bảng điều khiển góc trên bên phải hiển thị các chỉ số khoa học: Silhouette Score, ARI, Explained Variance (PCA), thời gian thực thi (ms). |
| `DataInspector.tsx` | Bảng soi chi tiết dữ liệu khi click vào 1 điểm trên không gian 3D (hiển thị ID, nhãn phân lớp, giá trị của toàn bộ đặc trưng gốc). |
| `ElbowModal.tsx` | Hộp thoại tìm số cụm $k$ tối ưu bằng phương pháp Elbow Method (vẽ biểu đồ WCSS theo $k$). |
| `SecurityModal.tsx` | Hộp thoại thông tin bảo mật và giám sát hệ thống (RAM, CPU, Cache SHA-256, SQLite/MongoDB health). |
| `ExperimentsPage.tsx` | Trang lịch sử thí nghiệm, xuất JSON và khôi phục cấu hình vào Explore. |
| `RawDataModal.tsx` | Bảng hiển thị dữ liệu dạng lưới dòng/cột gốc phục vụ đối chiếu dữ liệu. |
| `DatasetsPage.tsx` | Trang quản lý dataset mẫu và CSV đã nhập. |
| `TooltipSlider.tsx` | Thanh trượt điều chỉnh giá trị tham số có tooltip hiển thị giá trị số thực thời gian thực. |

---

## 2. Hướng dẫn tái sử dụng `ThreeCanvas`

```tsx
import { ThreeCanvas } from './components/ThreeCanvas';
import { DataPoint, ColorMode } from './types';

<ThreeCanvas
  dataPoints={points}                     // DataPoint[]
  colorMode="cluster"                     // 'cluster' | 'ground-truth' | 'feature'
  onSelectPoint={(point) => setSelected(point)}
  selectedPoint={selected}
  reductionMethod="PCA"
  showBiplot={true}
  pcaComponents={pcaComponents}
  featureNames={selectedFeatures}
/>
```

---

## 3. Quy tắc phát triển giao diện
1. **Hiệu năng Three.js:** Chỉ mount Scene và WebGLRenderer 1 lần duy nhất trong `useEffect(..., [])`. Cập nhật điểm qua ma trận `InstancedMesh` thay vì tạo hàng ngàn `Mesh` rời rạc.
2. **Lazy Loading:** `ElbowModal`, `SecurityModal` và `ExperimentsPage` được tải động qua `React.lazy()` và `Suspense` trong `App.tsx`.
3. **Chống re-render:** Mọi callback truyền vào `ThreeCanvas` phải được bọc qua `useCallback` hoặc `useRef` để không kích hoạt vòng lặp re-render Three.js.

