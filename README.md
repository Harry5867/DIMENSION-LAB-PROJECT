# DIMENSION / LAB

Interactive High-Dimensional Data Explorer. Dự án gồm triển lãm dữ liệu trên quả cầu và workspace phân tích dataset, giảm chiều, phân cụm và trực quan hóa 3D.

**Kiến trúc** — Client–Server trong một npm workspace. React/Vite/Three.js chạy giao diện. Node/Express xử lý HTTP. Frontend và backend dùng chung thuật toán và kiểu dữ liệu TypeScript.

## Chạy cục bộ

Dùng Node.js 24+ và npm tương thích. ESLint 10 cũng hỗ trợ Node.js 20 từ 20.19 và Node.js 22 từ 22.13. Chạy từ thư mục gốc:

```sh
npm ci
npm run dev:all
```

Mở [localhost:3000](http://localhost:3000/). Backend dùng loopback cổng 5000 mặc định. Demo giữ dữ liệu phát sinh trong RAM. Atlas dùng MongoDB và Google OAuth. Xem [thiết lập Atlas](docs/google-atlas.md) để cấu hình chế độ lưu trữ, URI, tên database, OAuth client và callback trong `.env` cục bộ. `.env.example` liệt kê các biến mẫu.

## Điều hướng mã nguồn

- [Frontend và các feature](frontend/README.md)
- [Backend và API](backend/README.md)
- [Algorithms và Contracts](packages/README.md)
- [Dữ liệu mẫu và nguồn](data/README.md), [Scripts](scripts/README.md)
- [Kiểm thử](tests/README.md), [Nginx](nginx/README.md)
- [Tài liệu và sơ đồ kiến trúc](docs/README.md)

## Kiểm tra trước khi review

```sh
npm run lint
npm test
npm run test:api
npm run build
```

`npm run dev`, `npm run server`, `npm run dev:host` và `npm run preview` cũng chạy từ root. Kết quả build ở `dist/`. Khi gửi thay đổi, ghi feature, hợp đồng dữ liệu bị ảnh hưởng và ca kiểm thử đã chạy. Cập nhật README của feature nếu đổi điểm vào, luồng dữ liệu hoặc cách kiểm thử.

## Tác giả

- **Người phát triển**: Harry5867 / Anh Khoa
