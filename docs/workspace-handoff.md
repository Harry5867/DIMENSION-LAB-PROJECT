# Tiếp tục dự án DIMENSION / LAB

Mở thư mục gốc chứa `package.json`. Đây là bản làm việc cục bộ, gồm các tệp mã nguồn mới và các thay đổi đang có trong thư mục dự án.

## Giao diện đã chốt

- Khi mở hoặc tải lại trang chủ, màn hình chờ tương tác. Bấm, chạm hoặc dùng Tab rồi Enter để phát intro Big Bang.
- Bộ chọn English và Tiếng Việt nằm ở trang chủ. Cài đặt áp dụng cho toàn bộ giao diện và được giữ khi tải lại.
- Workspace dùng bản đồ năm điểm Theory, Model, About us, User Guide và Datasets. Model là tâm, bốn nhánh cố định nối trực tiếp tới bốn section còn lại. Rê chuột hoặc focus chỉ đổi nhánh được chiếu sáng. Bấm tên hoặc biểu tượng để mở mục.
- Vệt sáng ngắn và đốm dẫn đường chạy dọc nhánh từ Model đến section đang chọn, dừng tại điểm khi bấm. Model có vòng sáng nhẹ khi được chọn. Điện thoại xếp Model ở giữa tuyến dọc, các đường nối vẫn xuất phát từ Model. Vệt sáng nằm trong bản đồ, hỗ trợ giao diện sáng, tối và chế độ giảm chuyển động. Hoạt ảnh dừng khi vùng bản đồ khuất, tab ẩn hoặc đang chuyển trang.
- Chuyển cảnh Theory lấy vị trí từ nhãn trên bản đồ, dùng nhịp mở 340 ms và nhịp đưa chữ vào tiêu đề 240 ms. Bốn bìa sách xuất hiện cùng lúc và nổi lên khi rê chuột.

## Tệp chính

- `src/components/WorkspaceMap.tsx` và `src/components/workspace-map.css` điều khiển bố cục, điểm điều hướng và vệt sáng.
- `src/components/SectionTransition.tsx` và `src/utils/sectionTransition.ts` xử lý chuyển cảnh và đo vị trí nhãn nguồn.
- `src/components/Welcome.tsx`, `src/components/WelcomeSettings.tsx` và `src/components/WelcomeLanguage.tsx` xử lý intro và lựa chọn ngôn ngữ.

## Chạy và kiểm tra

```powershell
npm run dev -- --host 127.0.0.1 --port 3001 --strictPort
```

Mở [bản xem trước](http://127.0.0.1:3001/) và dùng tài khoản mẫu để vào Workspace. Để chạy cả frontend và API, dùng `npm run dev:all` và mở địa chỉ Vite in ra.

Bản cuối đã qua `npm run build` và 71/71 bài kiểm thử với `npm test`. Chrome đã kiểm tra cả năm mục và giới hạn vệt sáng trên desktop lẫn điện thoại.

Xem [lộ trình hoàn thiện sản phẩm](./dimension-lab-product-roadmap.md) để tiếp tục phần frontend, backend và cơ sở dữ liệu.
