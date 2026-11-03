# Module: Utils (`src/utils`)

Module này cung cấp các tiện ích xử lý dữ liệu tiền kỳ (tiền xử lý dữ liệu bảng), trích xuất ma trận số học và các hàm bảo vệ kiểu (Type Guards).

---

## 1. Cấu trúc tệp tin

| Tệp | Chức năng chính |
|---|---|
| `dataParser.ts` | Phân tích cú pháp tệp CSV (dùng PapaParse), tự động nhận diện cột ID, cột nhãn phân lớp (Label), các cột số đặc trưng (Features), và hàm `extractFeatureMatrix` để chuẩn hóa dữ liệu. |
| `typeGuards.ts` | Các hàm thu hẹp kiểu (`Type Predicates`) nhằm kiểm tra runtime type an toàn tuyệt đối, loại bỏ hoàn toàn việc ép kiểu mù quáng (`as any`). |

---

## 2. Các phương pháp chuẩn hóa dữ liệu (`extractFeatureMatrix`)

Hàm `extractFeatureMatrix(rows, featureColumns, normalization)` hỗ trợ 3 chế độ:
1. **`standard` (Z-score Standardization):** Đưa dữ liệu về trung bình $\mu = 0$, độ lệch chuẩn $\sigma = 1$. Thích hợp cho PCA.
2. **`minmax` (Min-Max Scaling):** Co dãn dữ liệu về khoảng $[0, 1]$.
3. **`robust` (Robust Scaling):** Co dãn dựa trên trung vị (Median) và khoảng tứ phân vị (IQR), chống lại sự ảnh hưởng của Outlier.
4. **`none`:** Giữ nguyên giá trị gốc.

---

## 3. Cách sử dụng Type Guards an toàn
```typescript
import { isRecord, isComputeResult, getErrorMessage } from './utils/typeGuards';

try {
  const res = await fetch('/api/compute');
  const json: unknown = await res.json();
  if (isComputeResult(json)) {
    // TypeScript hiểu json chắc chắn có kiểu ComputeResult
    console.log(json.coordinates);
  }
} catch (err: unknown) {
  console.error(getErrorMessage(err));
}
```

