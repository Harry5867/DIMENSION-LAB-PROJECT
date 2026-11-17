# Contracts

Các kiểu dữ liệu dùng chung của [dataset](src/dataset.ts), [analysis](src/analysis.ts), [experiment](src/experiment.ts), [API](src/api.ts) và [demo](src/demo.ts). `@dimension-lab/contracts` là điểm import chính. `@dimension-lab/contracts/demo` cung cấp thông tin tài khoản demo được đóng gói sẵn cho ứng dụng.

Ưu tiên import kiểu khi có thể. Kiểm tra ảnh hưởng lên payload, dữ liệu cũ, validation và CSV export trước khi sửa field. Chạy `npm run build` và `npm run test:api` từ root.

[Packages](../README.md)

## Ghi chú bảo trì cho người và AI

Đọc server routes và runtime guards ở frontend trước khi sửa kiểu dùng chung. Giữ khả năng đọc thí nghiệm cũ. Kiểm tra biểu đồ, CSV và cache nếu đổi định danh hàng hoặc cấu hình.
