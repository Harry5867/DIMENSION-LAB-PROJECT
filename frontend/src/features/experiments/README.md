# Thí nghiệm và xuất kết quả

Lưu lần chạy, khôi phục cấu hình và xuất dữ liệu.

## Điểm vào và trách nhiệm

- [ExperimentsPage](components/ExperimentsPage.tsx) — Hiển thị và áp dụng cấu hình đã lưu.

- [History](history.ts) — Kiểm tra cấu hình có thể khôi phục.

- [ExportModal](components/ExportModal.tsx) — Hiển thị tùy chọn xuất của lần chạy hiện tại.

- [Export](exportData.ts) — Tạo CSV, JSON và tải tệp.

## Luồng dữ liệu và trạng thái

Workspace gọi API lưu và tải history. Khôi phục nạp cấu hình để chạy lại. Export sử dụng snapshot đã công bố và dữ liệu đang xem. Ảnh lấy từ canvas.

## Kiểm thử và phạm vi thay đổi

Chạy npm test và npm run test:api. Kiểm tra nhãn lần chạy, hàng xuất ra, định dạng và cấu hình sau khi đổi tùy chọn nhưng chưa chạy lại.

## Ràng buộc khi bảo trì

Giữ tương thích với dữ liệu thí nghiệm cũ và cách xuất theo phạm vi chọn. Đối chiếu hàng CSV bằng rowIndex.

## Tài liệu liên quan

[Analysis](../analysis/README.md) · [Backend](../../../../backend/README.md)

## Ghi chú bảo trì cho người và AI

Khi sửa export, xem ExportModal, history, exportData và handler trong App. Đối chiếu dữ liệu báo cáo với nhãn Viewing và bộ lọc. Khôi phục thí nghiệm nạp lại cấu hình để người dùng chạy phân tích.
