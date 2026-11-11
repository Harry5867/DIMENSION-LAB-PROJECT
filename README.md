# 🧬 3D Interactive High-Dimensional Data Explorer
### Hệ Thống Thám Hiểm & Trực Quan Hóa Dữ Liệu Đa Chiều Không Gian 3D Thời Gian Thực

[![React](https://img.shields.io/badge/React-19.0-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.169-black.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-green.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-NoSQL-forestgreen.svg)](https://www.mongodb.com)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-cyan.svg)](https://tailwindcss.com/)

---

## 📖 Giới thiệu Dự Án

**3D Interactive High-Dimensional Data Explorer** là hệ thống phân tích và trực quan hóa dữ liệu y tế đa chiều (dữ liệu chẩn đoán ung thư vú Wisconsin Breast Cancer Diagnostic Dataset - 30 đặc trưng sinh học) trong không gian WebGL 3 chiều thời gian thực.

Source phân tích hiện dùng React/TypeScript, Vite, Express và MongoDB. Dimension Lab dùng một form đăng nhập/đăng ký local ở trang gốc `/`. **Import CSV** trong Datasets hoặc Explore mở cùng kho nhập liệu với **Dữ liệu & MongoDB**. Kho lưu CSV vào IndexedDB rồi đồng bộ theo tài khoản khi phiên được MongoDB xác nhận. Sau khi đồng bộ, mở **Datasets** hoặc **Explore** để phân tích phiên bản đã lưu và lưu experiment riêng. Xem [luồng MongoDB native và offline](docs/MONGODB_NATIVE_DATA_FLOW.md), [System Flow](docs/SYSTEM_FLOW.md) và [API Design](docs/API_DESIGN.md).

---

## ✨ Tính Năng Nổi Bật

### 0. 🧭 Xem Dữ Liệu & Phân Tích Tách Biệt
- Xem trước 10 dòng dữ liệu gốc ngay sau khi chọn hoặc tải bộ dữ liệu; thao tác này không tự chạy phân tích.
- Chạy PCA, t-SNE hoặc UMAP riêng để biến đổi dữ liệu sang tọa độ 3D; sau đó có thể áp dụng thuật toán phân cụm riêng trên tọa độ đó.

### 1. 🌐 Không Gian Trực Quan Hóa 3D (Three.js WebGL)
- **Tương tác 3D mượt mà**: Xoay (Orbit), Thu phóng (Zoom), Di chuyển (Pan) và Tự động xoay quanh tâm (Auto-rotation).
- **Kích thước điểm** có thể chỉnh bằng thanh trượt **Point size** trong khung 3D.
- **Tô màu đa chế độ**: Tô màu theo Nhãn bệnh án gốc (Ác tính / Lành tính), theo Cụm phân thuật toán (Clusters), hoặc theo Bản đồ nhiệt của từng đặc trưng (Continuous Heatmap).
- **Chụp ảnh 3D phân giải cao**: Xuất ảnh 3D PNG sắc nét cho báo cáo nghiên cứu và thuyết trình.

### 2. 📉 Thuật Toán Giảm Chiều Không Gian (Dimensionality Reduction)
- **PCA (Principal Component Analysis)**:
  - **Biểu đồ Scree Plot**: Thống kê tỷ lệ giải thích phương sai từng trục PC1 (Trục X), PC2 (Trục Y), PC3 (Trục Z) và tổng phương sai bảo toàn tích lũy (`72.6%`).
  - **Bảng Feature Loadings**: Xếp hạng Top 5 đặc trưng sinh học chi phối mạnh nhất từng trục.
  - **Véc-tơ Biplot tương tác 3D**: Hiển thị các mũi tên véc-tơ đặc trưng với thanh trượt chọn Top N véc-tơ và thanh chỉnh độ dài véc-tơ (Vector Scale).
- **t-SNE (t-Distributed Stochastic Neighbor Embedding)**:
  - Tinh chỉnh Độ phức tạp (*Perplexity: 3–50*) và Số vòng lặp (*Iterations: 100–1000*).
  - **Hoạt họa tụ cụm Live 3D (Live Optimization)**: Quan sát quá trình các điểm dữ liệu tự động hút và co cụm theo từng bước lặp.
- **UMAP (Uniform Manifold Approximation & Projection)**:
  - Điều khiển Số láng giềng (*nNeighbors*) và Khoảng cách tối thiểu (*minDist*).
- **Chuẩn hóa dữ liệu (Preprocessing)**: Hỗ trợ chuẩn hóa **Z-Score Standardize**, **Min-Max Scaling**, hoặc giữ nguyên dữ liệu **Gốc**.

### 3. 🔍 Thuật Toán Phân Cụm Dữ Liệu (Clustering)
- **K-Means Clustering**: Khởi tạo bằng **K-Means++**, hiển thị vòng tròn tâm cụm phát sáng trong không gian 3D.
- **Dò tìm K tối ưu (Elbow Method & Silhouette Analysis)**: Tích hợp cửa sổ đồ thị trực quan tự động tính điểm gãy khuỷu tay (Inertia WCSS) và chỉ số Silhouette từ K=2 đến K=10.
- **DBSCAN (Density-Based Spatial Clustering)**: Tự động phát hiện hình dạng cụm bất kỳ và tách riêng các điểm nhiễu ngoại lai (Noise points).

### 4. ⚡ Backend API và MongoDB
- **SHA-256 compute cache**: cache RAM/MongoDB được triển khai; chưa có benchmark trong repository để công bố độ trễ.
- **Gzip compression** được bật trên API; chưa có số đo tỷ lệ giảm payload để công bố.
- **Trung tâm Giám sát Hệ thống**: Theo dõi thời gian thực RAM Usage, Uptime, độ trễ MongoDB, trạng thái kết nối mạng LAN.
- **Xuất dữ liệu CSV**: Tải về file kết quả gồm tọa độ 3D và nhãn cụm vừa phân tích.

### 5. 🗃️ Local Data Workbench
- Workbench mở ngay trong Dimension Lab. CSV được ghi vào IndexedDB trước rồi đồng bộ theo batch khi local API/MongoDB hoạt động. Đường dẫn `/database.html` chuyển về Dimension Lab khi ứng dụng truy cập được và phục vụ bản offline nếu máy chủ web đã dừng.
- Dataset user được tách theo `ownerId`; mỗi bản ghi có `recordId` và `rowIndex` ổn định.
- Khi bản offline dựa trên revision cũ, API lưu bản server trước khi công bố bản offline. Revision đi trước server trả `409` và bản chờ được giữ trong IndexedDB.
- Đăng ký tạo tài khoản local ngay sau khi kiểm tra họ tên đầy đủ và mật khẩu mạnh. Email chỉ là tên đăng nhập, chưa được xác minh.

### 5. 🧭 Trải Nghiệm Sử Dụng & An Toàn Kiểu Dữ Liệu
- Giao diện dữ liệu hướng dẫn chọn bộ dữ liệu, đặc trưng số và yêu cầu tối thiểu 3 đặc trưng trước khi tính toán 3D.
- Thông báo thành công/lỗi và trạng thái xử lý được hiển thị trực tiếp, có thể đọc bởi công nghệ hỗ trợ.
- Tệp CSV được chuẩn hóa về kiểu dữ liệu rõ ràng; phản hồi API được kiểm tra cấu trúc trước khi dùng.
- Kiểu dữ liệu miền dùng chung cho dataset, dòng CSV, kết quả tính toán, thí nghiệm và trạng thái hệ thống; xử lý lỗi dùng `unknown` thay vì `any`.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Frontend** | React 19, TypeScript 6, Vite 5 |
| **Trực quan hóa** | Three.js (WebGL), OrbitControls, Canvas 2D, SVG |
| **Giao diện** | Tailwind CSS 4, CSS riêng, Lucide React |
| **Backend** | Node.js, Express 4, REST API, Multer, tsx |
| **Lưu trữ** | MongoDB. Nếu kết nối thất bại, máy chủ lưu tạm trong RAM và dữ liệu lưu tạm sẽ mất khi khởi động lại. |
| **Xử lý dữ liệu** | Papa Parse đọc CSV. Giảm chiều và phân cụm gọi API. Anomaly Detection và Association Rules chạy bằng Web Workers trong trình duyệt. |

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu cầu hệ thống
- Đã cài đặt **Node.js** (phiên bản 20.19.0 trở lên).
- Trình duyệt hiện đại hỗ trợ WebGL (Chrome, Edge, Brave, Firefox, Safari).

### 2. Cài đặt các thư viện phụ thuộc
Mở terminal trong thư mục dự án và chạy:
```bash
npm ci
```

### 3. Cấu hình biến môi trường
Tạo file `.env` từ file mẫu `.env.example`:
```bash
Copy-Item .env.example .env
```
Mẫu này kết nối MongoDB Community Server native trên máy tại `127.0.0.1:27017`, database `cancer_explorer`. File `.env` được Git ignore. Đăng ký tài khoản local không cần SMTP hoặc mã email; email chỉ được dùng làm tên đăng nhập và không chứng minh quyền sở hữu hộp thư.

### 4. Khởi động MongoDB và ứng dụng
Cài MongoDB Community Server cho Windows theo [hướng dẫn chính thức](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/), bật tùy chọn chạy dưới dạng Windows Service và chọn kiểu khởi động **Automatic**. Sau đó trong PowerShell tại thư mục dự án:
```powershell
Get-Service MongoDB
npm run dev:all
```

`dev:all` khởi động API phân tích cũ, local-data API JavaScript ở `127.0.0.1:5100`, và Vite ở `127.0.0.1:3000`. MongoDB chạy trực tiếp bằng Windows Service, không qua Docker. Nếu service chưa có, lệnh `Get-Service MongoDB` sẽ không tìm thấy; cài server trước khi kỳ vọng lưu bền vào Mongo.

Sau khi terminal thông báo thành công, mở trình duyệt và truy cập:
👉 **[http://localhost:3000](http://localhost:3000)**

Mở **[http://127.0.0.1:3000/](http://127.0.0.1:3000/)**. Đăng nhập hoặc tạo tài khoản local, rồi chọn **Datasets → Import CSV**. Bạn cũng có thể mở **Dữ liệu & MongoDB** để nhập CSV ngay ở chế độ offline. Chọn **Liên kết tài khoản** để đồng bộ các tệp đã nhập ở chế độ này. Nếu MongoDB/API dừng, CSV tiếp tục được lưu trong IndexedDB và chờ đồng bộ khi dịch vụ sẵn sàng.

---

## 📱 Phạm vi truy cập local

Local-data API và MongoDB chỉ bind loopback; không truy cập từ LAN/Internet. Không dùng chế độ host `0.0.0.0` cho tính năng tài khoản/dữ liệu này. Việc dùng nhiều thiết bị cần thiết kế HTTPS/auth/networking riêng trước khi mở cổng.

---

## 📂 Cấu Trúc Thư Mục Dự Án

```
DIMENSION-LAB-PROJECT/
├── public/                 # File dữ liệu tĩnh (data.csv, wholesale.csv)
│   ├── database.html       # Local-first database workbench
│   ├── database.js         # UI, IndexedDB, CSV streaming và sync queue
│   ├── database-sw.js      # Cache shell offline; không cache API data
│   └── csv-parser.js       # Bộ đọc CSV streaming, được test riêng
├── compose.yaml            # Cấu hình dev Docker cũ; workflow native không dùng
├── server/                 # Mã nguồn Backend Express & MongoDB
│   ├── db.ts               # MongoDB, RAM fallback, seed và compute cache
│   └── index.ts            # API Server, Gzip Compression, Endpoint tính toán
│   ├── local-data-server.js # API user/dataset native Mongo, chỉ bind loopback
│   └── auth-policy.js      # Quy tắc họ tên và mật khẩu mạnh
├── src/                    # Mã nguồn Frontend React & Three.js
│   ├── algorithms/         # Thuật toán PCA, t-SNE, UMAP, K-Means, DBSCAN
│   ├── components/         # Giao diện, khung 3D và hộp thoại
│   ├── types/              # Định nghĩa kiểu dữ liệu TypeScript
│   ├── utils/              # Tiện ích đọc CSV, tiền xử lý Z-Score / Min-Max
│   ├── App.tsx             # Luồng điều khiển trung tâm của ứng dụng
│   └── main.tsx            # Điểm khởi tạo ứng dụng React
├── .env.example            # Mẫu biến môi trường bảo mật
├── .gitignore              # Bộ lọc bảo mật Git
├── package.json            # Danh sách gói phụ thuộc và scripts
└── README.md               # Tài liệu hướng dẫn dự án
```

---

## 👨‍💻 Tác giả
- **Người phát triển**: Harry5867 / Anh Khoa
- **Nhánh upstream**: `main`
- **Kho lưu trữ (Repository)**: [Interactive-High-Dimensional-Data-Explorer](https://github.com/Harry5867/Interactive-High-Dimensional-Data-Explorer)
