# Trực quan hóa 3D

Cảnh khoa học trong Model và thao tác camera, selection.

## Điểm vào và trách nhiệm

- [ThreeCanvas](components/ThreeCanvas.tsx) — Tạo và giải phóng renderer, controls và overlay.

- [Cloud](scene/plotCloud.ts) — Ghép theo hàng nguồn, nội suy tọa độ, chuyển màu hoặc fade.

- [Camera](scene/plotViewCamera.ts) — Điều chỉnh góc nhìn và hiệu ứng con trỏ.

- [Inspector](components/DataInspector.tsx) — Hiển thị điểm đã chọn.

## Luồng dữ liệu và trạng thái

Workspace đưa snapshot kết quả và chế độ màu vào canvas. Scene phát lựa chọn điểm theo hàng nguồn. Khi phân tích mới về, workspace phối hợp chuyển cảnh rồi cập nhật kết quả.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, xem plotCloud.test.ts. Trình duyệt kiểm tra xoay, zoom, fullscreen, chọn điểm, đổi dataset và chạy lại trên dataset cũ.

## Ràng buộc khi bảo trì

Giữ canvas, camera và mức zoom qua cập nhật. Đối chiếu selection, cụm, chú giải với đúng snapshot. Dọn listener, animation frame, vật liệu và geometry khi tháo cảnh.

## Tài liệu liên quan

[Analysis](../analysis/README.md) · [Experiments](../experiments/README.md)

## Ghi chú bảo trì cho người và AI

Nếu chuyển kết quả làm mất selection, xem plotCloud.ts và phần công bố snapshot trong App. Kiểm tra rowIndex với ID hiển thị trùng, hủy giữa transition và camera hiện tại. Test Node cần được bổ sung bằng nghiệm thu GPU và thao tác trên thiết bị.
