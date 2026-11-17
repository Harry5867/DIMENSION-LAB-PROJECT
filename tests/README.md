# Kiểm thử

Chạy từ root sau `npm ci`.

| Lệnh | Phạm vi |
|---|---|
| `npm run lint` | ESLint cho JavaScript và TypeScript trong workspace, kèm quy tắc React Hooks ở frontend. |
| `npm test` | [Unit và hồi quy](unit/) của CSV, thuật toán, 3D, UI logic, xác thực và lưu trữ mô phỏng. |
| `npm run test:api` | [Tích hợp HTTP](integration/), tự chạy Express demo và mô phỏng Atlas không khả dụng qua loopback. |
| `npm run test:e2e` | [Playwright trên Chromium](e2e/), từ Welcome và xác thực demo đến quản lý dataset, chạy phân tích và lưu, xuất, khôi phục kết quả. |
| `npm run build` | Kiểm tra TypeScript và đóng gói Vite, lazy chunks, Worker, CSS và tài nguyên. |

Ở mốc hiện tại, lint báo cảnh báo cho dependency của React Hooks và kiểu `any` trong mock lưu trữ `storage-regression.test.ts`. Xem từng cảnh báo Hook cùng luồng dựng và dọn hiệu ứng trước khi sửa dependency. Quy tắc kiểm tra cách gọi Hook luôn báo lỗi khi vi phạm.

Fixture dùng chung nằm ở [fixtures/](fixtures/). Kiểm thử tích hợp dùng dữ liệu thử và cổng riêng. Playwright dùng API demo cục bộ. Hãy dùng môi trường staging để nghiệm thu đăng nhập Google, đăng ký tài khoản và lưu dữ liệu trên MongoDB Atlas.

## Chạy Playwright trên máy cá nhân

Sau `npm ci`, cài Chromium headless bằng `npx playwright install chromium --only-shell`, rồi chạy `npm run test:e2e`. Để xem trình duyệt khi chạy, cài Chromium đầy đủ bằng `npx playwright install chromium` và chạy `npm run test:e2e -- --headed`. Dùng `npm run test:e2e -- --ui` để mở giao diện Playwright.

Cấu hình tự khởi động frontend trên cổng 3000 và API demo trên cổng 5000. Hãy dừng phiên dev đang dùng các cổng đó trước khi chạy. Khi một ca thất bại, Playwright lưu trace trong `test-results/` để có thể mở lại bằng `npx playwright show-trace <đường-dẫn-trace.zip>`.

- Welcome có các ca kiểm tra intro, đổi giao diện sáng/tối, tìm thủ đô trong Atlas, thay đổi địa hình và lọc Stories.
- Workspace có các ca kiểm tra đăng nhập và đăng xuất, Theory, User Guide, bộ dữ liệu mẫu và hồ sơ About Us.
- Model có các ca kiểm tra nhập, xem trước, tải xuống, đổi tên và xóa CSV. Phần phân tích chạy PCA, UMAP, t-SNE, K-Means, DBSCAN, GMM, Isolation Forest và Apriori, rồi kiểm tra điều khiển 3D, xuất CSV và khôi phục cấu hình đã lưu.

[Báo cáo kiểm thử lịch sử](../docs/system-verification.md) · [Luồng dữ liệu](../docs/architecture/data-flow.md)

## Ghi chú bảo trì cho người và AI

Chạy `node --import tsx --test tests/unit/exploration.test.ts` để kiểm tra riêng nhóm Explore. Khi thêm hồi quy, dùng đầu vào nhỏ và kiểm tra giá trị cùng thứ tự hàng. Ca API mới nên dùng máy chủ thử hiện có.
