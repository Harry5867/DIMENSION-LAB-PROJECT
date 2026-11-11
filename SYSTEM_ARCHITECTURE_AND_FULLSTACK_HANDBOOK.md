> **Phạm vi cần đọc trước:** Đây là handbook kiến trúc tổng quát, không phải mô tả implementation hiện tại của Dimension Lab. Các ví dụ PostgreSQL/Redis/Kafka/Python trong tài liệu không khớp với ứng dụng hiện tại và xung đột với project working rules supplied for this task. Đối chiếu [System Flow](docs/SYSTEM_FLOW.md), [API Design](docs/API_DESIGN.md) và [Docker/MongoDB](docs/DOCKER_MONGODB_DATA_FLOW.md) trước khi áp dụng bất kỳ công nghệ nào.
# CẨM NANG TOÀN DIỆN VỀ KIẾN TRÚC HỆ THỐNG & FULL-STACK
> **Dành cho Kỹ sư Phần mềm, Technical Architect & AI System Engineer**
>
> *Được biên soạn và cấu trúc hóa tuần tự từ nền tảng đến chuyên sâu: Vòng đời sản phẩm ➔ Kiến trúc Backend ➔ Mạng phân tán ➔ Bảo mật mật mã học ➔ Cơ sở dữ liệu & Concurrency ➔ Đồ họa Frontend ➔ Tích hợp AI ➔ Vận hành DevOps & SRE.*

---

## MỤC LỤC THEO TIẾN TRÌNH HỌC TẬP VÀ XÂY DỰNG HỆ THỐNG

- [PHẦN 1: BỨC TRANH TOÀN CẢNH & VÒNG ĐỜI SẢN PHẨM TỪ ZERO ĐẾN PRODUCTION](#phần-1-bức-tranh-toàn-cảnh--vòng-đời-sản-phẩm-từ-zero-đến-production)
  - [1.1. Năm tầng công nghệ hợp nhất một Web Product](#11-năm-tầng-công-nghệ-hợp-nhất-một-web-product)
  - [1.2. Bản đồ hành trình của một Request (End-to-End Request Flow)](#12-bản-đồ-hành-trình-của-một-request-end-to-end-request-flow)
- [PHẦN 2: KIẾN TRÚC TẦNG BACKEND & THIẾT KẾ PHẦN MỀM](#phần-2-kiến-trúc-tầng-backend--thiết-kế-phần-mềm)
  - [2.1. Service nghiệp vụ (Business Service) là gì và thực thi thế nào?](#21-service-nghiệp-vụ-business-service-là-gì-và-thực-thi-thế-nào)
  - [2.2. Kiến trúc Lục giác (Hexagonal Architecture / Ports & Adapters)](#22-kiến-trúc-lục-giác-hexagonal-architecture--ports--adapters)
  - [2.3. Các loại Ports: Inbound Port, Outbound Port, Repository & Infrastructure](#23-các-loại-ports-inbound-port-outbound-port-repository--infrastructure)
  - [2.4. Adapters: Primary (Driving) vs Secondary (Driven) Adapters](#24-adapters-primary-driving-vs-secondary-driven-adapters)
  - [2.5. Thiết kế API chuẩn công nghiệp: Functional, Non-Functional, Testing & Security](#25-thiết-kế-api-chuẩn-công-nghiệp)
  - [2.6. Kỹ thuật phân trang dữ liệu: Offset-based vs Cursor-based Pagination](#26-kỹ-thuật-phân-trang-dữ-liệu-offset-based-vs-cursor-based-pagination)
- [PHẦN 3: GIAO TIẾP MẠNG, THỜI GIAN THỰC & HỆ THỐNG PHÂN TÁN](#phần-3-giao-tiếp-mạng-thời-gian-thực--hệ-thống-phân-tán)
  - [3.1. WebSocket vs Apache Kafka: Bản chất, vị trí và cách phối hợp](#31-websocket-vs-apache-kafka-bản-chất-vị-trí-và-cách-phối-hợp)
  - [3.2. Push Notification: Web Push (VAPID), Mobile (FCM/APNs) & In-App](#32-push-notification-web-push-vapid-mobile-fcmapns--in-app)
  - [3.3. Giao dịch phân tán trong Microservices: Saga Pattern & Transactional Outbox](#33-giao-dịch-phân-tán-trong-microservices-saga-pattern--transactional-outbox)
- [PHẦN 4: AN TOÀN THÔNG TIN, XÁC THỰC & MẬT MÃ HỌC](#phần-4-an-toàn-thông-tin-xác-thực--mật-mã-học)
  - [4.1. Sáu trụ cột an toàn thông tin (Information Security Pillars)](#41-sáu-trụ-cột-an-toàn-thông-tin-information-security-pillars)
  - [4.2. JSON Web Token (JWT): Cấu trúc 3 phần và cơ chế Stateless](#42-json-web-token-jwt-cấu-trúc-3-phần-và-cơ-chế-stateless)
  - [4.3. Access Token & Refresh Token: Vòng đời, Token Rotation và lưu trữ an toàn](#43-access-token--refresh-token-vòng-đời-token-rotation-và-lưu-trữ-an-toàn)
  - [4.4. Chữ ký số xác thực (Digital Signature) & Tính toàn vẹn](#44-chữ-ký-số-xác-thực-digital-signature--tính-toàn-vẹn)
  - [4.5. Mã hóa JWT (JWE vs JWS) và các phương pháp mã hóa đối xứng/bất đối xứng](#45-mã-hóa-jwt-jwe-vs-jws-và-các-phương-pháp-mã-hóa-đối-xứngbất-đối-xứng)
  - [4.6. Giao thức ECDH, Hexagonal Architecture và Microservices Zero-Trust (mTLS)](#46-giao-thức-ecdh-hexagonal-architecture-và-microservices-zero-trust-mtls)
  - [4.7. Phòng thủ các lỗ hổng web kinh điển: XSS, CSRF, CORS & SQL Injection](#47-phòng-thủ-các-lỗ-hổng-web-kinh-điển-xss-csrf-cors--sql-injection)
- [PHẦN 5: CƠ SỞ DỮ LIỆU, CACHE & ĐỒNG BỘ TRẠNG THÁI](#phần-5-cơ-sở-dữ-liệu-cache--đồng-bộ-trạng-thái)
  - [5.1. Toàn tập lưu trữ: Cục bộ (Client) vs Đám mây / Phân tán (Server)](#51-toàn-tập-lưu-trữ-cục-bộ-client-vs-đám-mây--phân-tán-server)
  - [5.2. Cấu trúc tổng thể hệ thống, Database Schema Design & Migration bằng Code](#52-cấu-trúc-tổng-thể-hệ-thống-database-schema-design--migration-bằng-code)
  - [5.3. Xử lý tranh chấp dữ liệu (Concurrency Control): Optimistic vs Pessimistic vs Distributed Lock](#53-xử-lý-tranh-chấp-dữ-liệu-concurrency-control-optimistic-vs-pessimistic-vs-distributed-lock)
  - [5.4. Ba "thảm họa" kinh điển của bộ nhớ Cache và cách phòng thủ](#54-ba-thảm-họa-kinh-điển-của-bộ-nhớ-cache-và-cách-phòng-thủ)
- [PHẦN 6: TRẢI NGHIỆM NGƯỜI DÙNG & ĐỒ HỌA HIỆU NĂNG CAO (FRONTEND)](#phần-6-trải-nghiệm-người-dùng--đồ-họa-hiệu-năng-cao-frontend)
  - [6.1. Kỹ thuật điều chỉnh độ phân giải, LOD (Level of Detail) trong 3D WebGL](#61-kỹ-thuật-điều-chỉnh-độ-phân-giải-lod-level-of-detail-trong-3d-webgl)
  - [6.2. Xử lý lag mạng, nghẽn băng thông và suy thoái nhẹ nhàng (Graceful Degradation)](#62-xử-lý-lag-mạng-nghẽn-băng-thông-và-suy-thoái-nhẹ-nhàng-graceful-degradation)
- [PHẦN 7: TÍCH HỢP TRÍ TUỆ NHÂN TẠO & HỆ THỐNG DỮ LIỆU VECTOR](#phần-7-tích-hợp-trí-tuệ-nhân-tạo--hệ-thống-dữ-liệu-vector)
  - [7.1. Bản chất mô hình AI: 1B, 2B, 7B parameters là gì? Công thức tính VRAM](#71-bản-chất-mô-hình-ai-1b-2b-7b-parameters-là-gì-công-thức-tính-vram)
  - [7.2. Kỹ thuật Lượng tử hóa (Quantization) và Tốc độ suy luận (Tokens/s, TTFT)](#72-kỹ-thuật-lượng-tử-hóa-quantization-và-tốc-độ-suy-luận-tokenss-ttft)
  - [7.3. Kiến trúc RAG (Retrieval-Augmented Generation) & Vector Database](#73-kiến-trúc-rag-retrieval-augmented-generation--vector-database)
  - [7.4. Tối ưu hệ thống: AI Performance vs System Performance](#74-tối-ưu-hệ-thống-ai-performance-vs-system-performance)
- [PHẦN 8: VẬN HÀNH PRODUCTION, ĐỘ TIN CẬY & CHI PHÍ (DEVOPS & FINOPS)](#phần-8-vận-hành-production-độ-tin-cậy--chi-phí-devops--finops)
  - [8.1. Cơ chế tự phục hồi: Circuit Breaker Pattern & Exponential Backoff](#81-cơ-chế-tự-phục-hồi-circuit-breaker-pattern--exponential-backoff)
  - [8.2. Khả năng quan sát toàn diện (Observability: Logs, Metrics, Tracing)](#82-khả-năng-quan-sát-toàn-diện-observability-logs-metrics-tracing)
  - [8.3. Chiến lược phát hành không gián đoạn (Zero-Downtime Deployment)](#83-chiến-lược-phát-hành-không-gián-đoạn-zero-downtime-deployment)
  - [8.4. Quản trị và tối ưu chi phí hạ tầng đám mây / GPU (FinOps)](#84-quản-trị-và-tối-ưu-chi-phí-hạ-tầng-đám-mây--gpu-finops)

---

# PHẦN 1: BỨC TRANH TOÀN CẢNH & VÒNG ĐỜI SẢN PHẨM TỪ ZERO ĐẾN PRODUCTION

## 1.1. Năm tầng công nghệ hợp nhất một Web Product
Một ứng dụng thương mại hoàn chỉnh (Product-Grade) phục vụ hàng nghìn đến hàng triệu người dùng không thể chỉ viết code và chạy trên máy tính cá nhân (`localhost`). Nó được hợp nhất bởi 5 tầng kiến trúc:

```
[ NGƯỜI DÙNG / TRÌNH DUYỆT ]
          │
          ▼  (HTTPS / TLS 1.3)
┌────────────────────────────────────────────────────────┐
│ 1. EDGE & CDN LAYER (Cloudflare, AWS CloudFront)       │
│    - Cache tài nguyên tĩnh (HTML/CSS/JS, 3D Assets)     │
│    - Web Application Firewall (WAF) chặn Bot, DDoS      │
│    - Định tuyến Geo-DNS đến máy chủ gần người dùng nhất│
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 2. GATEWAY & REVERSE PROXY (Nginx, Kong, Traefik)     │
│    - Giải mã SSL (SSL Termination)                     │
│    - Giới hạn tần suất gọi (Rate Limiting)             │
│    - Cân bằng tải (Load Balancing: Round Robin, Least) │
│    - Xác thực sơ bộ JWT Token trước khi vào mạng trong │
└─────────────────────────┬──────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ 3. APPLICATION & BUSINESS CORE LAYER (NestJS, Go, Java)│
│    - Tầng Điều khiển tiếp nhận dữ liệu (Controllers)   │
│    - Tầng Service Nghiệp vụ (Business Rules)           │
│    - Tầng Xử lý bất đồng bộ (Background Workers)       │
│    - Tầng Khai phá dữ liệu & Suy luận AI Engine        │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       (TCP/SQL)│                        │(Event-Driven)
                ▼                        ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ 4. DATA & CACHE LAYER        │ │ 5. DISTRIBUTED MESSAGING     │
│  - PostgreSQL: Dữ liệu ACID  │ │  - Apache Kafka / RabbitMQ:  │
│  - Redis: Cache siêu tốc     │ │    Điều phối sự kiện không   │
│  - S3 / MinIO: Lưu file thô  │ │    đồng bộ giữa các dịch vụ  │
│  - Qdrant: Vector DB cho AI  │ │  - WebSocket Server: Realtime│
└──────────────────────────────┘ └──────────────────────────────┘
```

## 1.2. Bản đồ hành trình của một Request (End-to-End Request Flow)
Khi người dùng bấm nút **"Chạy phân cụm K-Means 3D"**:
1. **Frontend (Browser)**: Gói ma trận đặc trưng thành JSON, đính kèm `Authorization: Bearer <AccessToken>`, gửi HTTP POST tới `https://app.example.com/api/v1/clustering`.
2. **Cloudflare (Edge)**: Kiểm tra chữ ký IP, giải mã DNS, xác nhận không phải tấn công DDoS, chuyển tiếp gói tin về máy chủ gốc.
3. **API Gateway**: Giải mã SSL, kiểm tra IP không vượt quá 60 request/phút. Chuyển request vào mạng nội bộ cụm Kubernetes.
4. **Backend Controller**: Đón nhận HTTP Body, dùng bộ thư viện thẩm định cú pháp (Validation Pipe) kiểm tra tham số $k > 0$. Nếu hợp lệ, chuyển giao cho **Business Service**.
5. **Business Service**: Kiểm tra quyền truy cập tập dữ liệu của User $\rightarrow$ Đọc dữ liệu từ Database hoặc Redis Cache $\rightarrow$ Kích hoạt thuật toán tính toán K-Means $\rightarrow$ Lưu kết quả vào DB $\rightarrow$ Bắn sự kiện sang Kafka.
6. **Frontend ThreeCanvas** nhận tọa độ, nhãn cụm và cờ bất thường để hiển thị kết quả 3D. Các điểm chuyển dần sang tọa độ mới và người dùng có thể đánh dấu điểm bất thường bằng **Highlight outliers**.

---

# PHẦN 2: KIẾN TRÚC TẦNG BACKEND & THIẾT KẾ PHẦN MỀM

## 2.1. Service nghiệp vụ (Business Service) là gì và thực thi thế nào?
- **Vị trí**: Nằm trọn vẹn ở **BACKEND**, là trái tim của ứng dụng.
- **Bản chất**: Service nghiệp vụ (hay Domain/Application Service) là nơi tập trung toàn bộ **các quy tắc kinh doanh (Business Logic)** thực tế của dự án.
- **Tại sao cần tách riêng?**:
  - Không để Controller bị "phình to" (Fat Controller). Controller chỉ có nhiệm vụ: nhận request, validate cú pháp HTTP, gọi Service và trả về response.
  - Khi bạn muốn đổi giao thức từ REST API sang GraphQL hay gRPC, bạn **chỉ cần viết lại Controller**, toàn bộ code trong Business Service được tái sử dụng 100%.

## 2.2. Kiến trúc Lục giác (Hexagonal Architecture / Ports & Adapters)
*(Thuật ngữ bạn hỏi "hessa gold" chính là **Hexagonal Architecture**, do Alistair Cockburn đề xướng)*.

- **Triết lý**: Cô lập hoàn toàn Logic nghiệp vụ cốt lõi (Domain Core) ở trung tâm. Thế giới bên ngoài (Database, Framework, UI, Mail server) chỉ là các chi tiết ngoại vi, có thể tháo lắp tùy ý mà không chạm vào nghiệp vụ.

```
                  ┌────────────────────────────────────────┐
                  │          DRIVING ADAPTERS              │
                  │  (REST Controller, GraphQL, CLI)       │
                  └──────────────────┬─────────────────────┘
                                     │ (calls)
                                     ▼
                  ┌────────────────────────────────────────┐
                  │       INBOUND / DRIVING PORTS          │
                  │        (Usecase Interfaces)            │
                  ├────────────────────────────────────────┤
                  │                                        │
                  │           DOMAIN BUSINESS CORE         │
                  │          (Pure Business Logic)         │
                  │                                        │
                  ├────────────────────────────────────────┤
                  │       OUTBOUND / DRIVEN PORTS          │
                  │        (Repository Interfaces)         │
                  └──────────────────┬─────────────────────┘
                                     │ (implemented by)
                                     ▼
                  ┌────────────────────────────────────────┐
                  │          DRIVEN ADAPTERS               │
                  │  (Postgres DB, Redis, S3, Kafka)       │
                  └────────────────────────────────────────┘
```

## 2.3. Các loại Ports: Inbound Port, Outbound Port, Repository & Infrastructure
- **Port** thực chất là các **Interface (Hợp đồng giao tiếp)** trong ngôn ngữ lập trình (TypeScript, Java, Go).
1. **Inbound / Driving Port (Port đầu vào)**:
   - Định nghĩa hành vi nghiệp vụ mà bên ngoài có thể yêu cầu Core thực hiện.
   - *Ví dụ Interface TypeScript*:
     ```typescript
     export interface RunClusteringUseCasePort {
       execute(command: RunClusteringCommand): Promise<ClusteringResult>;
     }
     ```
2. **Outbound / Driven Port (Port đầu ra - Repository / Hạ tầng)**:
   - Interface do Core đặt ra để yêu cầu tầng hạ tầng phải đáp ứng dữ liệu cho nó.
   - *Ví dụ Interface TypeScript*:
     ```typescript
     export interface DatasetRepositoryPort {
       findById(id: string): Promise<DatasetEntity | null>;
       saveResult(datasetId: string, result: ClusteringResult): Promise<void>;
     }
     ```

## 2.4. Adapters: Primary (Driving) vs Secondary (Driven) Adapters
- **Adapter** là phần mềm cụ thể hóa (Implementation) các Interface của Port:
1. **Primary / Driving Adapter (Bộ chuyển đổi chủ động)**:
   - Tiếp nhận input từ thế giới bên ngoài, chuyển thành Domain Object rồi gọi qua Inbound Port.
   - *Ví dụ*: `ExpressClusteringController.ts` đọc HTTP Body $\rightarrow$ biến thành `RunClusteringCommand` $\rightarrow$ gọi `useCase.execute()`.
2. **Secondary / Driven Adapter (Bộ chuyển đổi bị động)**:
   - Cài đặt cụ thể các Outbound Port bằng công nghệ cụ thể.
   - *Ví dụ*: `PostgresDatasetRepository.ts` sử dụng Prisma/TypeORM để chọc vào cơ sở dữ liệu PostgreSQL thực tế. Nếu ngày mai sếp yêu cầu đổi sang MongoDB, bạn chỉ cần tạo file `MongoDatasetRepository.ts` mà không sửa một chữ nào trong nghiệp vụ lõi!

## 2.5. Thiết kế API chuẩn công nghiệp
Một API chuẩn quốc tế cần được định nghĩa trên 2 trục:

### A. Đặc tả chức năng (Functional Specifications)
- Tuân thủ RESTful: Dùng danh từ số nhiều, URI đại diện cho tài nguyên (`/api/v1/datasets`, `/api/v1/workspaces/{id}`).
- Sử dụng đúng mã trạng thái HTTP:
  - `200 OK`: Thành công trả về dữ liệu.
  - `201 Created`: Tạo mới thành công (Upload dataset mới).
  - `400 Bad Request`: Sai tham số đầu vào.
  - `401 Unauthorized`: Chưa đăng nhập hoặc Token hết hạn.
  - `403 Forbidden`: Đã đăng nhập nhưng không đủ quyền hạn (Role) truy cập.
  - `404 Not Found`: Không tìm thấy tài nguyên.
  - `429 Too Many Requests`: Vượt quá giới hạn gọi API.
  - `500 Internal Server Error`: Lỗi sập code phía server.
- Sử dụng **OpenAPI / Swagger** để tạo tài liệu tương tác tự động cho Frontend.

### B. Đặc tả phi chức năng (Non-Functional Specifications)
- **Độ trễ (Latency)**: Thời gian phản hồi phân vị 95 ($p95$) phải $< 200ms$.
- **Khả năng chịu tải (Throughput)**: Chịu tải tối thiểu $1.000$ RPS.
- **Tính lũy kế (Idempotency)**: Cho phép Client gửi lại request mà không sợ tạo ra 2 giao dịch trùng nhau bằng cách sử dụng `Idempotency-Key` trong Header.

### C. Kim tự tháp kiểm thử (Testing Pyramid)
- **Unit Test (70%)**: Kiểm tra tính đúng đắn của từng thuật toán (PCA, K-Means, tính Silhouette Score).
- **Integration Test (20%)**: Kiểm tra tầng Adapter kết nối thực tế với Postgres/Redis trong container.
- **E2E / Load Test (10%)**: Dùng công cụ **k6** hoặc **Playwright** giả lập 5.000 người dùng thực tế thao tác liên tục trên trình duyệt.

## 2.6. Kỹ thuật phân trang dữ liệu: Offset-based vs Cursor-based Pagination
- **Tại sao cần?**: Tránh việc câu lệnh `SELECT *` kéo hàng triệu dòng làm tràn RAM máy chủ và đơ trình duyệt.

```sql
-- Offset Pagination: Bỏ qua 10.000 dòng đầu rồi lấy 20 dòng
SELECT * FROM points WHERE dataset_id = 'abc' ORDER BY id ASC LIMIT 20 OFFSET 10000;

-- Cursor (Keyset) Pagination: Nhảy thẳng đến điểm mốc kế tiếp
SELECT * FROM points WHERE dataset_id = 'abc' AND id > 10000 ORDER BY id ASC LIMIT 20;
```

| Tiêu chí | **Offset-based Pagination** | **Cursor-based (Keyset) Pagination** |
| :--- | :--- | :--- |
| **Bản chất** | Dựa trên số trang ($Page$) và vị trí dời ($Offset$). | Dựa trên định danh của bản ghi cuối cùng đã xem ($Cursor$). |
| **Tốc độ khi dữ liệu lớn** | Cực kỳ chậm ở trang sâu (phải duyệt bỏ $N$ dòng đầu). | Cực nhanh và ổn định $O(1)$ nhờ tìm kiếm trực tiếp trên Index B-Tree. |
| **Trôi dữ liệu (Data Drift)** | Rất dễ bị trùng hoặc sót bản ghi nếu có dữ liệu mới chèn vào. | Tuyệt đối không bao giờ bị trùng/sót bản ghi. |
| **Trường hợp sử dụng** | Bảng quản trị (Admin Portal), cần bấm nhảy trang 1, 2, 3... | Bảng tin (Feed), cuộn vô tận (Infinite Scroll), tải ma trận điểm 3D lớn. |

---

# PHẦN 3: GIAO TIẾP MẠNG, THỜI GIAN THỰC & HỆ THỐNG PHÂN TÁN

## 3.1. WebSocket vs Apache Kafka: Bản chất, vị trí và cách phối hợp
- **Ranh giới công nghệ**:
  - **WebSocket**: Kênh giao tiếp **Frontend $\longleftrightarrow$ Backend** qua giao thức TCP liên tục hai chiều.
  - **Apache Kafka**: Hạ tầng truyền phát sự kiện **Backend Service $\longleftrightarrow$ Backend Service** qua mô hình Pub/Sub phân tán.

```
[ FRONTEND A ] ──WebSocket──► [ API Gateway / Ingress ] ──Produce──► [ KAFKA CLUSTER ]
                                                                            │
[ FRONTEND B ] ◄──WebSocket── [ Notification Service ] ◄──Consume───────────┘
```

- **Mục đích sử dụng**:
  - Khi người dùng gửi một tập dữ liệu 1 triệu dòng để tính PCA, việc tính toán mất 15 giây.
  - Server tiếp nhận request $\rightarrow$ Bắn một Message vào **Kafka Topic** `dataset-compute` $\rightarrow$ Trả về mã `202 Accepted` ngay cho client.
  - Một Worker chạy nền (Python Worker) nghe Kafka, lấy dữ liệu ra tính toán song song trên GPU.
  - Khi tính xong, Worker bắn thông báo sang **WebSocket Gateway** $\rightarrow$ WebSocket đẩy trực tiếp tọa độ 3D xuống màn hình của người dùng mà không cần reload trang.

## 3.2. Push Notification: Web Push (VAPID), Mobile (FCM/APNs) & In-App
- **Mục đích**: Gửi thông báo đến thiết bị của người dùng ngay cả khi họ **đã tắt hoàn toàn trang web hoặc ứng dụng**.
1. **Web Push Notification**:
   - Sử dụng chuẩn trình duyệt W3C Push API + Service Worker (tiến trình chạy ngầm của trình duyệt).
   - Server backend dùng cặp khóa mật mã **VAPID (Voluntary Application Server Identification)** để ký định danh với máy chủ thông báo của Google/Mozilla (FCM/Mozilla Push Server).
2. **Mobile Push Notification**:
   - iOS dùng dịch vụ APNs của Apple; Android dùng Firebase Cloud Messaging (FCM).
3. **In-App Toast Push**:
   - Dùng khi người dùng đang mở tab trang web: Sử dụng WebSocket hoặc SSE (Server-Sent Events) để bắn thông báo nổi góc phải màn hình.

## 3.3. Giao dịch phân tán trong Microservices: Saga Pattern & Transactional Outbox
- **Thách thức**: Trong hệ thống Microservices, mỗi service sở hữu một Database riêng biệt. Không thể dùng giao dịch `ACID` truyền thống để khóa bảng xuyên qua nhiều máy chủ.
1. **Saga Pattern**:
   - Chia một nghiệp vụ lớn thành một chuỗi các giao dịch cục bộ (Local Transactions).
   - Nếu một bước thất bại, Saga sẽ kích hoạt chuỗi **giao dịch bù trừ (Compensating Transactions)** để hoàn tác lại trạng thái cũ theo thứ tự ngược lại (ví dụ: Tự động cộng lại tiền vào tài khoản nếu việc tạo đơn hàng thất bại).
2. **Transactional Outbox Pattern**:
   - Giải quyết bài toán: *"Làm sao đảm bảo việc lưu dữ liệu vào Database và việc bắn Message sang Kafka diễn ra đồng thời 100%, không bị tình trạng DB lưu rồi nhưng mạng sập khiến Kafka không nhận được tin?"*.
   - Giải pháp: Tạo một bảng `outbox` ngay trong cùng Database nghiệp vụ. Lưu sự kiện vào bảng `outbox` trong cùng một Transaction với dữ liệu chính $\rightarrow$ Dùng một công cụ đọc log giao dịch (như Debezium / Kafka Connect) để chuyển tiếp tin nhắn sang Kafka một cách tin cậy tuyệt đối.

---

# PHẦN 4: AN TOÀN THÔNG TIN, XÁC THỰC & MẬT MÃ HỌC

## 4.1. Sáu trụ cột an toàn thông tin (Information Security Pillars)
Hệ thống cấp Enterprise bắt buộc phải được thiết kế xoay quanh 6 trụ cột:
1. **Tính bảo mật (Confidentiality)**: Đảm bảo dữ liệu chỉ được xem bởi những người được phép. (Công nghệ: Mã hóa TLS 1.3, AES-256 at Rest).
2. **Tính toàn vẹn (Integrity)**: Đảm bảo dữ liệu không bị sửa đổi, chèn ép trên đường truyền. (Công nghệ: Chữ ký số HMAC, SHA-256 Checksum).
3. **Tính xác thực (Authentication)**: Xác minh danh tính người gửi (Công nghệ: Mật khẩu băm Argon2id, Multi-Factor Auth 2FA, OAuth2/OIDC).
4. **Quyền kiểm soát (Authorization)**: Kiểm soát hành động mà tài khoản được phép làm (Công nghệ: Phân quyền RBAC, ABAC, Policy-as-Code).
5. **Tính khả dụng (Availability)**: Hệ thống luôn sẵn sàng phục vụ, không bị gián đoạn (Công nghệ: Chống DDoS, Cân bằng tải, Auto-scaling).
6. **Tính chống chối bỏ & Kiểm toán (Non-repudiation & Auditability)**: Người dùng thực hiện hành vi không thể chối cãi được (Công nghệ: Audit Log bất biến ghi nhận IP, Timestamp, User Action).

## 4.2. JSON Web Token (JWT): Cấu trúc 3 phần và cơ chế Stateless
- **Vị trí**: **Backend** tạo và kiểm tra chữ ký; **Frontend** lưu trữ và gửi kèm Header `Authorization: Bearer <token>`.
- **Tại sao sử dụng?**: Cơ chế **Stateless (Phi trạng thái)** - Máy chủ không cần lưu session trong RAM. Bất kỳ máy chủ nào trong cụm cluster cũng có thể tự xác minh token mà không cần hỏi Database, giúp hệ thống scale ngang vô tận.

```
       HEADER                     PAYLOAD                     SIGNATURE
┌──────────────────┐       ┌──────────────────┐       ┌────────────────────────┐
│ {                │       │ {                │       │ HMACSHA256(            │
│   "alg": "HS256",│   .   │   "sub": "user1",│   .   │   base64(Header) + "."+│
│   "typ": "JWT"   │       │   "role": "admin"│       │   base64(Payload),     │
│ }                │       │ }                │       │   SECRET_KEY           │
└──────────────────┘       └──────────────────┘       │ )                      │
                                                      └────────────────────────┘
```

## 4.3. Access Token & Refresh Token: Vòng đời, Token Rotation và lưu trữ an toàn
- **Access Token**: Hạn sống rất ngắn (5 - 15 phút), dùng để gọi tài nguyên. Nếu bị lộ, hacker chỉ khai thác được trong 15 phút.
- **Refresh Token**: Hạn sống dài (7 - 30 ngày), chỉ dùng để xin cấp Access Token mới qua endpoint `/auth/refresh`.
- **Cơ chế Token Rotation**: Mỗi lần dùng Refresh Token để lấy Access Token mới, hệ thống sẽ **hủy luôn Refresh Token cũ** và cấp một Refresh Token mới. Nếu phát hiện Refresh Token cũ bị dùng lại lần 2 $\rightarrow$ Báo động tài khoản bị tấn công và lập tức khóa toàn bộ phiên đăng nhập!
- **Nơi lưu trữ an toàn nhất**:
  - Lưu Refresh Token trong **HttpOnly, Secure, SameSite=Strict Cookie** $\rightarrow$ JavaScript trên trình duyệt không thể chạm vào, miễn nhiễm 100% với mã độc XSS.

## 4.4. Chữ ký số xác thực (Digital Signature) & Tính toàn vẹn
- **Nguyên lý mã hóa bất đối xứng (Asymmetric Cryptography)**:
  - Máy chủ giữ một **Private Key (Khóa riêng tư - Bí mật tuyệt đối)**.
  - Máy chủ công khai một **Public Key (Khóa công khai)** cho toàn thế giới biết.
  - Khi Server cấp JWT, nó dùng Private Key để ký (thuật toán `RS256` hoặc `ES256`).
  - Các Microservice khác chỉ cần dùng Public Key để kiểm tra chữ ký. Hacker dù có đánh cắp được Public Key cũng không bao giờ có thể tạo giả được một token hợp lệ!

## 4.5. Mã hóa JWT (JWE vs JWS) và các phương pháp mã hóa đối xứng/bất đối xứng
- **JWS (JSON Web Signature)**: Hầu hết JWT thông thường là JWS. Nội dung Payload **chỉ được mã hóa Base64 chứ không hề được che giấu**. Bất kỳ ai chặn bắt gói tin đều có thể dịch ngược và đọc được dữ liệu.
- **JWE (JSON Web Encryption)**: Dữ liệu Payload thực sự bị **mã hóa thành chuỗi nhị phân mã độc không thể đọc được**. Dùng khi cần nhét dữ liệu cực kỳ nhạy cảm (số tài khoản, thẻ căn cước) vào trong Token.
- **Phương pháp mã hóa**:
  - Mã hóa đối xứng: Dùng chung 1 khóa bí mật qua thuật toán siêu nhanh `AES-256-GCM`.
  - Mã hóa bất đối xứng: Mã hóa bằng Public Key qua `RSA-OAEP-256` và giải mã bằng Private Key.

## 4.6. Giao thức ECDH, Hexagonal Architecture và Microservices Zero-Trust (mTLS)
- **ECDH (Elliptic-curve Diffie–Hellman)**:
  - Giao thức trao đổi khóa dựa trên đường cong Elliptic. Cho phép 2 máy chủ dù đang nói chuyện trên một đường truyền mạng không an toàn có thể **tự tính toán ra cùng một Khóa bí mật chung (Shared Secret)** mà kẻ nghe lén ở giữa không thể giải được.
- **Ứng dụng trong Microservices Zero-Trust**:
  - Bên trong cụm Microservices, các Adapter mạng của Hexagonal Architecture không gửi dữ liệu dạng văn bản rõ (plaintext).
  - Từng cặp microservice tự động bắt tay nhau bằng giao thức **ECDH** để thiết lập đường hầm mã hóa hai chiều **mTLS (Mutual TLS)** $\rightarrow$ Dù hacker có cài được mã độc vào trong hạ tầng máy chủ cũng không thể bắt trộm dữ liệu giao dịch nội bộ.

## 4.7. Phòng thủ các lỗ hổng web kinh điển: XSS, CSRF, CORS & SQL Injection
- **XSS (Cross-Site Scripting)**: Hacker tiêm mã JavaScript độc hại vào trang web. Phòng thủ bằng cách: Encode toàn bộ HTML, sử dụng Content Security Policy (CSP) chặt chẽ và lưu trữ Token trong HttpOnly Cookie.
- **CSRF (Cross-Site Request Forgery)**: Hacker lừa trình duyệt của nạn nhân tự động gửi request có kèm cookie đăng nhập. Phòng thủ bằng cách: Cấu hình Cookie `SameSite=Strict` và dùng CSRF Token kép (Double-Submit Cookie).
- **CORS (Cross-Origin Resource Sharing)**: Cơ chế an ninh của trình duyệt nhằm ngăn chặn trang web lạ gọi trộm API của bạn. Phải cấu hình server chỉ chấp nhận `Access-Control-Allow-Origin` từ đúng domain chính thức của sản phẩm.

---

# PHẦN 5: CƠ SỞ DỮ LIỆU, CACHE & ĐỒNG BỘ TRẠNG THÁI

## 5.1. Toàn tập lưu trữ: Cục bộ (Client) vs Đám mây / Phân tán (Server)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TẦNG TRÌNH DUYỆT (CLIENT)                       │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ LocalStorage      │ SessionStorage    │ IndexedDB                      │
│ - Dung lượng ~5MB │ - Dung lượng ~5MB │ - Dung lượng hàng trăm MB      │
│ - Lưu vĩnh viễn   │ - Mất khi đóng tab│ - Lưu ma trận 3D, Cache offline│
└───────────────────┴───────────────────┴────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        TẦNG MÁY CHỦ (SERVER / CLOUD)                   │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ Redis In-Memory   │ PostgreSQL / MySQL│ S3 / Cloud Storage             │
│ - Tốc độ vi-giây  │ - Giao dịch ACID  │ - Lưu file CSV thô, ảnh,       │
│ - Lưu Cache, Lock │ - Quan hệ chuẩn hóa│   trọng số mô hình AI lớn      │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

## 5.2. Cấu trúc tổng thể hệ thống, Database Schema Design & Migration bằng Code
- **Quy tắc thiết kế Schema**:
  - Chuẩn hóa bậc 3 (3NF) để loại bỏ trùng lặp dữ liệu.
  - Phi chuẩn hóa (Denormalization) có kiểm soát ở các bảng báo cáo đọc nhiều (Read-heavy) để giảm thiểu câu lệnh `JOIN` phức tạp.
  - Đánh chỉ mục **Index B-Tree** cho các cột thường xuyên nằm trong điều kiện `WHERE`, `JOIN` và `ORDER BY`.
- **Database Migration**: Mọi thao tác thêm bảng, đổi kiểu dữ liệu bắt buộc phải được viết thành các file code migration (Prisma Migrate, Liquibase, TypeORM Migration) được kiểm soát phiên bản qua Git, tuyệt đối không chỉnh sửa cấu trúc bảng bằng tay trên Production.

## 5.3. Xử lý tranh chấp dữ liệu (Concurrency Control): Optimistic vs Pessimistic vs Distributed Lock
Khi có 100 người dùng cùng click chỉnh sửa một tập dữ liệu tại cùng một phần nghìn giây:
1. **Optimistic Locking (Khóa lạc quan)**:
   - Thêm cột `version INT DEFAULT 1` vào bảng.
   - Khi Update: `UPDATE datasets SET data = '...', version = version + 1 WHERE id = 'abc' AND version = 1;`
   - Nếu câu lệnh trả về 0 dòng cập nhật $\rightarrow$ Nghĩa là đã có người khác cập nhật trước đó $\rightarrow$ Báo lỗi xung đột để người dùng tải lại dữ liệu mới nhất. Thích hợp cho hệ thống có tỷ lệ tranh chấp thấp.
2. **Pessimistic Locking (Khóa bi quan)**:
   - Dùng cú pháp `SELECT * FROM datasets WHERE id = 'abc' FOR UPDATE;`.
   - Cơ sở dữ liệu sẽ khóa chặt dòng này, các giao dịch khác muốn đọc/ghi phải xếp hàng đứng đợi giao dịch đầu tiên hoàn tất (`COMMIT`). Thích hợp cho hệ thống ngân hàng, trừ tiền ví.
3. **Distributed Lock (Khóa phân tán với Redis Redlock)**:
   - Khi logic nghiệp vụ trải dài qua nhiều microservices, dùng Redis để tạo một khóa nguyên tử (`SET resource_key my_random_token NX PX 30000`). Chỉ service nào giữ khóa mới được phép xử lý dữ liệu.

## 5.4. Ba "thảm họa" kinh điển của bộ nhớ Cache và cách phòng thủ
1. **Cache Avalanche (Tuyết lở Cache)**:
   - *Hiện tượng*: Hàng loạt key trong Redis được cài đặt cùng thời gian hết hạn (TTL). Đúng thời điểm đó, hàng triệu request đổ về không thấy cache $\rightarrow$ Toàn bộ request dội thẳng vào Database $\rightarrow$ Database quá tải và sập.
   - *Phòng thủ*: Thêm thời gian ngẫu nhiên (Jitter) vào TTL (ví dụ: `TTL = 3600s + random(0, 300s)`).
2. **Cache Breakdown / Stampede (Cháy Cache)**:
   - *Hiện tượng*: Một key cực kỳ hot (Hot Key) vừa hết hạn, hàng vạn người dùng cùng lúc lao vào Database để tính toán và ghi lại key đó.
   - *Phòng thủ*: Dùng cơ chế khóa Mutex (Mutex Lock) trong Redis để chỉ cho phép duy nhất 1 request vào Database tính toán, các request khác tạm thời xếp hàng chờ cache sẵn sàng.
3. **Cache Penetration (Xuyên thủng Cache)**:
   - *Hiện tượng*: Hacker liên tục bắn request tìm kiếm các ID rác không hề tồn tại (ví dụ `id = -999999`). Redis không có $\rightarrow$ Hỏi Database cũng không có. Cứ thế hàng triệu request rác xuyên thủng lớp cache làm tê liệt Database.
   - *Phòng thủ*: Dùng cấu trúc dữ liệu xác suất **Bloom Filter** đặt trước Redis để nhận diện ngay các key không tồn tại, hoặc lưu giá trị `null` vào Redis với TTL ngắn (1-2 phút).

---

# PHẦN 6: TRẢI NGHIỆM NGƯỜI DÙNG & ĐỒ HỌA HIỆU NĂNG CAO (FRONTEND)

## 6.1. Kỹ thuật điều chỉnh độ phân giải, LOD (Level of Detail) trong 3D WebGL
- **Thách thức**: Khi dựng hàng chục nghìn điểm dữ liệu bằng Three.js, nếu máy của người dùng là máy văn phòng không có card đồ họa rời, trình duyệt sẽ bị giật lag (tụt dưới 20 FPS).
- **Giải pháp tối ưu đồ họa**:
  1. **InstancedMesh**: Thay vì tạo 10.000 Mesh riêng biệt làm quá tải lệnh vẽ (Draw Calls), sử dụng duy nhất 1 `THREE.InstancedMesh` để GPU vẽ toàn bộ 10.000 hạt dữ liệu trong đúng 1 Draw Call duy nhất.
  2. **LOD (Level of Detail)**: Các hạt ở gần camera được vẽ bằng hình cầu đa giác cao; các hạt ở xa camera tự động chuyển thành các hình cầu ít đa giác hoặc hạt điểm đơn giản (Points).
  3. **Dynamic Resolution Scaling (DRS)**: Tự động đo thời gian dựng khung hình. Nếu phát hiện FPS tụt xuống dưới 30, code Three.js tự động giảm tỷ lệ phân giải của Renderer (`renderer.setPixelRatio(1)`) để giữ vững trải nghiệm mượt mà.

## 6.2. Xử lý lag mạng, nghẽn băng thông và suy thoái nhẹ nhàng (Graceful Degradation)
- Khi phát hiện mạng bị chập chờn hoặc server phản hồi chậm:
  - **Client-Side Throttling & Debouncing**: Ngăn không cho người dùng bấm spam nút liên tục.
  - **Graceful Degradation**: Tự động tắt bớt các hiệu ứng hào quang laser radar không cần thiết, tập trung tài nguyên hiển thị kết quả tọa độ chính xác cho người dùng.

---

# PHẦN 7: TÍCH HỢP TRÍ TUỆ NHÂN TẠO & HỆ THỐNG DỮ LIỆU VECTOR

## 7.1. Bản chất mô hình AI: 1B, 2B, 7B parameters là gì? Công thức tính VRAM
- **Parameter (Tham số)**: Là các trọng số kết nối (Weights) mà mô hình học được. **1B = 1 Tỷ tham số (One Billion Parameters)**.
- **Công thức tính dung lượng VRAM**:
  $$\text{VRAM Yêu Cầu} \approx \text{Số tỷ tham số} \times \text{Số bytes cho mỗi tham số} \times 1.25 \text{ (Dự phòng KV Cache & Overhead)}$$
  - Ở độ chính xác số thực chuẩn **FP16 (16-bit Float)**: Mỗi tham số tốn $2 \text{ bytes}$.
    - Mô hình 1B cần: $1 \times 2 \times 1.25 \approx 2.5 \text{ GB}$ VRAM.
    - Mô hình 7B cần: $7 \times 2 \times 1.25 \approx 17.5 \text{ GB}$ VRAM (Cần GPU tối thiểu 24GB như RTX 4090 hoặc A10G).

## 7.2. Kỹ thuật Lượng tử hóa (Quantization) và Tốc độ suy luận (Tokens/s, TTFT)
- **Quantization (Nén lượng tử)**: Ép kiểu dữ liệu trọng số từ 16-bit xuống 8-bit (INT8) hoặc 4-bit (INT4 / Q4_K_M).
  - Mô hình 2B khi nén xuống 4-bit chỉ tốn khoảng **1.4 GB VRAM**, có thể chạy trực tiếp trên trình duyệt máy khách thông qua **WebGPU** hoặc **ONNX Runtime Web**.
- **Chỉ số đo lường tốc độ AI**:
  - **TTFT (Time To First Token)**: Thời gian từ lúc người dùng gửi câu hỏi đến khi chữ cái đầu tiên xuất hiện.
  - **Tokens / Second**: Tốc độ sinh chữ của mô hình. Tối ưu bằng các Inference Engine chuyên dụng như **vLLM** (áp dụng kỹ thuật PagedAttention quản lý bộ nhớ RAM của GPU y hệt bộ nhớ ảo của hệ điều hành).

## 7.3. Kiến trúc RAG (Retrieval-Augmented Generation) & Vector Database
- Để AI có thể giải thích dữ liệu phân cụm của bạn một cách chính xác mà không bịa đặt (Hallucination):
  1. Dùng mô hình Embedding chuyển đổi các dòng dữ liệu thành các vector số học 1536 chiều.
  2. Lưu các vector này vào **Vector Database (Qdrant, Milvus, pgvector)**.
  3. Khi người dùng hỏi: *"Hãy giải thích các điểm Outlier ở góc phải"*, hệ thống tìm kiếm các vector lân cận bằng thuật toán **Cosine Similarity (HNSW Index)** $\rightarrow$ Lấy nội dung liên quan nhét vào Prompt đưa cho LLM trả lời.
  4. Sử dụng **Server-Sent Events (SSE)** để stream từng từ câu trả lời về giao diện giống ChatGPT.

## 7.4. Tối ưu hệ thống: AI Performance vs System Performance
- **System Performance**: Nghẽn ở **I/O & Network** (Đọc đĩa, truy vấn Database, truyền mạng).
- **AI Performance**: Nghẽn ở **Compute & Memory Bandwidth** (Nhân ma trận số thực trên lõi Tensor Core của GPU).
- **Nguyên lý cốt tử**: **System Performance là nền móng**. Một mô hình AI dù có thông minh đến đâu nhưng nếu nằm trên một hệ thống Backend chậm chạp, hay sập và bảo mật kém thì toàn bộ sản phẩm vẫn là con số 0.

---

# PHẦN 8: VẬN HÀNH PRODUCTION, ĐỘ TIN CẬY & CHI PHÍ (DEVOPS & FINOPS)

## 8.1. Cơ chế tự phục hồi: Circuit Breaker Pattern & Exponential Backoff
- **Circuit Breaker (Cầu dao tự động)**:
  - Khi thấy một dịch vụ bên ngoài (như OpenAI API hoặc Cổng thanh toán) bị lỗi 5 lần liên tiếp $\rightarrow$ Cầu dao tự động nhảy sang trạng thái **OPEN (Mở)**. Mọi request tiếp theo sẽ bị từ chối ngay lập tức để không làm nghẽn hàng đợi kết nối của server.
  - Sau một khoảng thời gian chờ (ví dụ 30s), cầu dao chuyển sang **HALF-OPEN (Nửa mở)** để gửi thử 1 request thăm dò. Nếu thành công, cầu dao đóng lại (**CLOSED**), hệ thống phục hồi bình thường.
- **Exponential Backoff with Jitter**:
  - Khi gọi lại một API bị lỗi, thời gian chờ giữa các lần thử lại tăng theo cấp số nhân ($1s, 2s, 4s, 8s$) cộng thêm một khoảng ngẫu nhiên để tránh việc hàng nghìn máy khách cùng dội request thử lại tại cùng một thời điểm.

## 8.2. Khả năng quan sát toàn diện (Observability: Logs, Metrics, Tracing)
Hệ thống lớn bắt buộc phải có "3 chân kiềng giám sát":
1. **Logs tập trung**: Thu thập toàn bộ log từ tất cả các máy chủ về một nơi duy nhất bằng Elasticsearch / Fluentd / Kibana (ELK) hoặc Grafana Loki.
2. **Metrics thời gian thực**: Đo lường CPU, RAM, số lượng request/giây bằng **Prometheus** và vẽ biểu đồ cảnh báo trực quan trên **Grafana**.
3. **Distributed Tracing (Truy vết phân tán)**: Dùng **OpenTelemetry / Jaeger** gán một mã định danh duy nhất (`TraceId`) cho mỗi request. Cho phép bạn nhìn thấy chính xác một request mất bao nhiêu mili-giây tại từng microservice.

## 8.3. Chiến lược phát hành không gián đoạn (Zero-Downtime Deployment)
1. **Blue-Green Deployment**: Duy trì 2 môi trường y hệt nhau. Môi trường Blue đang chạy bản cũ. Deploy bản mới lên Green, kiểm tra toàn diện $\rightarrow$ Đổi cấu hình Load Balancer sang Green trong 1 phần nghìn giây.
2. **Canary Deployment**: Chỉ đẩy phiên bản mới cho 5% người dùng thử nghiệm. Nếu không phát sinh lỗi bất thường thì tăng dần lên 25%, 50%, 100%. Nếu có lỗi thì lập tức quay đầu mà 95% người dùng không hề bị ảnh hưởng.
3. **Expand and Contract Pattern (cho Database Migration)**: Khi cần đổi tên cột trong bảng database:
   - Bước 1: Thêm cột mới song song (Expand).
   - Bước 2: Code đọc và ghi vào cả 2 cột.
   - Bước 3: Đồng bộ dữ liệu cũ sang cột mới.
   - Bước 4: Chuyển code chỉ dùng cột mới.
   - Bước 5: Xóa cột cũ đi (Contract). Đảm bảo không bao giờ làm chết phiên bản code cũ đang chạy.

## 8.4. Quản trị và tối ưu chi phí hạ tầng đám mây / GPU (FinOps)
- Sử dụng **Serverless GPU** (như Modal, RunPod, AWS Bedrock): Chỉ trả tiền theo số giây mà mô hình AI thực sự chạy tính toán, máy chủ tự động tắt khi không có người dùng để tiết kiệm hàng nghìn USD chi phí duy trì GPU nhàn rỗi.
- Tối ưu hóa **Network Egress Cost**: Bật nén Brotli/Gzip cho toàn bộ API JSON và cache toàn bộ tài nguyên tĩnh trên Cloudflare Edge để giảm tối đa chi phí truyền tải dữ liệu từ máy chủ đám mây ra ngoài Internet.
