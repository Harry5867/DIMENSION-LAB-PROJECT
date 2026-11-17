# Algorithms

Mã tính toán TypeScript dùng bởi Worker, Express và script. Package phụ thuộc vào Contracts và Papa Parse. Worker được khởi tạo phía frontend.

| Điểm vào | Chức năng |
|---|---|
| [dataParser.ts](src/dataParser.ts) | CSV, giới hạn đầu vào, xử lý thiếu và chuẩn hóa. |
| [projection.ts](src/projection.ts) | Điều phối và kiểm tra cấu hình PCA, t-SNE, UMAP. |
| [clustering.ts](src/clustering.ts) | K-Means, DBSCAN, GMM, outliers và metrics trên tọa độ 3D. |
| [analysisTasks.ts](src/analysisTasks.ts) | Kiểm tra và thực hiện Isolation Forest, Apriori. |
| [metrics.ts](src/metrics.ts) | Silhouette, ARI và các thống kê cụm. |

Chạy `npm test` và `npm run test:api` từ root. Với thay đổi logic, đối chiếu theo fixture và seed. Giữ thứ tự hàng, kiểu dữ liệu thiếu, tham số mặc định, điểm nhiễu và cách tính chỉ số. Module cần chạy được ở cả Node và Worker trình duyệt.

[Contracts](../contracts/README.md) · [Luồng phân tích](../../docs/architecture/data-flow.md)

## Ghi chú bảo trì cho người và AI

Trước khi sửa chữ ký, tìm nơi dùng trong Worker, service Express và script tạo case studies. Giữ ma trận hình chữ nhật, giá trị hữu hạn, giới hạn kích thước. GMM và Isolation Forest có seed. K-Means, t-SNE và UMAP dùng Math.random, nên test đối chiếu cần cố định ngẫu nhiên hoặc kiểm tra bất biến số học.
