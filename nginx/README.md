# Nginx

[nginx.conf](nginx.conf) là cấu hình triển khai tham chiếu. Nó phục vụ bản build tại `/var/www/explorer/dist` và chuyển các yêu cầu `/api/` đến Express ở `127.0.0.1:5000`. Cấu hình còn khai báo HTTPS, đường dẫn chứng chỉ và giới hạn request.

Khi thay đổi cấu hình triển khai, kiểm tra `nginx -t` trên máy đích, gọi `/api/health` qua proxy và xác minh asset, tải CSV, OAuth callback và các URL hash. Kết quả kiểm thử Vite cục bộ xác minh proxy phát triển.

[Backend](../backend/README.md) · [Kiến trúc](../docs/architecture/system-overview.md)
