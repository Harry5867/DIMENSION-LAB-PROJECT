# Kiến trúc frontend

Ứng dụng React một trang định tuyến theo hash. Entry kiểm tra phiên và chuyển giữa Welcome, Portal và Model. Theme và ngôn ngữ được áp dụng ở main. App giữ trạng thái workspace và công bố kết quả sau chuyển cảnh. Mỗi feature có README và các điểm vào được liên kết ở [Frontend](../../frontend/README.md).

Các Worker nằm cạnh pipeline phân tích để Vite phát hiện URL module. Quả cầu giữ renderer chung cho ba chế độ. Scene của Explore có camera và selection riêng.
