# Backend Express

Backend là một ứng dụng Express chạy từ root. `npm run server` mở API ở `127.0.0.1:5000` mặc định. `npm run dev:all` mở cả Vite và API.

Swagger UI: `http://127.0.0.1:5000/docs/` · OpenAPI JSON: `http://127.0.0.1:5000/openapi.json`.

| Phần | Trách nhiệm |
|---|---|
| [Entry](src/index.ts), [App](src/app.ts) | Khởi tạo lưu trữ, lắp middleware/routes, worker poll mặc định ở Atlas mode và graceful shutdown. |
| [Routes](src/routes/) | Nhận HTTP, kiểm tra đầu vào, gọi xử lý và tạo phản hồi. |
| [Analysis service](src/services/analysis.ts) | Chạy phép chiếu/phân cụm, chỉ số và cache. |
| [Auth](src/auth/), [Middleware](src/middleware/) | Phiên demo, Google OAuth, quyền truy cập và lỗi HTTP. |
| [Repositories](src/repositories/), [Database](src/database/) | Dataset, CSV gốc, thí nghiệm, cache, persistent job indexes và kết nối MongoDB. |
| [API jobs](src/services/apiJobs.ts), [Job handlers](src/services/apiJobHandlers.ts), [Worker](src/worker.ts) | MongoDB-backed at-least-once queue cho Atlas; demo giữ queue trong RAM. Worker riêng có thể scale độc lập. |
| [Observability](src/observability/metrics.ts), [Health routes](src/routes/health.ts) | Request metrics, queue state, liveness và readiness probes. |
| [HTTP](src/http/) | Runtime validation, lỗi và phản hồi API. |

## Chế độ lưu trữ

Demo giữ dữ liệu phát sinh trong RAM và dùng phiên Bearer; queue demo không dùng giữa nhiều process. Atlas dùng Google OAuth, cookie phiên, MongoDB, GridFS và queue bền vững cho CSV/jobs. Khi Atlas không khả dụng, API cần lưu trữ trả `503` và readiness trả `503`. Express và browser Worker dùng chung package thuật toán. Cache tính toán giữ khóa theo đầu vào, cấu hình và người sở hữu nếu chạy Atlas.

Production có thể tách workers khỏi API:

```text
LAB_STORAGE_MODE=atlas
LAB_API_JOB_WORKER_ENABLED=false
LAB_JOB_WORKER_CONCURRENCY=1
```

Chạy API bằng `npm run server` và một hoặc nhiều worker bằng `npm run worker`, cùng MongoDB credentials. Nếu không tách worker, bỏ `LAB_API_JOB_WORKER_ENABLED=false`; backend Atlas sẽ poll queue cùng API. Job được giao at-least-once, tối đa 3 lần thử, lease 15 phút và kết quả terminal giữ 7 ngày. `Idempotency-Key` giúp submit retry an toàn. Chi tiết rollout, giới hạn và runbook ở [operations & API lifecycle](../docs/architecture/operations-and-lifecycle.md).

## Kiểm thử và bảo trì

Chạy `npm run test:api` từ root. Giữ thứ tự middleware, URL callback, mã HTTP, quyền sở hữu và hình dạng payload. Khi sửa dataset, kiểm tra cả list, preview và download.

[Google và Atlas](../docs/google-atlas.md) · [API](../docs/architecture/backend-architecture.md) · [Kiểm thử](../tests/README.md)

## Ghi chú bảo trì cho người và AI

Tìm route tương ứng rồi lần theo middleware, service và repository. Kiểm tra thứ tự CORS, guard, body parser, route và error handler. Khi sửa dữ liệu riêng, đối chiếu owner trong truy vấn, tệp và cache. Chạy test API cho nhóm đã sửa.

## Biến môi trường

| Biến | Dùng để |
|---|---|
| `PORT`, `LAB_BIND_HOST`, `LAB_ALLOWED_ORIGIN` | Cổng, địa chỉ bind và origin bổ sung cho API. Production chỉ bind loopback sau Nginx. |
| `LAB_STORAGE_MODE`, `MONGODB_URI`, `MONGODB_DB` | Chế độ lưu trữ và đích kết nối Atlas. |
| `LAB_API_JOB_WORKER_ENABLED` | Đặt `false` trên API instance khi chạy worker riêng; mặc định queue worker được bật trong Atlas mode. |
| `LAB_JOB_WORKER_CONCURRENCY` | Số job đồng thời mỗi worker process, từ 1 đến 8; mặc định 1. |
| `LAB_AUTH_EMAIL`, `LAB_AUTH_PASSWORD` | Tùy chỉnh tài khoản demo cho máy chủ. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth client và URL callback. |
