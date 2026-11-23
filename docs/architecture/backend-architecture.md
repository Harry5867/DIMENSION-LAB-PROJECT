# Kiến trúc backend và API

`index.ts` khởi động Express. `app.ts` lắp middleware, routes và bộ xử lý lỗi tập trung. Middleware tạo mã yêu cầu trước khi xác thực hoặc đọc dữ liệu. Route kiểm tra đầu vào HTTP, gọi service và gửi kết quả. Service xử lý nghiệp vụ. Repository đọc và ghi dữ liệu trong bộ nhớ, MongoDB hoặc GridFS. [Backend](../../backend/README.md) liên kết các module.

| Luồng | Route | Service | Repository |
|---|---|---|---|
| Upload và quản lý CSV | `routes/datasets.ts` | `services/datasets.ts` | `repositories/atlasDatasets.ts` hoặc `repositories/db.ts` |
| Đăng nhập, xác minh và phiên | `routes/auth.ts` | `services/auth.ts`, `auth/passwordAuth.ts` và `auth/googleAuth.ts` | `repositories/auth.ts` cho Atlas |
| Lịch sử Isolation Forest và Apriori | `routes/analysis.ts` | `services/analysisHistory.ts` | `repositories/analysisHistory.ts` |
| Lưu cấu hình thí nghiệm | `routes/experiments.ts` | `services/experiments.ts` | `repositories/db.ts` |

Log ghi mã yêu cầu, phương thức, mẫu route khi có, mã HTTP và thời gian xử lý. Tra cứu log bằng `X-Request-Id` trong response. Response JSON thành công đặt payload trong `data`, còn lỗi dùng `error`. [Luồng HTTP từ frontend](data-flow.md)

| Nhóm đường dẫn | Trách nhiệm |
|---|---|
| /api/auth/* | Tùy chọn, đăng nhập, callback Google, kiểm tra và thu hồi phiên. |
| /api/datasets/* | Danh sách, chi tiết, xem trước, tải CSV gốc, upload, đổi tên, xóa. |
| /api/compute, /api/unsupervised | Giảm chiều, phân cụm, chỉ số, Isolation Forest và Apriori. |
| /api/experiments | Lưu và tải lịch sử analysis. |
| /api/health, /api/system-health, /api/test-db, /api/cache | Tình trạng và tác vụ quản trị. |

[Hợp đồng TypeScript](../../packages/contracts/README.md) · [Nghiệm thu API](../../tests/README.md)
