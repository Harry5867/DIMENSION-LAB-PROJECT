# Nhãn điểm dữ liệu theo dataset

## Mục tiêu

Hiển thị nhãn gốc của từng dòng dữ liệu ngay trên biểu đồ 3D, bên cạnh thông tin cụm được tạo bởi thuật toán. Ví dụ, bộ dữ liệu ung thư vú hiển thị `M` hoặc `B` trên điểm; nhãn được lấy từ dataset thay vì viết cố định trong giao diện.

## Cách hoạt động

- Nhãn lấy từ cột label mà hệ thống nhận diện cho dataset.
- Nút **Point labels** trên thanh công cụ 3D bật/tắt nhãn.
- Với dataset có tối đa 180 dòng, nhãn xuất hiện trên mọi điểm.
- Với dataset lớn hơn, nhãn chỉ xuất hiện ở điểm đang rê chuột hoặc đã chọn để hạn chế chồng lấp.
- Dataset không có giá trị nhãn thì nút bị vô hiệu hóa.
- Tooltip khi rê chuột vẫn hiển thị nhãn, cụm, tọa độ và các đặc trưng của điểm.

## Tệp liên quan

- `frontend/src/features/visualization/scene/pointLabels.ts` — chọn các điểm cần hiện nhãn theo kích thước dataset.
- `frontend/src/features/visualization/components/ThreeCanvas.tsx` — vẽ nhãn trên biểu đồ và cung cấp nút bật/tắt.
- `frontend/src/shared/styles/index.css` — lớp phủ nhãn trên canvas.
- `tests/unit/pointLabels.test.ts` — kiểm tra nhãn dataset nhỏ và cách xử lý dataset lớn.

## Kiểm tra

Đã xác nhận nhãn `M` hiển thị trên điểm của bộ ung thư vú khi rê chuột. Các lệnh `npm test` (100 bài), `npm run lint`, `npm run build` và `git diff --check` đều thành công.
