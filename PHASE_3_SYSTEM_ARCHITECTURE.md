# 🛡️ KIẾN TRÚC HỆ THỐNG GIAI ĐOẠN 3: BACKEND API, XÁC THỰC 403 & BẢO MẬT NGINX

Tài liệu này giải thích chi tiết toàn bộ các tiêu chuẩn kỹ thuật, cơ chế bảo mật và giải pháp kiến trúc đã được triển khai cho hệ thống **Interactive High-Dimensional Data Explorer**.

---

## 1. Chuẩn hóa Phản Hồi (API Response) & Xử Lý Ngoại Lệ (Exception Handling)

### 1.1. Cấu trúc phản hồi chuẩn RESTful (`server/response.ts`)
Toàn bộ các API của hệ thống tuân thủ một định dạng dữ liệu đồng nhất duy nhất:

#### Khi Thành Công (HTTP 200 / 201):
```json
{
  "success": true,
  "data": {
    "coordinates": [[1.24, -0.45, 3.12], ...],
    "clusterAssignments": [0, 1, 0, ...],
    "silhouetteScore": 0.542
  },
  "timestamp": "2026-11-03T15:30:00.000Z"
}
```

#### Khi Thất Bại (HTTP 400, 401, 403, 404, 500):
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_ACCESS",
    "message": "Tài khoản (viewer) không có quyền thực hiện thao tác này (HTTP 403). Thao tác yêu cầu quyền: [admin].",
    "details": null
  },
  "timestamp": "2026-11-03T15:30:00.000Z"
}
```

### 1.2. Phân lớp ngoại lệ chuyên biệt (`server/errors.ts`)
Thay vì `throw new Error('string')` không rõ mã lỗi, hệ thống sử dụng phân cấp lớp kế thừa từ `AppError`:

| Lớp Ngoại Lệ | HTTP Status | Mã Error Code | Trường Hợp Sử Dụng |
|---|---|---|---|
| `BadRequestError` | **400** | `BAD_REQUEST` | Ma trận rỗng, file CSV sai cấu trúc, thiếu tham số thuật toán. |
| `UnauthorizedError` | **401** | `UNAUTHORIZED` | Chưa gửi Token, Token hết hạn hoặc sai chữ ký. |
| `ForbiddenError` | **403** | `FORBIDDEN_ACCESS` | Đã đăng nhập nhưng không đủ quyền thực thi hành động. |
| `NotFoundError` | **404** | `NOT_FOUND` | Bộ dữ liệu hoặc thí nghiệm không tồn tại trong CSDL. |
| `InternalServerError`| **500** | `INTERNAL_SERVER_ERROR`| Lỗi sập CSDL, lỗi bộ nhớ đệm hoặc tính toán thuật toán. |

---

## 2. Cơ Chế Xác Thực & Phân Quyền (RBAC) và Xử Lý Lỗi HTTP 403 Forbidden

### 2.1. Phân biệt rõ ràng 401 vs 403

```
Client Gửi Request
       │
       ▼
Có gửi Token hợp lệ không?
  ├── KHÔNG ──► Trả về HTTP 401 Unauthorized ("Bạn là ai? Cần đăng nhập")
  │
  └── CÓ (User đã xác thực danh tính)
        │
        ▼
   Vai trò (Role) của User có được phép làm việc này không?
     ├── KHÔNG ──► Trả về HTTP 403 Forbidden ("Biết bạn là ai, nhưng BẠN KHÔNG CÓ QUYỀN")
     └── CÓ    ──► Cho phép thực thi nghiệp vụ (200 OK)
```

### 2.2. Phân quyền vai trò người dùng trong hệ thống
Hệ thống thiết lập 3 vai trò người dùng (RBAC):
1. **`admin` (Quản trị viên):** Toàn quyền (xem 3D, chạy thuật toán, tải CSV, xóa dataset, dọn RAM cache).
2. **`researcher` (Nhà nghiên cứu):** Chạy tính toán, lưu thí nghiệm, tải dữ liệu CSV (không được xóa dataset hoặc dọn cache máy chủ).
3. **`viewer` (Khách tham quan):** Chỉ xem trực quan hóa 3D và chạy thử thuật toán (không được tải tệp lên hoặc xóa dữ liệu).

### 2.3. Bắt lỗi và Khắc phục khi gặp HTTP 403
- **Ở Backend:** Middleware `requireRole(['admin'])` sẽ chặn ngay từ cửa ngõ, không cho phép truy cập xuống tầng CSDL, trả về lỗi 403 chuẩn:
  ```json
  {
    "success": false,
    "error": {
      "code": "FORBIDDEN_ACCESS",
      "message": "Tài khoản (viewer) không có quyền xóa bộ dữ liệu này (HTTP 403)."
    }
  }
  ```
- **Ở Frontend:** `src/utils/apiClient.ts` bắt mã trạng thái HTTP 403, hiển thị thông báo rõ ràng:
  `"[403 Bị từ chối truy cập]: Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Quản trị viên để nâng cấp tài khoản."`
- **Cách khắc phục:**
  - Nếu đang kiểm thử, có thể gọi `POST /api/auth/login` với `{ "role": "admin" }` để nhận `admin_token`.
  - Trong thực tế, quản trị viên hệ thống sẽ gán lại quyền trong cơ sở dữ liệu người dùng.

---

## 3. Kiến Trúc Bảo Mật Nginx & Chặn Tấn Công DDoS

Cấu hình mẫu được lưu tại: [`nginx/nginx.conf`](file:///d:/3D_Dimension/Interactive-High-Dimensional-Data-Explorer/nginx/nginx.conf).

### 3.1. Các kỹ thuật Nginx chặn DDoS ở tầng ứng dụng (Layer 7)

```
        Internet (Hàng ngàn kết nối / DDoS)
                         │
                         ▼
             [ NGINX REVERSE PROXY ]
   ┌───────────────────────────────────────────────┐
   │ 1. Chống Slowloris (Timeout 10s)             │
   │ 2. Giới hạn kết nối (Tối đa 20 conn/IP)       │
   │ 3. Rate Limit chung (15 req/s per IP)         │
   │ 4. Rate Limit thuật toán nặng (3 req/s per IP)│
   └───────────────────────────────────────────────┘
            │                            │
   (Tệp tĩnh Cache 30 ngày)     (Request hợp lệ an toàn)
            ▼                            ▼
  [ /var/www/dist (Vite) ]      [ Node.js Express API:5000 ]
```

1. **Kiểm soát tần suất (Rate Limiting - `limit_req_zone`):**
   - **Endpoint thông thường (`/api/`):** Giới hạn tối đa **15 requests/giây** trên mỗi IP (`burst=25 nodelay`). Nếu vượt quá ngưỡng, Nginx lập tức trả về mã **HTTP 429 Too Many Requests**, bảo vệ Node.js không bị treo event loop.
   - **Endpoint tính toán nặng (`/api/compute`):** Thuật toán t-SNE / UMAP tốn rất nhiều CPU. Nginx áp dụng luật nghiêm ngặt: tối đa **3 requests/giây** trên mỗi IP (`burst=5`).
2. **Giới hạn kết nối đồng thời (`limit_conn_zone`):**
   - Mỗi địa chỉ IP chỉ được phép mở tối đa **20 kết nối đồng thời**.
3. **Chống tấn công treo kết nối chậm (Slowloris Attack):**
   - Hạ `client_body_timeout 10s` và `client_header_timeout 10s`. Nếu kẻ tấn công cố tình truyền từng byte để giữ kết nối, Nginx sẽ tự động ngắt kết nối ngay lập tức.
4. **Giới hạn kích thước Payload (`client_max_body_size 50M`):**
   - Chặn các đợt tấn công bơm file rác làm đầy ổ đĩa hoặc tràn RAM server.

---

## 4. Bản Chất HTTPS, Cổng 80 và Cổng 443

### 4.1. Cổng 80 là gì?
- **Cổng 80 (Port 80)** là cổng mặc định theo quy chuẩn quốc tế dành cho giao thức **HTTP không mã hóa**.
- Mọi dữ liệu truyền qua cổng 80 đều ở dạng **văn bản rõ (Plaintext)**. Nếu hacker đứng cùng mạng Wi-Fi hoặc nhà mạng nghe lén, chúng có thể đọc được toàn bộ mật khẩu, cookie và dữ liệu bệnh án gửi lên.

### 4.2. Cổng 443 là gì?
- **Cổng 443 (Port 443)** là cổng mặc định dành cho giao thức **HTTPS (HTTP Secure)**.
- Dữ liệu trước khi rời khỏi máy người dùng được mã hóa bằng thuật toán **AES-256 (TLS 1.3)**. Kẻ nghe lén chỉ thấy chuỗi byte ngẫu nhiên vô nghĩa.

### 4.3. Cơ chế hoạt động của Nginx khi chuyển hướng Cổng 80 sang Cổng 443
Theo chuẩn thiết kế hệ thống hiện đại, server mở cổng 80 **không phải để phục vụ web**, mà làm đúng một nhiệm vụ: **Chuyển hướng vĩnh viễn (HTTP 301 Permanent Redirect) sang cổng 443**:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Mọi request đến http://... tự động bị đá sang https://...
    location / {
        return 301 https://$host$request_uri;
    }
}
```

Khi người dùng gõ vào trình duyệt `http://domain.com`:
1. Trình duyệt gửi gói tin đến cổng 80.
2. Nginx phản hồi ngay lập tức mã `301 Moved Permanently` với header `Location: https://domain.com`.
3. Trình duyệt tự động chuyển sang cổng 443, thực hiện bắt tay mã hóa TLS (*TLS Handshake*) và hiển thị ổ khóa xanh bảo mật.
4. Trình duyệt tự động lưu chỉ thị **HSTS (Strict-Transport-Security)**: trong vòng 2 năm tiếp theo, máy khách sẽ không bao giờ gửi request cổng 80 nữa mà luôn vào thẳng 443.

---

## 5. Hướng Dẫn Vận Hành & Khởi Chạy

### Khởi chạy Backend đã chuẩn hóa (với RBAC & Error Handling):
```bash
npm run server
```

### Khởi chạy toàn bộ hệ thống (Frontend + Backend):
```bash
npm run dev:all
```

### Kiểm tra cú pháp cấu hình Nginx trên máy chủ Linux/Ubuntu:
```bash
# Kiểm tra cú pháp file config
sudo nginx -t -c /path/to/nginx/nginx.conf

# Nạp lại cấu hình không làm gián đoạn người dùng (Zero Downtime Reload)
sudo nginx -s reload
```

