# Tổng quan

DIMENSION / LAB dùng kiến trúc Client–Server trong một npm workspace. [Frontend](../../frontend/README.md) chạy trong trình duyệt. [Express](../../backend/README.md) nhận HTTP và vận hành ở chế độ demo hoặc Atlas. [Packages](../../packages/README.md) dùng chung thuật toán và hợp đồng TypeScript. [Nginx](../../nginx/README.md) cung cấp cấu hình triển khai tham chiếu.

Mặc định Vite phục vụ trang ở cổng 3000 và proxy API tới 5000. Production build vẫn nằm ở dist tại root. Xem [luồng dữ liệu](data-flow.md) và [hướng phụ thuộc](dependency-map.md).
