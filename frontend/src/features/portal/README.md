# Portal và Overview

Điều hướng sau đăng nhập và nội dung giới thiệu.

## Điểm vào và trách nhiệm

- [Portal](Portal.tsx) — Chọn Overview hoặc nội dung theo route.

- [Overview](WorkspaceOverview.tsx) — Điểm vào Model, Dataset Library, Theory và User Guide.

- [Theory](pages/Theory.tsx) — Trình bày các thuật toán.

- [Dataset Library](pages/DatasetStories.tsx) — Đọc case studies đóng gói.

- [Hạt Overview](animations/dataMorphRuntime.ts) — Giữ vòng đời đồ họa của mô hình hạt.

## Luồng dữ liệu và trạng thái

Entry giải mã URL hash. Portal kết hợp route, hiệu ứng chuyển cảnh và nội dung. Dataset Library dùng case studies dựng từ dữ liệu mẫu.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, xem portal.test.ts và dataMorph.test.ts. Kiểm tra đường dẫn trực tiếp và quay lại từ Model.

## Ràng buộc khi bảo trì

Giữ semantics của liên kết, bàn phím, cử chỉ và phase chuyển cảnh. Overview sử dụng dữ liệu minh họa có seed.

## Tài liệu liên quan

[Frontend](../../../README.md) · [Scripts](../../../../scripts/README.md)

## Ghi chú bảo trì cho người và AI

Để đổi đích của mục điều hướng, đọc shared/navigation/portalNavigation.ts, Portal.tsx và Entry.tsx. Kiểm tra bàn phím, URL trực tiếp và đường quay về. Các hình hạt Overview mang tính minh họa.
