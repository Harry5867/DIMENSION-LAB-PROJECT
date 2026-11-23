# Backend Express

Backend là một ứng dụng Express chạy từ root. `npm run server` mở API ở `127.0.0.1:5000` mặc định. `npm run dev:all` mở cả Vite và API.

Tài liệu tương tác của các endpoint hiện có: `http://127.0.0.1:5000/docs/`; OpenAPI JSON: `http://127.0.0.1:5000/openapi.json`. Các endpoint cốt lõi được mô tả theo hợp đồng `/api` hiện tại; chưa bật các API `/api/v1` hoặc `/api/v2` trong nhánh `son`.

| Phần | Trách nhiệm |
|---|---|
| [Entry](src/index.ts), [App](src/app.ts) | Khởi tạo lưu trữ và mở cổng. App lắp middleware, routes và error handler theo thứ tự. |
| [Routes](src/routes/) | Nhận HTTP, kiểm tra đầu vào, gọi xử lý và tạo phản hồi. |
| [Analysis service](src/services/analysis.ts) | Chạy phép chiếu/phân cụm, chỉ số và cache. |
| [Auth](src/auth/), [Middleware](src/middleware/) | Phiên demo, Google OAuth, quyền truy cập và lỗi HTTP. |
| [Repositories](src/repositories/), [Database](src/database/) | Dataset, CSV gốc, thí nghiệm, cache và kết nối MongoDB. |
| [HTTP](src/http/) | Runtime validation, lỗi và phản hồi API. |

## Chế độ lưu trữ

Demo giữ dữ liệu phát sinh trong RAM và dùng phiên Bearer. Atlas dùng Google OAuth, cookie phiên, MongoDB và GridFS cho CSV. Khi Atlas không khả dụng, API cần lưu trữ trả `503`. Express và browser Worker dùng chung package thuật toán. Cache tính toán giữ khóa theo đầu vào, cấu hình và người sở hữu nếu chạy Atlas.

## Kiểm thử và bảo trì

Chạy `npm run test:api` từ root. Giữ thứ tự middleware, URL callback, mã HTTP, quyền sở hữu và hình dạng payload. Khi sửa dataset, kiểm tra cả list, preview và download.

[Google và Atlas](../docs/google-atlas.md) · [API](../docs/architecture/backend-architecture.md) · [Kiểm thử](../tests/README.md)

## Ghi chú bảo trì cho người và AI

Tìm route tương ứng rồi lần theo middleware, service và repository. Kiểm tra thứ tự CORS, guard, body parser, route và error handler. Khi sửa dữ liệu riêng, đối chiếu owner trong truy vấn, tệp và cache. Chạy test API cho nhóm đã sửa.

## Biến môi trường

| Biến | Dùng để |
|---|---|
| `PORT`, `LAB_BIND_HOST`, `LAB_ALLOWED_ORIGIN` | Cổng, địa chỉ bind và origin bổ sung cho API. |
| `LAB_STORAGE_MODE`, `MONGODB_URI`, `MONGODB_DB` | Chế độ lưu trữ và đích kết nối Atlas. |
| `LAB_AUTH_EMAIL`, `LAB_AUTH_PASSWORD` | Tùy chỉnh tài khoản demo cho máy chủ. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth client và URL callback. |
