# Terrain

Mật độ dân số được biểu diễn trên mặt cầu.

## Điểm vào và trách nhiệm

- [Dữ liệu](terrainData.ts) — Nạp metadata và lưới nhị phân, có tập dữ liệu thưa dự phòng.

- [Bề mặt](terrainSurface.ts) — Hình học cầu, thay đổi độ cao và picking.

- [WebGL](terrainGeometry.ts) — Mesh GPU và wireframe.

- [Canvas](terrainCanvas.ts) — Phương án vẽ bề mặt trên Canvas.

- [Controls](TerrainControls.tsx) — Điều chỉnh độ cao, làm mượt, wireframe và nguồn.

## Luồng dữ liệu và trạng thái

File nhị phân và metadata phải khớp kích thước. Renderer dùng chung lựa chọn layer theo mode. Giao diện nguồn phân biệt dữ liệu thiếu với mật độ bằng 0.

## Kiểm thử và phạm vi thay đổi

Chạy npm test, xem terrain.test.ts, rồi npm run build. Kiểm tra asset nhị phân và trạng thái tải từ trình duyệt.

## Ràng buộc khi bảo trì

Giữ URL tương đối với import.meta.url và dữ liệu gốc. Surface smoothing thay đổi trường hiển thị, còn dữ liệu nguồn phục vụ việc tra cứu.

## Tài liệu liên quan

[Globe](../README.md) · [Nguồn Terrain](../../../../../../docs/TERRAIN_SOURCE.md)

## Ghi chú bảo trì cho người và AI

Trước khi đổi độ nổi hoặc màu, xem terrainData.ts, surface và shader trong terrainGeometry.ts. Mật độ dân số năm 2020 đo theo người/km². Display dùng thang log và ngưỡng P98. Khi tra cứu, đọc ô nguồn. Giữ phân biệt dữ liệu thiếu với mật độ bằng 0 và xem độ phân giải trong tài liệu nguồn.
