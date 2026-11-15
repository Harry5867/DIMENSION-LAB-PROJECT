# Welcome và triển lãm

Màn chào, intro và ba chế độ Atlas, Terrain và Stories.

## Điểm vào và trách nhiệm

- [Welcome](Welcome.tsx) — Tiếp nhận thao tác, mở LoginPanel và tải quả cầu theo nhu cầu.

- [Globe](globe/README.md) — Camera, renderer, chuyển chế độ và tương tác địa lý.

- [Animations](animations/welcomeGenesis.ts) — Timeline Genesis và giảm chuyển động.

- [Settings](WelcomeSettings.tsx) — Các tùy chọn hiển thị và ngôn ngữ.

## Luồng dữ liệu và trạng thái

Welcome giữ chế độ triển lãm và trạng thái intro. Các provider dùng chung giữ theme và ngôn ngữ. Khi đổi chế độ, DataGlobe tiếp tục giữ camera và renderer.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, xem portal.test.ts, terrain.test.ts và stories.test.ts. Trên trình duyệt mở Atlas, Terrain và Stories, sau đó mở hộp đăng nhập.

## Ràng buộc khi bảo trì

Giữ timeline, hình học, điều hướng bàn phím và đường dự phòng Canvas khi di chuyển component. Kiểm tra CSS theo mode cùng các asset.

## Tài liệu liên quan

[Globe](globe/README.md) · [Auth](../auth/README.md)

## Ghi chú bảo trì cho người và AI

Đổi nội dung mở đầu từ Welcome.tsx. Đọc CSS trong styles và timeline Genesis nếu sửa intro. Chạy portal.test.ts. Thay đổi camera hoặc nguồn dữ liệu thuộc module Globe.
