# Đăng nhập và phiên trình duyệt

Giao diện đăng nhập demo, Google OAuth và tài khoản email/mật khẩu trong chế độ Atlas.

## Điểm vào và trách nhiệm

- [LoginPanel](components/LoginPanel.tsx) — Đọc tùy chọn xác thực và hiển thị form tương ứng, gồm chuyển giữa đăng ký và đăng nhập.

- [Session adapter](../../shared/api/demoSession.ts) — Giữ phiên demo theo bộ nhớ và sessionStorage.

- [Entry](../../app/Entry.tsx) — Kiểm tra phiên, điều hướng và đăng xuất.

- [Network](../../shared/api/network.ts) — Đính kèm token demo và xử lý phiên hết hạn.

## Luồng dữ liệu và trạng thái

Backend cung cấp tùy chọn qua `GET /api/auth/options`. Demo dùng Bearer token hoặc phiên offline của workspace mẫu. Google và mật khẩu trong chế độ Atlas dùng cookie phiên do Express cấp. Sau khi đăng ký thành công, người dùng quay về form đăng nhập và nhập lại mật khẩu.

Đăng ký bằng mật khẩu khả dụng trong môi trường Atlas thử nghiệm. Backend dùng Argon2id và lưu tài khoản trong `password_users`. Tài khoản Google vẫn dùng collection `users`.

## Kiểm thử và phạm vi thay đổi

Chạy npm test và npm run test:api. Kiểm tra đăng nhập và đăng xuất demo ở localhost. Dùng Atlas dev đã xác nhận cho bài kiểm thử Google thật.

## Ràng buộc khi bảo trì

Giữ URL callback, tình huống hết hạn, yêu cầu nhạy cảm với cookie, cơ chế hủy request và fallback demo hiện có. Chỉ dùng dữ liệu mẫu khi nghiệm thu demo.

## Tài liệu liên quan

[Google và Atlas](../../../../docs/google-atlas.md) · [Backend](../../../../backend/README.md)

## Ghi chú bảo trì cho người và AI

Bắt đầu ở LoginPanel.tsx, shared/api/network.ts và server routes auth để đổi thông báo lỗi. Khi sửa phiên, đối chiếu Entry, cookie và Bearer token. Nghiệm thu Google thật cần tài khoản thử và Atlas dev.
