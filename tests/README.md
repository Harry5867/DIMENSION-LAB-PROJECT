# Kiểm thử

Chạy từ root sau `npm ci`.

| Lệnh | Phạm vi |
|---|---|
| `npm run lint` | ESLint cho JavaScript và TypeScript trong workspace, kèm quy tắc React Hooks ở frontend. |
| `npm test` | [Unit và hồi quy](unit/) của CSV, thuật toán, 3D, UI logic, xác thực, lưu trữ và retry/idempotency/owner isolation của job queue. |
| `npm run test:api` | [Tích hợp HTTP](integration/), tự chạy Express demo và mô phỏng Atlas không khả dụng qua loopback; kiểm tra security headers, probes, metrics auth và API job contracts. |
| `npm run test:e2e` | Playwright Chromium đăng nhập qua UI, tải CSV, chạy API v2, tối ưu/lọc điểm, lưu và khôi phục thí nghiệm. Tự khởi động frontend/API nếu chưa chạy. |
| `npm run build` | Kiểm tra TypeScript và đóng gói Vite, lazy chunks, Worker, CSS và tài nguyên. |

Fixture dùng chung nằm ở [fixtures/](fixtures/). Kiểm thử tích hợp dùng dữ liệu thử và cổng riêng. E2E dùng chế độ demo trên loopback; để chạy lần đầu, cài Chromium bằng `npx playwright install chromium`. Dùng môi trường Atlas dev đã xác nhận cho nghiệm thu Google thật và dữ liệu bền vững.

[Báo cáo kiểm thử lịch sử](../docs/system-verification.md) · [Luồng dữ liệu](../docs/architecture/data-flow.md)

GitHub Actions chạy lint, unit, API integration, build và Playwright Chromium trên mỗi push/pull request. Queue thật nhiều worker/Atlas cần kiểm tra bổ sung trên Atlas staging; CI dùng demo mode và không chứa secrets.

## Ghi chú bảo trì cho người và AI

Chạy `node --import tsx --test tests/unit/exploration.test.ts` để kiểm tra riêng nhóm Explore. Khi thêm hồi quy, dùng đầu vào nhỏ và kiểm tra giá trị cùng thứ tự hàng. Ca API mới nên dùng máy chủ thử hiện có; hành trình người dùng chính chạy bằng `npm run test:e2e`.
