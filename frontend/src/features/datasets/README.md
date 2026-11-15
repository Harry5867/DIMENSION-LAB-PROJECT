# Datasets

Quản lý nguồn dữ liệu tabular dùng trong Model.

## Điểm vào và trách nhiệm

- [DatasetsPage](components/DatasetsPage.tsx) — Danh sách, xem trước, tải và đổi tên dataset.

- [RawDataModal](components/RawDataModal.tsx) — Xem hàng và đặc trưng gốc.

- [CSV parser](../../../../packages/algorithms/src/dataParser.ts) — Đọc CSV và lấy ma trận số.

- [Workspace](../../app/App.tsx) — Giữ dataset đang dùng và phối hợp chuyển kết quả.

## Luồng dữ liệu và trạng thái

CSV và metadata đi qua API hoặc nguồn mẫu cục bộ theo chế độ. Workspace giữ dataset, đặc trưng đang chọn và thứ tự hàng. Atlas phục vụ dữ liệu riêng theo chủ sở hữu.

## Kiểm thử và phạm vi thay đổi

Chạy npm test và npm run test:api. Dùng fixtures cho ô trống, số 0, ID trùng và CSV sai định dạng.

## Ràng buộc khi bảo trì

Giữ thứ tự hàng và định danh hàng nguồn, kể cả khi ID hiển thị trùng nhau. Đối chiếu bytes CSV gốc khi sửa luồng download.

## Tài liệu liên quan

[Data](../../../../data/README.md) · [Analysis](../analysis/README.md)

## Ghi chú bảo trì cho người và AI

Trước khi đổi header, CSV preview hoặc nhận diện kiểu, xem parser và repository backend. Chạy test API và test parser. Giới hạn upload là 5 MiB, 10.000 hàng và 128 cột. Dữ liệu mẫu tích hợp chỉ đọc.
