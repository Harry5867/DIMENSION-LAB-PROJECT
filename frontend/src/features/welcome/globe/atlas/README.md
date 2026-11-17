# Atlas

Quả cầu địa lý và điểm thủ đô.

## Điểm vào và trách nhiệm

- [Địa lý](atlasLines.ts) — Tọa độ, lưới và đường biên.

- [Tương tác](globeInteraction.ts) — Lân cận, thao tác và kết nối các điểm.

- [Dữ liệu địa lý](../../data/globe-data.json) — Bản ghi tọa độ và mã quốc gia.

## Luồng dữ liệu và trạng thái

Dữ liệu địa lý → tọa độ cầu → điểm hiển thị theo camera chung. DataGlobe giữ focus, tìm kiếm, lớp hiển thị và đánh dấu Hà Nội.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, xem portal.test.ts. Trên trình duyệt tìm thủ đô, chuyển lớp rồi đổi mode và quay lại.

## Ràng buộc khi bảo trì

Giữ toạ độ gốc, nhận diện mã quốc gia và giới hạn kết nối theo con trỏ.

## Tài liệu liên quan

[Globe](../README.md)

## Ghi chú bảo trì cho người và AI

Đọc atlasLines.ts và globeInteraction.ts trước khi đổi marker. Kiểm tra tìm kiếm, chọn theo bàn phím và tính lân cận trên cùng tọa độ. Kiểm tra đường dẫn cờ trong bản build khi đổi asset.
