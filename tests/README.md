# Kiểm thử

Chạy từ root sau `npm ci`.

| Lệnh | Phạm vi |
|---|---|
| `npm run lint` | ESLint cho JavaScript và TypeScript trong workspace, kèm quy tắc React Hooks ở frontend. |
| `npm test` | [Unit và hồi quy](unit/) của CSV, thuật toán, 3D, UI logic, xác thực và lưu trữ mô phỏng. |
| `npm run test:api` | [Tích hợp HTTP](integration/), tự chạy Express demo và mô phỏng Atlas không khả dụng qua loopback. |
| `npm run build` | Kiểm tra TypeScript và đóng gói Vite, lazy chunks, Worker, CSS và tài nguyên. |

Ở mốc hiện tại, lint báo cảnh báo cho dependency của React Hooks và kiểu `any` trong mock lưu trữ `storage-regression.test.ts`. Xem từng cảnh báo Hook cùng luồng dựng và dọn hiệu ứng trước khi sửa dependency. Quy tắc kiểm tra cách gọi Hook luôn báo lỗi khi vi phạm.

Fixture dùng chung nằm ở [fixtures/](fixtures/). Kiểm thử tích hợp dùng dữ liệu thử và cổng riêng. Thực hiện kiểm tra trực tiếp trên trình duyệt cho Atlas/Terrain/Stories, Model, camera/selection, lịch sử và xuất. Dùng môi trường Atlas dev đã xác nhận cho nghiệm thu Google thật và dữ liệu bền vững.

[Báo cáo kiểm thử lịch sử](../docs/system-verification.md) · [Luồng dữ liệu](../docs/architecture/data-flow.md)

## Ghi chú bảo trì cho người và AI

Chạy `node --import tsx --test tests/unit/exploration.test.ts` để kiểm tra riêng nhóm Explore. Khi thêm hồi quy, dùng đầu vào nhỏ và kiểm tra giá trị cùng thứ tự hàng. Ca API mới nên dùng máy chủ thử hiện có. Hiện dự án chưa có bộ E2E trình duyệt tự động.
