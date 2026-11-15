# Frontend

React, TypeScript và Three.js. Chạy từ root bằng `npm run dev:all`. Vite đọc cấu hình ở root và dùng thư mục này làm web root.

## Cấu trúc

- [main.tsx](src/main.tsx) khởi tạo React, theme và ngôn ngữ.
- [Entry.tsx](src/app/Entry.tsx) ghép màn hình, điều hướng hash và giữ phiên.
- [App.tsx](src/app/App.tsx) ghép Model và điều phối trạng thái dataset, draft và kết quả đã công bố.
- [Shared](src/shared/README.md) chứa provider, giao diện chung, API client và CSS toàn ứng dụng.

## Các tính năng

- [Welcome và triển lãm](src/features/welcome/README.md)
- [Portal và Overview](src/features/portal/README.md)
- [Đăng nhập và phiên trình duyệt](src/features/auth/README.md)
- [Datasets](src/features/datasets/README.md)
- [Explore và pipeline phân tích](src/features/analysis/README.md)
- [Trực quan hóa 3D](src/features/visualization/README.md)
- [Thí nghiệm và xuất kết quả](src/features/experiments/README.md)

## Kiểm tra

Chạy `npm test` và `npm run build` từ root. Với thay đổi giao diện, kiểm tra URL hash, theme, ngôn ngữ và WebGL/Canvas ở trình duyệt. Giữ các điểm tải động của App, Globe, plot và Worker.

[Sơ đồ hệ thống](../docs/architecture/system-overview.md)
