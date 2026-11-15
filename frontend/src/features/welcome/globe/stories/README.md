# Stories

Các câu chuyện minh họa gắn với địa điểm thật.

## Điểm vào và trách nhiệm

- [Mô hình dữ liệu](storyData.ts) — Kiểm tra bản ghi, gom marker và lọc theo chủ đề.

- [Điểm tương tác](StoryMarkers.tsx) — Nhãn, marker và lựa chọn.

- [Controls](StoryControls.tsx) — Bộ lọc, xem nội dung và chọn địa điểm.

- [Dữ liệu](../../data/stories-demo.json) — 21 câu chuyện minh họa.

## Luồng dữ liệu và trạng thái

Danh mục và ảnh tải cục bộ. Story layer chia sẻ quả cầu, camera và mode với Atlas và Terrain.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, xem stories.test.ts. Kiểm tra lọc theo chủ đề, chọn ảnh và chuyển mode.

## Ràng buộc khi bảo trì

Giữ ghi nguồn, giấy phép và thông tin truy xuất về ảnh. Marker nhóm cần giữ khả năng truy cập từng câu chuyện.

## Tài liệu liên quan

[Globe](../README.md) · [Nguồn ảnh](../../../../../../public/stories/README.md)

## Ghi chú bảo trì cho người và AI

Thêm bản ghi từ JSON và schema trong storyData.ts. Kiểm tra mã địa lý, chủ đề, trạng thái concept, ID duy nhất, ảnh và ghi nguồn. Chạy stories.test.ts.
