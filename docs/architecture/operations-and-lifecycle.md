# Vận hành, xử lý phân tán và vòng đời API

Tài liệu này mô tả cơ chế hiện triển khai cho Node/Express sau Nginx và MongoDB Atlas. Đây là cấu hình ứng dụng; chưa provision máy chủ, Atlas, DNS hoặc chứng chỉ.

## Luồng dữ liệu và job phân tán

- Dataset nguồn được version hóa; CSV Atlas nằm trong GridFS. Job chỉ lưu `ownerId`, loại tác vụ, tham chiếu dataset/version và cấu hình đã kiểm tra, không sao chép CSV vào queue.
- Ở `LAB_STORAGE_MODE=atlas`, `api_jobs` là queue bền vững dùng chung. MongoDB `findOneAndUpdate` claim job nguyên tử; nhiều API instance/worker có thể poll cùng collection.
- `npm run worker` chạy worker riêng. Khi scale worker riêng, đặt `LAB_API_JOB_WORKER_ENABLED=false` ở các API instance để chúng chỉ nhận request. Nếu bật mặc định trong Atlas mode, API process cũng poll queue.
- Giao nhận là **at-least-once**, không phải exactly-once: lease 15 phút, được gia hạn khi handler báo tiến độ; tối đa 3 lần thử với exponential backoff có giới hạn; job hết lượt thành `failed`/dead-letter. Terminal jobs hết hạn sau 7 ngày qua TTL index.
- Preprocessing gắn job ID vào metadata của dataset version để retry sau khi ghi không tạo thêm phiên bản. Các tác vụ đọc/tính toán có thể chạy lại an toàn.
- Demo mode tiếp tục dùng RAM trong một process; không dùng demo mode cho nhiều instance hoặc dữ liệu cần tồn tại sau restart.

## Giới hạn và hiệu năng

| Bảo vệ | Mức hiện tại |
|---|---:|
| JSON request body | 1 MiB |
| CSV upload | 5 MiB ở backend; Nginx cho 6 MiB gồm multipart overhead |
| Job payload / kết quả | 1 MiB / 8 MiB |
| Job đang chạy/chờ mỗi người dùng | 25 |
| Số lần thử job | 3 |
| Worker concurrency mỗi process | 1 mặc định, cấu hình 1–8 |
| Giữ job kết thúc | 7 ngày |
| Rate limit API / đăng nhập / submit compute | 300/phút / 20 mỗi 15 phút / 30/phút |

Worker concurrency lớn hơn 1 có thể tăng áp lực CPU/RAM; tăng theo từng bước và quan sát thời gian xử lý, heap cùng độ dài queue. Rate limiter trong Express dùng memory store theo process; Nginx áp thêm giới hạn theo IP ở edge. Nếu chạy qua nhiều proxy/host, thiết kế và cấu hình shared rate-limit store tại gateway trước khi bỏ giới hạn hiện tại.

MongoDB index phục vụ claim, tra cứu theo owner/type, idempotency và TTL được tạo khi khởi tạo kết nối. API tạo job chấp nhận header `Idempotency-Key` (1–128 ký tự an toàn); cùng key và payload trong 7 ngày trả lại job cũ, dùng lại key với payload khác trả `409`.

## Reliability, bảo mật và vận hành

- `/livez` chỉ kiểm tra process; `/readyz` trả `503` nếu Atlas cần thiết nhưng chưa sẵn sàng. Nginx chuyển tiếp cả hai probe.
- API có shutdown drain, dừng nhận kết nối, ngừng claim job mới, chờ job đang chạy rồi đóng MongoDB. Nếu process bị kill đột ngột, worker khác có thể claim lại sau khi lease hết hạn.
- Middleware đặt request ID (`X-Request-ID`), JSON access log không ghi body/token, `Cache-Control: no-store`, Helmet security headers, CORS allowlist, giới hạn body và rate limiting. Swagger không lưu authorization giữa các lần tải trang; CSP ở Express tắt để Swagger UI hoạt động nên nên giới hạn `/docs` ở network edge nếu cần. Express chỉ tin proxy loopback; Nginx ghi đè request ID và áp TLS, size/rate/connection limit.
- Dữ liệu job và kết quả chỉ trả cho đúng owner; job payload không xuất hiện trong API response. `/api/metrics` cần quyền admin; hạn chế scrape endpoint ở network edge. Metrics gồm request count/latency, trạng thái job toàn queue và RSS/heap/uptime.
- Bảo vệ `.env`, MongoDB URI và OAuth secret như secrets của service manager; không đưa secrets vào repo/log. Production cần TLS MongoDB, Atlas network allowlist, backup/restore test và giới hạn quyền database.

## Deploy Node + Nginx + Atlas

Đặt các biến môi trường trên cả API và worker (không commit giá trị secret):

```text
NODE_ENV=production
LAB_STORAGE_MODE=atlas
MONGODB_URI=<secret from secret manager>
MONGODB_DB=<database name>
LAB_BIND_HOST=127.0.0.1
PORT=5000
LAB_ALLOWED_ORIGIN=https://<public application origin>
LAB_API_JOB_WORKER_ENABLED=false
LAB_JOB_WORKER_CONCURRENCY=1
```

1. Cài Node/npm theo README, chạy `npm ci`, `npm run build`, `npm run lint`, `npm test` và `npm run test:api`.
2. Chạy API bằng service manager trên loopback cổng 5000. Dùng một hoặc nhiều worker service với cùng cấu hình Atlas: `npm run worker`.
3. Kiểm tra `nginx -t`, reload Nginx, kiểm tra TLS, giới hạn upload và reverse proxy trong [nginx.conf](../../nginx/nginx.conf).
4. Chờ `/readyz` trả 200, xác minh `/api/health`, Swagger/OpenAPI, một analysis job hoàn tất, `/api/metrics` qua tài khoản admin và worker logs. Không nhận traffic mới nếu readiness thất bại.
5. Khi rollback ứng dụng, giữ tương thích schema job/index trong ít nhất một phiên bản; không xóa `api_jobs` hoặc thay đổi semantics của job đang chờ.

Nginx hiện áp rate limit theo IP, TLS/header policy, giới hạn body và route compute. Backend bind loopback để tránh bỏ qua reverse proxy. Nếu thay proxy hoặc bind public interface, phải đánh giá lại `trust proxy`, CORS, TLS và rate limits.

## API lifecycle

- `/api` là compatibility alias; `/api/v1` là canonical baseline; `/api/v2` bổ sung point diagnostics, filtering, quality metrics và optimization.
- Breaking contract change cần phiên bản route mới. Giữ OpenAPI, response schema, auth/role, status code, integration/E2E tests đồng bộ. Chưa phát lịch sunset cho v1 nên không gửi header deprecation giả định.
- Job submit trả `202` và `Location`; client poll job endpoint, xử lý `queued`, `running`, `succeeded`, `failed`, `cancelled`, retry `429/503` với backoff và dùng idempotency key cho submit có side effect.
- Thay đổi Mongo indexes cần backward-compatible rollout: tạo index trước, deploy reader/writer mới sau, giữ field cũ đến khi worker cũ đã drain; TTL chỉ áp dụng job terminal.

## Kiểm thử và CI

`npm run lint`, `npm test`, `npm run test:api`, `npm run build` và `npm run test:e2e` được chạy trong CI. Unit tests bao phủ idempotency, owner isolation, retry/cancel; API tests kiểm tra headers, probes, metrics auth và job contract; Playwright kiểm tra browser flow. Atlas outage và distributed claim cần kiểm thử integration riêng trên Atlas staging trước mỗi production rollout.