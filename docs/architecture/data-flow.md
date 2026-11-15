# Luồng dữ liệu

1. CSV được đọc và giữ thứ tự từng hàng. Dataset chọn cột số, nhãn và ID theo parser.
2. Explore chụp cấu hình trước khi chạy. Matrix được chuẩn hóa tại browser. Backend nhận matrix đã chuẩn hóa để chiếu. Browser Worker dự phòng theo trường hợp lỗi hiện có.
3. Khi áp dụng phân cụm, Worker tính trên tọa độ chiếu. Metrics được tính cùng các nhãn đó. Workspace có token tác vụ và AbortSignal để loại phản hồi cũ.
4. Màn hình hiển thị các điểm theo rowIndex và giữ cấu hình đã chạy cùng metrics và export. Giá trị mặc định, seed và thứ tự dữ liệu nằm ở [Algorithms](../../packages/algorithms/README.md).
5. Lịch sử được quản lý qua API. Anomaly/Association có vòng xử lý và lưu cục bộ riêng.

[Analysis](../../frontend/src/features/analysis/README.md) · [Visualization](../../frontend/src/features/visualization/README.md)
