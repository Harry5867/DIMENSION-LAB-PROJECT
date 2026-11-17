# Kiến trúc backend và API

`index.ts` khởi động Express. `app.ts` lắp middleware và routes, sau đó xử lý lỗi tập trung. Các repository quản lý dữ liệu demo và Atlas. [Backend](../../backend/README.md) liên kết các module.

| Nhóm đường dẫn | Trách nhiệm |
|---|---|
| /api/auth/* | Tùy chọn, đăng nhập, callback Google, kiểm tra và thu hồi phiên. |
| /api/datasets/* | Danh sách, chi tiết, xem trước, tải CSV gốc, upload, đổi tên, xóa. |
| /api/compute, /api/unsupervised | Giảm chiều, phân cụm, chỉ số, Isolation Forest và Apriori. |
| /api/experiments | Lưu và tải lịch sử analysis. |
| /api/health, /api/system-health, /api/test-db, /api/cache | Tình trạng và tác vụ quản trị. |

[Hợp đồng TypeScript](../../packages/contracts/README.md) · [Nghiệm thu API](../../tests/README.md)
