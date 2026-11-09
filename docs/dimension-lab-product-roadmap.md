# Lộ trình hoàn thiện Dimension Lab

Tài liệu theo dõi các việc cần làm để đưa Dimension Lab từ bản demo phân tích dữ liệu đến bản beta cho người dùng thật. Đánh dấu `[x]` khi một mục đạt tiêu chí kiểm tra. Ghi quyết định, người phụ trách và bằng chứng kiểm tra vào từng mục khi triển khai.

## Hiện trạng đã kiểm tra

- [x] Có Welcome, Workspace, Theory, Guide, thư viện dữ liệu và Model. Model hỗ trợ nhập CSV, giảm chiều, phân cụm, khảo sát 3D và xuất kết quả. Isolation Forest và Apriori có dashboard riêng.
- [x] Express có API cho dataset, tính toán, lịch sử và cache. Dự án có lớp kết nối MongoDB và cấu hình Nginx mẫu.
- [x] Tại lần đánh giá ngày 09/11/2026, API cục bộ phản hồi, có hai dataset mẫu và 71 bài kiểm thử đạt.
- [ ] Thay đăng nhập demo bằng phiên đăng nhập thật. Khi kiểm tra, `/api/auth/me` nhận yêu cầu không có thông tin đăng nhập và trả vai trò `admin`. Xem [middleware hiện tại](../server/auth.ts).
- [ ] Thiết lập lưu bền vững. Phiên cục bộ khi đánh giá dùng RAM. Một số luồng ghi có thể trả thành công dù MongoDB ghi thất bại. Xem [lớp lưu trữ](../server/db.ts).
- [ ] Thống nhất lịch sử. Experiments khôi phục cấu hình để chạy lại. Anomaly và Association lưu riêng trong trình duyệt. Xem [Model](../src/App.tsx) và [dashboard phân tích](../src/components/UnsupervisedPanel.tsx).

## P0 · Tài khoản và dữ liệu riêng tư

- [ ] Kết nối Sign in và Sign out với phiên do máy chủ quản lý. Dùng cookie `HttpOnly`, `Secure` trên HTTPS và cấu hình bảo vệ CSRF phù hợp.
- [ ] Tách demo sang dữ liệu mẫu công khai. Yêu cầu phiên hợp lệ cho API riêng tư và kiểm tra quyền sở hữu trên từng dataset và lần chạy.
- [ ] Thiết lập MongoDB cho môi trường beta, tách khỏi dữ liệu phát triển. Phân biệt trạng thái lưu bền vững, lưu tạm và lỗi ghi trên giao diện.
- [ ] Đặt giới hạn dung lượng CSV, số dòng, số cột và số tác vụ đồng thời. Trả lỗi có hướng dẫn khi vượt giới hạn.
- [ ] Kiểm tra bằng hai tài khoản. Mỗi tài khoản chỉ đọc và sửa được dữ liệu được cấp quyền. Yêu cầu không có phiên bị chặn ở API riêng tư.
- [ ] Khởi động lại máy chủ và xác nhận dataset đã lưu vẫn mở được. Thử ngắt database và kiểm tra thông báo lỗi lưu.

## P1 · Hoàn thiện luồng sử dụng

Luồng đầu tiên cần hoàn thành là **nhập CSV → xem trước → chạy PCA và K-Means → lưu → mở lại kết quả → xuất**.

- [ ] Thêm bước xem trước CSV để chọn cột ID, nhãn và đặc trưng. Hiển thị số dòng, giá trị thiếu và các cột bị loại trước khi chạy.
- [ ] Phân biệt kết quả đã chạy với cấu hình đang sửa. Hiển thị trạng thái chờ, đang chạy, hoàn thành, lỗi và hủy.
- [ ] Mở lại đúng kết quả và biểu đồ từ lịch sử. Lưu phiên bản dataset, cấu hình, tham số ngẫu nhiên khi có và phiên bản thuật toán.
- [ ] Dùng cùng mô hình lưu lần chạy cho giảm chiều, phân cụm, Isolation Forest và Apriori. Hiển thị rõ phạm vi và dữ liệu chứa trong tệp xuất.
- [ ] Hoàn thiện luồng bàn phím, mobile, văn bản lỗi và About us. Kiểm tra người dùng có thể hoàn tất luồng mà không cần hướng dẫn trực tiếp.

## P1 · Thiết kế lưu trữ đề xuất

Giữ MongoDB cho tài khoản, metadata và lần chạy. Dùng kho tệp riêng cho CSV gốc và kết quả lớn khi vượt phạm vi bộ mẫu. Phân trang dữ liệu trả về để bảng chỉ tải các dòng cần xem.

| Nhóm dữ liệu | Nội dung cần lưu |
| --- | --- |
| `users`, `sessions` | Tài khoản, quyền và hạn phiên. Thêm workspace và thành viên khi cần chia sẻ nhóm. |
| `datasets` | Chủ sở hữu, tên, schema cột, số dòng, mã băm, phiên bản và tham chiếu tệp. |
| `analysis_runs` | Chủ sở hữu, phiên bản dataset, thuật toán, tham số, seed, trạng thái, chỉ số và kết quả hoặc tham chiếu kết quả. |
| `compute_cache` | Kết quả tạm để tăng tốc, có hạn dùng và giới hạn dung lượng riêng. |

- [ ] Tạo chỉ mục cho các truy vấn theo chủ sở hữu, dataset và thời gian.
- [ ] Quy định thời gian lưu, xóa và khôi phục dữ liệu. Kiểm tra bản sao lưu bằng một lần phục hồi thử.
- [ ] Lưu thay đổi schema bằng mã có phiên bản. Chuẩn bị cách xử lý các dataset và thí nghiệm đã có.

## P2 · Hiệu năng và phát hành

- [ ] Chuyển tác vụ nặng ra nhóm worker có giới hạn. Kiểm tra một lần chạy lớn vẫn cho phép API phản hồi các thao tác nhẹ.
- [ ] Đo Model trên laptop dùng GPU tích hợp và điện thoại. Xác định giới hạn số điểm vẽ, độ phân giải và chế độ xem thay thế. Giữ liên kết từ điểm hiển thị về dòng dữ liệu gốc.
- [ ] Tạo staging với HTTPS và database riêng. Tự động build, kiểm thử và chạy kiểm tra luồng từ đăng nhập đến xuất kết quả.
- [ ] Theo dõi lỗi, thời gian chạy, bộ nhớ, trạng thái database và dung lượng lưu trữ. Có cách quay lại bản trước nếu phát hành lỗi.
- [ ] Cập nhật tài liệu triển khai theo hệ thống đã chạy và ghi rõ các thành phần hạ tầng chỉ nằm trong thiết kế tham khảo.

## Ghi nhận các chỉnh sửa giao diện tiếp theo

| Màn hình | Vấn đề hiện tại | Kết quả mong muốn | Trạng thái |
| --- | --- | --- | --- |
| | | | |

## Tài liệu đối chiếu

- [Cẩm nang kiến trúc full-stack](../SYSTEM_ARCHITECTURE_AND_FULLSTACK_HANDBOOK.md)
- [Luồng Workspace và nội dung Portal](./portal.md)
- [Cấu hình triển khai Nginx mẫu](../nginx/nginx.conf)
