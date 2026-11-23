# Explore và pipeline phân tích

Chuẩn bị dữ liệu, giảm chiều, phân cụm và đánh giá kết quả.

## Điểm vào và trách nhiệm

- [Run analysis](runAnalysis.ts) — Điều phối API giảm chiều và hai thao tác Worker giảm chiều hoặc phân cụm.

- [Exploration](exploration.ts) — Snapshot, nhãn cấu hình, ghép hàng và đánh giá sau chỉnh sửa.

- [Workers](workers/projectionWorker.ts) — Quản lý message, vòng đời và hủy tác vụ.

- [Unsupervised](components/UnsupervisedPanel.tsx) — Isolation Forest và Apriori qua Worker riêng.

- [Workspace](../../app/App.tsx) — Giữ trạng thái lần chạy, công bố kết quả sau chuyển cảnh.

## Luồng dữ liệu và trạng thái

Dataset → chuẩn hóa → giảm chiều qua API hoặc Worker dự phòng → phân cụm trong Worker khi áp dụng → công bố tọa độ và metrics. Unsupervised lưu tối đa 5 kết quả theo tài khoản trên Atlas. Chế độ demo giữ lịch sử trong bộ nhớ của phiên Workspace.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, npm run test:api và npm run build. Kiểm tra PCA, UMAP, t-SNE, cả lần chạy thất bại và đổi dataset khi đang tính.

## Ràng buộc khi bảo trì

Giữ cấu hình đã thực thi cùng kết quả, giới hạn thuật toán, AbortSignal, thứ tự hàng và tính toán theo đúng hệ tọa độ. Worker entry và URL dùng cùng feature.

## Tài liệu liên quan

[Algorithms](../../../../packages/algorithms/README.md) · [Visualization](../visualization/README.md)

## Ghi chú bảo trì cho người và AI

Đổi điều khiển ở ControlSidebar. Đổi luồng chạy ở runAnalysis.ts rồi kiểm tra App.tsx và projectionWorker.ts. Đối chiếu fixture theo seed khi sửa ngữ nghĩa số học. t-SNE và UMAP hỗ trợ tối đa 1.000 hàng.
