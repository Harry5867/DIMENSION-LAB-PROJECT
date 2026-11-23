# Luồng dữ liệu

## Ví dụ đầy đủ qua HTTP

1. Datasets gửi tệp từ component vào hook useDatasets. Hook kiểm tra nhanh CSV, quản lý danh sách dataset và gọi datasetsApi.
2. datasetsApi đóng gói FormData và gửi POST /api/datasets/upload qua HTTP client dùng chung.
3. Express tạo X-Request-Id, xác thực phiên, kiểm tra vai trò, rồi Multer đọc tệp. Route chuyển tên và bytes sang service dataset.
4. Service kiểm tra UTF-8 và cấu trúc CSV, tạo dataset, rồi yêu cầu repository lưu. Atlas lưu metadata trong MongoDB và lưu tệp gốc trong GridFS. Demo lưu trong bộ nhớ.
5. Handler trả HTTP 201. Payload JSON nằm trong data. HTTP client kiểm tra status và đọc JSON. API adapter kiểm tra cấu trúc dataset trước khi hook cập nhật danh sách. Workspace mở dataset và dựng biểu đồ.

Khi gỡ lỗi, dùng X-Request-Id trong Network để tìm yêu cầu tương ứng trong log backend. Phản hồi JSON lỗi có error.code và error.message. Các route tải CSV trả stream.

## Phân tích

1. CSV được đọc và giữ thứ tự từng hàng. Dataset chọn cột số, nhãn và ID theo parser.
2. Explore chụp cấu hình trước khi chạy. Matrix được chuẩn hóa tại browser. Backend nhận matrix đã chuẩn hóa để chiếu. Browser Worker dự phòng theo trường hợp lỗi hiện có.
3. Khi áp dụng phân cụm, Worker tính trên tọa độ chiếu. Metrics được tính cùng các nhãn đó. Workspace có token tác vụ và AbortSignal để loại phản hồi cũ.
4. Màn hình hiển thị các điểm theo rowIndex và giữ cấu hình đã chạy cùng metrics và export. Giá trị mặc định, seed và thứ tự dữ liệu nằm ở [Algorithms](../../packages/algorithms/README.md).
5. Anomaly và Association có vòng phân tích riêng trong Worker. Lịch sử của hai chức năng này đồng bộ riêng theo tài khoản qua API ở chế độ Atlas và giữ trong phiên ở chế độ demo.

[Analysis](../../frontend/src/features/analysis/README.md) · [Visualization](../../frontend/src/features/visualization/README.md)
