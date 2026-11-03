# Module: Server (`server`)

Module máy chủ Express cung cấp API tính toán hiệu năng cao, lưu trữ dữ liệu bền vững và bộ nhớ đệm nhiều tầng (Multi-tier Cache).

---

## 1. Cấu trúc tệp tin

| Tệp | Chức năng chính |
|---|---|
| `index.ts` | Khởi tạo máy chủ Express, thiết lập middleware bảo mật (CORS, Gzip Compression, JSON Body Parser), và định tuyến các endpoint RESTful. |
| `db.ts` | Tầng truy cập dữ liệu (Data Access Layer - DAL) hỗ trợ linh hoạt giữa **MongoDB** (Cloud / Docker) và **SQLite3** (File cục bộ dự phòng), tự động seed dữ liệu mẫu khi khởi động. |

---

## 2. Danh sách các API Endpoints chuẩn RESTful

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/health` | Kiểm tra tình trạng server (RAM heap, Uptime, Cache stats, Database connection latency). |
| `GET` | `/api/datasets` | Lấy danh sách tóm tắt toàn bộ bộ dữ liệu sẵn có. |
| `GET` | `/api/datasets/:id` | Tải chi tiết một bộ dữ liệu kèm toàn bộ bản ghi thô (`rawRows`). |
| `POST` | `/api/datasets/upload` | Tải lên tệp CSV mới (`multipart/form-data`). |
| `DELETE` | `/api/datasets/:id` | Xóa một bộ dữ liệu tùy chỉnh. |
| `POST` | `/api/compute` | Thực hiện tính toán giảm chiều 3D và phân cụm với cơ chế băm **SHA-256 Cache**. |
| `GET` | `/api/experiments` | Lấy danh sách các thí nghiệm đã lưu. |
| `POST` | `/api/experiments` | Lưu trạng thái cấu hình và kết quả phân tích vào CSDL. |
| `DELETE` | `/api/experiments/:id`| Xóa một thí nghiệm đã lưu. |

---

## 3. Cơ chế Multi-Tier Caching (Bộ nhớ đệm nhiều tầng)
Khi người dùng gọi `POST /api/compute`, server thực hiện:
1. Băm nội dung của `matrix + groundTruth + reductionConfig + clusteringConfig` bằng thuật toán **SHA-256** để tạo `cacheKey`.
2. Kiểm tra bộ nhớ đệm RAM (`memoryCache` Map). Nếu có, trả về ngay tức thì (< 5ms).
3. Nếu chưa có, tính toán thuật toán, lưu kết quả vào CSDL và RAM cache trước khi trả về.

---

## 4. Cách khởi chạy server
```bash
# Chạy server với tsx watch (chế độ phát triển)
npm run server

# Chạy đồng thời cả Frontend Vite và Backend Server
npm run dev:all
```

