# Module: Server (`server`)

Module máy chủ Express cung cấp API tính toán hiệu năng cao, lưu trữ dữ liệu bền vững và bộ nhớ đệm nhiều tầng (Multi-tier Cache).

---

## 1. Cấu trúc tệp tin

| Tệp | Chức năng chính |
|---|---|
| `index.ts` | Khởi tạo máy chủ Express, thiết lập middleware bảo mật (CORS, Gzip Compression, JSON Body Parser), và định tuyến các endpoint RESTful. |
| `db.ts` | Tầng truy cập dữ liệu kết nối **MongoDB** và lưu tạm trong **RAM** nếu kết nối thất bại. Máy chủ nạp dữ liệu mẫu khi khởi động. |

---

## 2. Danh sách các API Endpoints chuẩn RESTful

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/health` | Kiểm tra API và chế độ lưu trữ. |
| `POST` | `/api/auth/login` | Đăng nhập bằng email và mật khẩu của workspace. Có thể chọn vai trò demo bằng trường `role`. |
| `GET` / `POST` | `/api/auth/me` / `/api/auth/logout` | Kiểm tra hoặc thu hồi phiên. |
| `GET` | `/api/datasets` | Lấy danh sách tóm tắt toàn bộ bộ dữ liệu sẵn có. |
| `GET` | `/api/datasets/:id` | Tải chi tiết một bộ dữ liệu kèm toàn bộ bản ghi thô (`rawRows`). |
| `POST` | `/api/datasets/upload` | Tải lên tệp CSV mới (`multipart/form-data`). |
| `DELETE` | `/api/datasets/:id` | Xóa một bộ dữ liệu tùy chỉnh. |
| `POST` | `/api/compute` | Thực hiện tính toán giảm chiều 3D và phân cụm với cơ chế băm **SHA-256 Cache**. |
| `GET` | `/api/experiments` | Lấy danh sách các thí nghiệm đã lưu. |
| `POST` | `/api/experiments` | Lưu trạng thái cấu hình và kết quả phân tích vào CSDL. |

API dữ liệu yêu cầu `Authorization: Bearer <token>`. Phiên hết hạn sau 8 giờ hoặc khi khởi động lại API. Các vai trò dùng chung một workspace và không có quyền sở hữu theo người dùng. Tệp upload cần UTF-8, tối đa 5 MiB, 10.000 hàng dữ liệu và 128 cột. Hai bộ dữ liệu tích hợp chỉ đọc.

---

## 3. Cơ chế Multi-Tier Caching (Bộ nhớ đệm nhiều tầng)
Với `clusteringConfig.method = 'None'`, API vẫn trả tọa độ phép chiếu. Các trường phân cụm là `clusterAssignments: []`, `clusterCounts: {}`, `noiseCount: 0`, `silhouetteScore: null` và `adjustedRandIndex: null`. K-Means và GMM yêu cầu `k` là số nguyên dương không vượt số điểm, với giới hạn thêm là 100 thành phần cho GMM. API trả HTTP `400` khi `k` không hợp lệ.

t-SNE và UMAP nhận tối đa 1.000 hàng. PCA nhận đến giới hạn của ma trận. Client gửi ma trận đã chuẩn hóa. `normalization` mô tả phép tiền xử lý đã áp dụng, API không chuẩn hóa lại.

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

# HTTP với máy chủ loopback và dữ liệu mẫu trong RAM
npm run test:api
```

API mặc định nghe tại `127.0.0.1:5000`. Vite proxy các request `/api` đến địa chỉ này. Chế độ phát triển dùng tài khoản mẫu với dữ liệu trong RAM. Để dùng MongoDB, cấu hình `MONGODB_URI` và đặt `LAB_AUTH_PASSWORD` riêng, khác mật khẩu demo. `LAB_AUTH_EMAIL` cho phép đổi email đăng nhập. Chế độ lưu trữ được chọn khi khởi động. Nếu MongoDB lỗi lúc khởi động, API báo chế độ RAM cho đến lần khởi động kế tiếp. Lỗi ghi sau khi chọn MongoDB trả lỗi cho client. Với frontend khác origin, khai báo `LAB_ALLOWED_ORIGIN` cụ thể.

