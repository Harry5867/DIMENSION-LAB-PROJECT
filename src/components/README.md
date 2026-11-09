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



## Dashboard cho tác vụ học không giám sát

- `UnsupervisedPanel.tsx` giữ cấu hình và nút chạy Isolation Forest / Apriori trong Setup. Kết quả không được render trong thanh bên.
- Khi tính toán thành công (kể cả cache) hoặc khôi phục lịch sử, `AnalysisDashboard.tsx` tự mở dashboard qua React portal vào `document.body` để tránh giới hạn cuộn/chiều rộng của Setup.
- Dashboard gồm bốn thẻ thống kê, biểu đồ, bảng kết quả, cấu hình lần chạy và xuất dữ liệu. Có thể mở lại bằng **Open results dashboard**, đóng bằng Escape, nút đóng hoặc **Back to workspace**.
- Chọn luật để xem chi tiết trong dashboard. Thao tác highlight 3D hoặc chọn dòng có điểm tương ứng sẽ quay lại workspace. Dashboard dùng `useDialogFocus` để giữ focus bàn phím và trả focus khi đóng.
- `analysis-dashboard.css` dùng hai cột cho biểu đồ và thu về một cột dưới 760px; bảng có vùng cuộn riêng.


### Luồng Anomaly / Association hoàn thiện

- Kết quả hai tác vụ được giữ riêng trong cùng phiên Setup. Anomaly tự áp dụng score và cờ bất thường lên 3D sau khi tính toán, rồi mở dashboard. Dashboard vẫn có nút quay về 3D và workspace có nút xóa overlay.
- Association hiển thị khoảng giá trị thực bằng `describeItem`; khoảng cuối đóng ở cận trên, các khoảng trước mở ở cận trên. Chọn luật để kiểm tra vế trái, cả hai vế hoặc các dòng ngoại lệ, rồi áp dụng overlay membership trên 3D. Membership không được đánh dấu như anomaly/noise.
- `ResultTable` hỗ trợ phân trang 10/25/50/100 dòng; tìm kiếm, ngưỡng lọc và xuất CSV toàn bộ/phần lọc có nhãn phạm vi rõ ràng.
- Có thể soi một dòng trong dashboard, so sánh các giá trị số với trung bình và độ lệch chuẩn của dữ liệu gốc, rồi định vị dòng đó trên 3D nếu điểm còn tồn tại. Đây là thống kê mô tả, không phải giải thích đóng góp đặc trưng của mô hình.
- Isolation Forest thay giá trị trống/không hợp lệ bằng trung bình giá trị hợp lệ trước khi chuẩn hóa, công bố số giá trị thay thế theo cột và từ chối cột không có giá trị số hợp lệ.
