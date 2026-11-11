# API Design — Dimension Lab (implementation hiện tại)

**Phạm vi:** API ở `server/index.ts`, xác thực demo ở `server/auth.ts`, định dạng phản hồi ở `server/response.ts` và Mongo repository ở `server/db.ts` của commit GitHub `6fbac6c`.

**Lưu ý cập nhật:** nội dung các mục 1–8 dưới đây mô tả API phân tích legacy ở cổng `5000`. Workbench tài khoản/dataset local-first là API JavaScript độc lập ở cổng `5100`; xem mục 9 và [luồng MongoDB native](MONGODB_NATIVE_DATA_FLOW.md). Hai API không dùng chung cơ chế auth.

## 1. Đường truyền request

Khi web/API chạy local:

- Browser gửi `/api/...` tới Vite tại `http://localhost:3000`.
- Vite proxy chuyển request sang Express tại `http://localhost:5000`.
- Express validate payload, gọi thuật toán hoặc repository.
- MongoDB chỉ được gọi từ Express; browser không kết nối thẳng Mongo.

Có thể gọi API trực tiếp trên cổng `5000` khi học/debug. MongoDB local dùng URI `mongodb://127.0.0.1:27017/cancer_explorer`.

## 2. Response và lỗi

Response thành công có dạng chính `{ success: true, data, timestamp }`. Khi `data` là object, `sendSuccess` còn trải các field của object ra cấp trên để tương thích client cũ. Vì vậy client mới nên đọc `data`; không nên dựa vào các field trùng ở root.

Lỗi có dạng `{ success: false, error: { code, message, details? }, message, timestamp }`. Các status chính: `400` payload sai, `401` token không hợp lệ, `403` role không đủ, `404` tài nguyên không có, `500` lỗi chưa phân loại. Một số lỗi Mongo hiện bị bắt ở tầng repository rồi fallback RAM, nên không nhất thiết thành HTTP error.

## 3. Các endpoint hiện có

| Method | Endpoint | Request chính | Quyền theo route | Kết quả |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | `{ "role": "researcher" }` | Demo | Token/role giả lập cho UI local |
| `GET` | `/api/auth/me` | Bearer token nếu có | Public/demo | User hiện tại |
| `GET` | `/api/health` | — | Public | Health ngắn; nhãn database hiện ghi Atlas cố định khi cờ connected true |
| `GET` | `/api/system-health` | — | Public | Uptime, RAM, Mongo ping/latency và tổng documents |
| `POST` | `/api/test-db` | — | Public | Gọi đường kiểm tra kết nối Mongo hiện có |
| `GET` | `/api/datasets` | — | Public | Danh sách tóm tắt dataset, không có `rawRows` |
| `GET` | `/api/datasets/:id` | ID trong path | Public | Dataset và toàn bộ `rawRows` |
| `POST` | `/api/datasets/upload` | `multipart/form-data`, file field `file` | Admin/researcher theo route | Parse CSV, lưu dataset, trả HTTP 201 |
| `PATCH` | `/api/datasets/:id` | `{ "name": "tên mới" }` | Admin/researcher theo route | Đổi tên dataset |
| `DELETE` | `/api/datasets/:id` | ID trong path | Admin theo route | Xóa dataset |
| `POST` | `/api/compute` | Ma trận số, ground truth và config bên dưới | Public/demo | Embedding, cluster assignments, metrics, cache headers |
| `POST` | `/api/unsupervised` | Analysis task JSON bên dưới | Public/demo | Anomaly hoặc association-rule result; cache trong RAM |
| `DELETE` | `/api/cache` | — | Admin theo route | Xóa compute cache |
| `GET` | `/api/experiments` | — | Public | Tối đa 50 experiment gần nhất |
| `POST` | `/api/experiments` | Dataset, phương pháp, metrics, params | Public/demo | Lưu experiment, HTTP 201 |

Không có `DELETE /api/experiments/:id` trong code tại commit này.

## 4. Payload phân tích

### `POST /api/compute`

Request cần các trường:

```json
{
  "matrix": [[1.2, 3.4], [2.1, 4.6]],
  "groundTruth": ["A", "B"],
  "reductionConfig": {
    "method": "PCA",
    "normalization": "z-score",
    "perplexity": 30,
    "learningRate": 100,
    "iterations": 250,
    "nNeighbors": 15,
    "minDist": 0.1
  },
  "clusteringConfig": {
    "method": "K-Means",
    "k": 2,
    "epsilon": 3.5,
    "minPts": 5
  }
}
```

Các method reduction: `PCA`, `t-SNE`, `UMAP`; normalization: `z-score`, `min-max`, `none`; clustering: `K-Means`, `DBSCAN`, `GMM`, `None`. Validator hiện yêu cầu các numeric field của hai config kể cả khi một method không dùng hết.

Response gồm `coordinates`, `clusterAssignments`, `silhouetteScore`, `adjustedRandIndex`, cluster counts, noise count và thông tin PCA khi có. Header `X-Cache` báo `HIT` hoặc `MISS` và `X-Cache-Key` là SHA-256 fingerprint của matrix/labels/config.

**Traceability gap:** request compute hiện truyền ma trận và labels theo thứ tự mảng; API contract không mang `recordId` riêng cho từng hàng. Frontend phải giữ nguyên mapping/order giữa ma trận và source rows để điểm không ghép nhầm record.

### `POST /api/unsupervised`

`kind: "anomaly"` cần `rows`, `features`, `normalization` và options số `trees`, `sampleSize`, `contamination`, `seed`. `kind: "association"` cần `rows`, `features` và options số `support`, `confidence`, `lift`, `maxSize`, `bins`.

Parser chấp nhận 1–20.000 dòng và 1–100 feature đã tồn tại trong rows. Payload sai bị trả `400`. Cache của endpoint này chỉ là `Map` trong process Node, không bền qua restart và không dùng collection Mongo `compute_cache`.

## 5. Payload lưu dữ liệu

### Upload CSV qua API phân tích legacy

Endpoint legacy nhận file dạng multipart để tương thích với các client hiện có. Giao diện Dimension Lab nhập CSV bằng workbench và dùng luồng đồng bộ ở mục 9. Endpoint legacy dùng Multer memory storage, parse CSV và tạo document gồm:

- `id`, `name`, `filename`, `createdAt`;
- `totalRows`, `features`, `labelColumn`, `idColumn`;
- `rawRows`.

Repository đặt bản vào RAM trước, rồi thử `replaceOne({ id }, doc, { upsert: true })` vào `cancer_explorer.datasets`. Hiện không có chunked upload, streaming, pagination raw rows hoặc idempotency key cho thao tác upload.

### Lưu experiment

Body cần `datasetId`, `datasetName`, `reductionMethod`, `clusteringMethod`, `k`, `silhouetteScore`, `ari`, và `params` tùy chọn. MongoDB lưu record vào `experiments`; khi không kết nối, implementation có thể trả ID tạm từ RAM.

## 6. Authentication và security — trạng thái demo

`server/auth.ts` dùng user/token cố định cho demo. Quan trọng hơn, middleware hiện gán role `admin` cho request **không có Authorization header**. Do đó `requireRole` không bảo vệ các route như production auth thật. `cors` hiện cho phép mọi origin; Express JSON body limit là 100 MB.

Chạy chỉ trên máy local trong lúc học. Không expose API/database ra Internet. Trước production cần thiết kế auth thật, authorization theo dataset/user, CORS allowlist, giới hạn payload/file và secret management; tài liệu này không khẳng định các phần đó đã được triển khai.

## 7. MongoDB durability và offline

- MongoDB local được chạy bằng Compose; chi tiết URI, volume và cách khởi động nằm trong [Docker/MongoDB data flow](DOCKER_MONGODB_DATA_FLOW.md).
- Khi `saveDataset`/`saveExperiment` bắt lỗi Mongo, code có thể giữ dữ liệu RAM rồi vẫn trả success. HTTP success không đảm bảo dữ liệu bền.
- Sau khi kết nối Mongo thành công, lỗi kết nối giữa phiên có thể không cập nhật `isMongoConnected`; health có thể báo Atlas/connected sai và truy vấn dataset có thể trả rỗng.
- Source hiện không có IndexedDB cho dataset. CSV chưa upload chỉ ở state/tab trình duyệt; không có outbox/sync contract để tự upload khi API hoạt động lại.
- Ingestion hiện là CSV/tabular; chưa có API cho ảnh hoặc multimodal data.
- `rawRows` cùng nằm trong một Mongo document; MongoDB giới hạn BSON document 16 MiB. Thiết kế hiện tại chưa phù hợp với hàng triệu bản ghi.

## 8. Tài liệu liên quan

- [Docker, MongoDB và luồng dữ liệu](DOCKER_MONGODB_DATA_FLOW.md)
- [System Flow](SYSTEM_FLOW.md)
- [Server module](../server/README.md)

## 9. Local data API — tài khoản local và dataset owner-scoped

Local data API là `server/local-data-server.js`, bind cố định `127.0.0.1:5100`. JavaScript gateway `src/local-auth-gateway.js` cung cấp form tài khoản chung trên trang gốc `/`. Các nút nhập CSV mở cùng workbench. Session cookie hợp lệ mới cho phép gọi route đồng bộ theo chủ sở hữu. Trình duyệt gọi API với header `X-Dimension-Lab-Client: database-workbench` khi ghi dữ liệu. CORS chỉ cho phép loopback UI origins. API health hoạt động khi MongoDB chưa kết nối. Route cần dữ liệu trả `503` khi DB chưa sẵn sàng.

### Registration request

`POST /api/auth/register/start` nhận:

```json
{
  "name": "Nguyễn Thị Minh Anh",
  "email": "user@example.test",
  "password": "A-longer-Strong-Passphrase_2026"
}
```

Họ tên phải gồm ít nhất hai phần. Mật khẩu tối thiểu 14 ký tự, có chữ hoa/chữ thường/số/ký tự đặc biệt; các mẫu phổ biến và lặp ký tự dài bị từ chối. `POST /api/auth/register` kiểm tra thông tin, tạo user ngay trong MongoDB và trả session cookie. Tài khoản có `authMode: "local"` và `emailVerified: false`; API không gửi email và không tuyên bố địa chỉ email đã được xác minh. `/api/auth/register/start` còn được giữ làm alias tương thích; các route `/resend` và `/verify` trả `410`.

Rủi ro xác thực: bất kỳ người dùng cục bộ nào cũng có thể đăng ký một email chưa thuộc quyền kiểm soát của họ. Đây là chế độ cho ứng dụng cá nhân/local đang bind `127.0.0.1`, không phù hợp để mở API cho Internet hoặc triển khai nhiều người dùng. Nếu triển khai mạng, cần thiết kế lại xác minh danh tính và bảo vệ đăng ký trước khi mở truy cập.

### Dataset sync request

`POST /api/datasets/sync/start` nhận metadata, `syncId` và `baseRevision`. Rows được gửi lên `POST /api/datasets/:id/rows/batch` theo từng batch 1–500. `/sync/finish` kiểm tra số dòng và công bố revision bằng cập nhật con trỏ có điều kiện. Gửi lại `syncId` đã hoàn tất trả cùng revision. Dataset và row queries luôn lọc bằng `ownerId` từ session.

Khi `baseRevision` cũ hơn server revision hoặc bản cũ của trình duyệt gửi `null` cho dataset đã tồn tại, API lưu bản server vào `dataset_conflicts` và `dataset_conflict_rows` rồi công bố bản offline. `baseRevision` cao hơn server trả `409` và giữ outbox. `GET /api/datasets/:id/rows` nhận `expectedRevision` để phân trang một phiên bản nhất quán. Các route cần xác thực cũng nhận `expectedOwnerId` để phát hiện khi trình duyệt đã đổi tài khoản.

### Lịch sử phân tích riêng

`GET /api/experiments` trả tối đa 50 lần chạy của tài khoản local. `POST /api/experiments` nhận `datasetId`, `revision`, `reductionMethod`, `clusteringMethod`, `k`, `silhouetteScore`, `ari` và `params`. Tên dataset lấy từ MongoDB. Dataset của tài khoản khác trả `404`, revision đã thay đổi trả `409`. Chi tiết vận hành nằm trong [server README](../server/README.md).
