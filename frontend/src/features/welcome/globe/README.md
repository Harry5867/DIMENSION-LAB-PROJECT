# Globe

Một component điều phối và renderer dùng chung cho ba chế độ.

## Điểm vào và trách nhiệm

- [DataGlobe](DataGlobe.tsx) — Quản lý camera, việc đổi mode, controls và vòng lặp vẽ.

- [Renderer](globeScene.ts) — Tạo cảnh Three.js và đường dự phòng Canvas.

- [Atlas](atlas/README.md) — Địa lý và tương tác thủ đô.

- [Terrain](terrain/README.md) — Mô hình độ nổi từ dữ liệu dân số.

- [Stories](stories/README.md) — Các địa điểm và hình ảnh minh họa.

## Luồng dữ liệu và trạng thái

Dữ liệu chế độ được nạp khi cần. Layer dùng camera chung, chiếu marker lên màn hình và giải phóng tài nguyên khi unmount.

## Kiểm thử và phạm vi thay đổi

Dùng npm test và npm run build. Mở ba mode tuần tự trên trình duyệt, kiểm tra tương tác và tải dữ liệu.

## Ràng buộc khi bảo trì

Đổi mode giữ một renderer. Giữ kiểm tra khả năng WebGL, giới hạn pixel và vòng đời animation frame.

## Tài liệu liên quan

[Welcome](../README.md)

## Ghi chú bảo trì cho người và AI

Nếu lỗi xuất hiện khi chuyển mode, kiểm tra DataGlobe trước rồi lần theo layer trong globeScene. Đối chiếu camera, listener và dispose khi dữ liệu tải muộn hoặc renderer mất ngữ cảnh.
